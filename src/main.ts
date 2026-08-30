import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
	Debouncer,
	Editor,
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
	WorkspaceLeaf,
	debounce,
} from "obsidian";
import { registerContextMenu } from "./editor/context-menu";
import {
	commentAt,
	commentField,
	flashComment,
	obeliskEditorExtension,
	setActiveComment,
	setComments,
	trackedRange,
} from "./editor/highlight-extension";
import { highlightQuoteInSection } from "./editor/reading-view";
import { ObeliskSettingTab } from "./settings";
import {
	frameFromState,
	makeAnchor,
	pendingAnchorWrites,
	resolveAll,
} from "./store/anchors";
import { CommentStore } from "./store/frontmatter";
import { applySuggestion } from "./suggestion/apply";
import {
	Comment,
	DEFAULT_SETTINGS,
	ObeliskSettings,
	Reply,
	ResolvedComment,
	VIEW_TYPE_OBELISK,
} from "./types";
import { CommentDraft, CommentModal } from "./view/comment-modal";
import { ObeliskSidebarView } from "./view/sidebar-view";
import { newCommentId } from "./util/id";

/** How long the editor has to be quiet before drifted anchors are written. */
const ANCHOR_FLUSH_DELAY = 1500;

/** How long a jumped-to highlight pulses. */
const FLASH_DURATION = 700;

/**
 * Obelisk — inline comments and suggested edits for Obsidian.
 *
 * This class is the wiring hub and the only thing that mutates state. The
 * editor extension, the sidebar and the modal all call back into it.
 *
 * Data flow:
 *
 *   frontmatter ──CommentStore.read──▶ Comment[]
 *        ▲                                │
 *        │                        anchors.resolveAll
 *   CommentStore.update                   ▼
 *        │                        ResolvedComment[]
 *        │                          ╱          ╲
 *        └──── user action ◀── sidebar      editor decorations
 */
export default class ObeliskPlugin extends Plugin {
	settings!: ObeliskSettings;
	store!: CommentStore;

	/** The view whose drifted anchors we owe a write to. */
	private tracking: MarkdownView | null = null;
	/**
	 * The last markdown view that had focus. Focus moving to the sidebar (or
	 * anywhere else) doesn't mean the reader left the note, so this is what
	 * "the note we're commenting on" means everywhere below.
	 */
	private lastMarkdownView: MarkdownView | null = null;
	/** Guards against a flush re-entering through its own metadata event. */
	private flushing = false;
	private scheduleFlush!: Debouncer<[], void>;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new CommentStore(this.app);
		this.scheduleFlush = debounce(
			() => void this.flushAnchors(),
			ANCHOR_FLUSH_DELAY,
			true,
		);

		this.registerView(
			VIEW_TYPE_OBELISK,
			(leaf) => new ObeliskSidebarView(leaf, this),
		);

		this.registerEditorExtension(
			obeliskEditorExtension({
				onSelect: (id, opts) => void this.revealComment(id, opts),
				onDrift: () => this.scheduleFlush(),
			}),
		);

		registerContextMenu(this);
		this.addSettingTab(new ObeliskSettingTab(this.app, this));

		this.addRibbonIcon("message-square", "Open comments", () =>
			this.openSidebar(),
		);

		this.addCommand({
			id: "open-comments-sidebar",
			name: "Open comments sidebar",
			callback: () => this.openSidebar(),
		});

		this.addCommand({
			id: "add-comment",
			name: "Add comment on selection",
			editorCallback: (editor, view) => {
				if (view instanceof MarkdownView) {
					this.startComment(editor, view, { withSuggestion: false });
				}
			},
		});

		this.addCommand({
			id: "suggest-edit",
			name: "Suggest an edit for selection",
			editorCallback: (editor, view) => {
				if (view instanceof MarkdownView) {
					this.startComment(editor, view, { withSuggestion: true });
				}
			},
		});

		// Requirement 5 in Reading view. Separate anchoring path: rendered DOM
		// has no line numbers, so it matches on the quoted text within the
		// section `ctx.getSectionInfo` reports.
		this.registerMarkdownPostProcessor((el, ctx) =>
			this.decorateReadingView(el, ctx),
		);

		// Re-render whenever the active file changes or its metadata is
		// re-parsed (which is how we learn that frontmatter changed).
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				void this.onActiveViewChanged();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				void this.onActiveViewChanged();
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (this.flushing) return;
				if (file.path === this.activeFile()?.path) this.refresh();
			}),
		);
		// At startup the open note's frontmatter may not be parsed yet, and a
		// file already in the queue never fires "changed" — so the first read
		// can come back empty. This fires when the cache goes quiet; the
		// sidebar no-ops when nothing actually changed.
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => {
				if (this.flushing) return;
				this.refresh();
			}),
		);

		this.app.workspace.onLayoutReady(() => void this.onActiveViewChanged());
	}

	onunload(): void {
		// Views are torn down by Obsidian, but anchors that drifted since the
		// last debounce are still only in CodeMirror's head.
		this.scheduleFlush.cancel();
		void this.flushAnchors(this.tracking);
	}

	// ── State ────────────────────────────────────────────────────────────────

	/**
	 * Recompute everything and push it to both consumers.
	 *
	 * This is not on the typing path — it runs on file switches and on
	 * frontmatter changes only. Live edits are handled inside CodeMirror by
	 * mapping the existing ranges, which is why this can afford to be
	 * unconditional rather than cached.
	 */
	refresh(): void {
		const { file, comments } = this.activeComments();

		this.sidebar()?.setComments(file, comments);
		if (!file) return;

		// Every leaf showing this note, not just the active one: a note open in
		// a split has a CodeMirror view per leaf, and they all need the
		// decorations. The offsets are shared because the text is.
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const md = leaf.view;
			if (!(md instanceof MarkdownView)) continue;
			if (md.file?.path !== file.path) continue;
			this.editorView(md)?.dispatch({
				effects: setComments.of(comments),
			});
		}
	}

	/**
	 * The current note and its resolved comments.
	 *
	 * Pull as well as push: a sidebar that Obsidian restores (or un-defers)
	 * after the last `refresh` has no way to know what it missed, so it asks
	 * for this in `onOpen` rather than waiting for the next event.
	 */
	activeComments(): { file: TFile | null; comments: ResolvedComment[] } {
		const view = this.activeMarkdownView();
		const file = view?.file ?? null;
		return {
			file,
			comments: file ? this.resolveFor(file, view) : [],
		};
	}

	/** Resolve a file's stored anchors against the document as it stands. */
	private resolveFor(
		file: TFile,
		view: MarkdownView | null,
	): ResolvedComment[] {
		const comments = this.store.read(file);
		if (comments.length === 0) return [];

		const state = this.documentState(file, view);
		if (!state) {
			return comments.map((c) => ({
				...c,
				range: null,
				state: "orphaned" as const,
			}));
		}

		return resolveAll(comments, state, frameFromState(state), {
			reanchor: this.settings.enableReanchoring,
		});
	}

	/**
	 * The CodeMirror state to anchor against.
	 *
	 * Normally the live editor's own. In Reading view the editor exists but may
	 * not have a CM instance attached, so fall back to a throwaway state built
	 * from the same text — anchoring only needs a document, not a view.
	 */
	private documentState(
		file: TFile,
		view: MarkdownView | null,
	): EditorState | null {
		const cm = this.editorView(view);
		if (cm) return cm.state;
		if (!view || view.file?.path !== file.path) return null;
		return EditorState.create({ doc: view.editor.getValue() });
	}

	// ── Actions ──────────────────────────────────────────────────────────────

	/** Requirement 6 lands here, from either the context menu or a command. */
	startComment(
		editor: Editor,
		view: MarkdownView,
		opts: { withSuggestion: boolean },
	): void {
		const file = view.file;
		if (!file) return;

		const quote = editor.getSelection();
		if (!quote) {
			new Notice("Select some text to comment on.");
			return;
		}

		// Capture the selection now: the modal takes focus, and by the time it
		// closes `getSelection()` may report something else entirely.
		const from = editor.posToOffset(editor.getCursor("from"));
		const to = editor.posToOffset(editor.getCursor("to"));

		new CommentModal(this.app, quote, opts.withSuggestion, (draft) =>
			void this.createComment(file, view, { from, to, quote }, draft),
		).open();
	}

	private async createComment(
		file: TFile,
		view: MarkdownView,
		selection: { from: number; to: number; quote: string },
		draft: CommentDraft,
	): Promise<void> {
		const state = this.documentState(file, view);
		if (!state) return;

		// The Editor API's coordinates are document-absolute and include the
		// frontmatter; `makeAnchor` shifts them into body coordinates and
		// grabs the surrounding context for re-anchoring.
		if (state.sliceDoc(selection.from, selection.to) !== selection.quote) {
			new Notice("The selection changed while you were typing. Not saving.");
			return;
		}

		const anchor = makeAnchor(
			selection.from,
			selection.to,
			state,
			frameFromState(state),
		);
		const existing = new Set(this.store.read(file).map((c) => c.id));

		const comment: Comment = {
			id: newCommentId(existing),
			author: this.settings.authorName || undefined,
			created: new Date().toISOString(),
			body: draft.body,
			anchor,
			suggestion:
				draft.suggestion !== undefined &&
				draft.suggestion !== selection.quote
					? { replacement: draft.suggestion }
					: undefined,
		};

		await this.store.add(file, comment);
		await this.openSidebar();
		this.refresh();
		void this.revealComment(comment.id);
	}

	async applySuggestion(file: TFile, id: string): Promise<void> {
		// Flush first: anchors that drifted since the last debounce would send
		// the splice looking in the wrong place, and everything below reads
		// from the store.
		this.scheduleFlush.cancel();
		await this.flushAnchors();

		const stored = this.store.read(file);
		const comment = this.resolveFor(file, this.activeMarkdownView()).find(
			(c) => c.id === id,
		);
		if (!comment?.suggestion) return;

		const result = await applySuggestion(this.app, file, comment, stored);
		if (!result.ok) {
			new Notice(APPLY_FAILURE[result.reason]);
			return;
		}

		const appliedAt = new Date().toISOString();
		const replacement = comment.suggestion!.replacement;
		const remove = this.settings.removeCommentOnApply;

		// One frontmatter write for the whole thing: the re-anchoring the
		// splice forced, plus the comment's own new state.
		this.flushing = true;
		try {
			await this.store.update(file, (comments) => {
				for (const { id: target, anchor } of result.anchors) {
					const entry = comments.find((c) => c.id === target);
					if (entry) entry.anchor = anchor;
				}
				if (remove) return comments.filter((c) => c.id !== id);
				const applied = comments.find((c) => c.id === id);
				if (applied) {
					applied.suggestion = { replacement, appliedAt };
					applied.modified = appliedAt;
				}
			});
		} finally {
			this.flushing = false;
		}

		this.refresh();
	}

	async addReply(file: TFile, id: string, body: string): Promise<void> {
		const comment = this.store.read(file).find((c) => c.id === id);
		if (!comment) return;

		const reply: Reply = {
			id: newCommentId(new Set((comment.replies ?? []).map((r) => r.id))),
			author: this.settings.authorName || undefined,
			created: new Date().toISOString(),
			body,
		};

		await this.store.patch(file, id, {
			replies: [...(comment.replies ?? []), reply],
		});
		this.refresh();
	}

	async toggleResolved(file: TFile, id: string): Promise<void> {
		const comment = this.store.read(file).find((c) => c.id === id);
		if (!comment) return;
		await this.store.patch(file, id, { resolved: !comment.resolved });
		this.refresh();
	}

	async deleteComment(file: TFile, id: string): Promise<void> {
		const comment = this.store.read(file).find((c) => c.id === id);
		if (!comment) return;

		await this.store.remove(file, id);
		this.refresh();

		// Undo rather than a confirmation dialog: deleting a comment is a
		// one-click action taken often, and a modal on each one would be worse
		// than the occasional restore.
		const notice = new Notice("Comment deleted. Click to undo.", 8000);
		notice.noticeEl.addClass("mod-clickable");
		notice.noticeEl.addEventListener("click", () => {
			notice.hide();
			void this.store.add(file, comment).then(() => this.refresh());
		});
	}

	// ── Navigation ───────────────────────────────────────────────────────────

	/** Requirement 4: sidebar card → editor. */
	scrollToComment(id: string): void {
		this.sidebar()?.setActive(id);

		const cm = this.editorView(this.activeMarkdownView());
		if (!cm) return;
		const range = trackedRange(cm, id);
		if (!range || range.to <= range.from) return;

		cm.dispatch({
			selection: { anchor: range.from, head: range.to },
			effects: [
				EditorView.scrollIntoView(range.from, { y: "center" }),
				setActiveComment.of(id),
				flashComment.of(id),
			],
		});
		cm.focus();

		window.setTimeout(() => {
			if (!cm.dom.isConnected) return;
			cm.dispatch({ effects: flashComment.of(null) });
		}, FLASH_DURATION);
	}

	/** Requirement 5's marker click: editor → sidebar. */
	async revealComment(
		id: string,
		opts: { reveal?: boolean } = {},
	): Promise<void> {
		// A click that merely landed inside a highlight follows along in an
		// already-open sidebar; it does not yank one open and take focus.
		if (opts.reveal !== false) await this.openSidebar();
		this.sidebar()?.setActive(id);
		this.editorView(this.activeMarkdownView())?.dispatch({
			effects: setActiveComment.of(id),
		});
	}

	/** The innermost comment whose live range contains the cursor. */
	commentAtCursor(
		editor: Editor,
		view: MarkdownView,
	): ResolvedComment | null {
		const cm = this.editorView(view);
		if (!cm) return null;
		return commentAt(cm, editor.posToOffset(editor.getCursor("head")));
	}

	// ── Anchor drift ─────────────────────────────────────────────────────────

	/**
	 * Write back anchors that CodeMirror has been moving as the note is typed.
	 *
	 * See docs/DESIGN.md § 3c: highlights follow edits live in the editor, and
	 * the on-disk coordinates catch up here — on a pause in typing, on file
	 * switch, on unload, and before anything that depends on them being right.
	 */
	private async flushAnchors(view = this.activeMarkdownView()): Promise<void> {
		if (this.flushing) return;
		const file = view?.file;
		const cm = this.editorView(view);
		if (!file || !cm || !cm.dom.isConnected) return;

		const tracked = cm.state.field(commentField, false)?.ranges;
		if (!tracked?.length) return;

		const writes = pendingAnchorWrites(
			this.store.read(file),
			tracked,
			cm.state,
			frameFromState(cm.state),
		);
		if (writes.length === 0) return;

		this.flushing = true;
		try {
			await this.store.patchMany(
				file,
				writes.map((w) => ({ id: w.id, patch: { anchor: w.anchor } })),
				// The reader didn't touch these comments; the text moved under
				// them. Stamping `modified` here would make it meaningless.
				{ touch: false },
			);
		} finally {
			this.flushing = false;
		}
	}

	private async onActiveViewChanged(): Promise<void> {
		const view = this.activeMarkdownView();
		if (this.tracking && this.tracking !== view) {
			this.scheduleFlush.cancel();
			await this.flushAnchors(this.tracking);
		}
		this.tracking = view;

		this.refresh();

		if (this.settings.autoOpenSidebar && view?.file) {
			if (this.store.read(view.file).length > 0) await this.openSidebar();
		}
	}

	// ── Reading view ─────────────────────────────────────────────────────────

	private decorateReadingView(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void {
		if (!this.settings.highlightInReadingView) return;

		const file = this.app.vault.getFileByPath(ctx.sourcePath);
		if (!file) return;
		const comments = this.store.read(file);
		if (comments.length === 0) return;

		// Rendered blocks have no line numbers of their own; this is the only
		// bridge back to the source coordinates the anchors are stored in.
		const section = ctx.getSectionInfo(el);
		if (!section) return;

		const bodyStartLine = this.store.bodyOffset(file).line;
		const first = section.lineStart - bodyStartLine;
		const last = section.lineEnd - bodyStartLine;

		for (const comment of comments) {
			if (comment.resolved && !this.settings.showResolved) continue;
			if (comment.anchor.to.line < first) continue;
			if (comment.anchor.from.line > last) continue;
			highlightQuoteInSection(el, comment, (id) =>
				void this.revealComment(id),
			);
		}
	}

	// ── Plumbing ─────────────────────────────────────────────────────────────

	async openSidebar(): Promise<void> {
		const existing =
			this.app.workspace.getLeavesOfType(VIEW_TYPE_OBELISK)[0];
		const leaf: WorkspaceLeaf | null =
			existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;

		if (!existing) {
			await leaf.setViewState({ type: VIEW_TYPE_OBELISK, active: true });
		}
		await this.app.workspace.revealLeaf(leaf);
		this.refresh();
	}

	private sidebar(): ObeliskSidebarView | null {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_OBELISK)[0];
		const view = leaf?.view;
		return view instanceof ObeliskSidebarView ? view : null;
	}

	/**
	 * The note the sidebar is about.
	 *
	 * Deliberately *not* just `getActiveViewOfType`: that goes null as soon as
	 * the sidebar itself takes focus, which would empty the comment list on
	 * the first click into it — and leave card clicks with no editor to scroll.
	 * We fall back to the last markdown view instead, as long as it is still
	 * open somewhere in the workspace.
	 */
	private activeMarkdownView(): MarkdownView | null {
		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (active) {
			this.lastMarkdownView = active;
			return active;
		}
		if (this.lastMarkdownView && this.isOpen(this.lastMarkdownView)) {
			return this.lastMarkdownView;
		}
		this.lastMarkdownView = null;
		return null;
	}

	/**
	 * Whether a remembered view is still live. Closed leaves — and views
	 * Obsidian has deferred out of a background tab — drop off this list, so
	 * identity against it is the check that matters, not DOM connectedness.
	 */
	private isOpen(view: MarkdownView): boolean {
		return this.app.workspace
			.getLeavesOfType("markdown")
			.some((leaf) => leaf.view === view);
	}

	private activeFile(): TFile | null {
		return this.activeMarkdownView()?.file ?? null;
	}

	/**
	 * The CodeMirror view behind a MarkdownView, if it has one. Reading-mode
	 * leaves and embedded editors may not.
	 */
	private editorView(view: MarkdownView | null): EditorView | null {
		if (!view) return null;
		// @ts-expect-error — `editor.cm` is the CM6 EditorView; not in the
		// public typings but stable in practice, and how every editor plugin
		// reaches it.
		const cm: unknown = view.editor?.cm;
		return cm instanceof EditorView ? cm : null;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

const APPLY_FAILURE: Record<string, string> = {
	"already-applied": "That suggestion has already been applied.",
	orphaned:
		"The text this suggestion targets is no longer in the note. Not applying.",
	stale: "The text this suggestion targets has changed. Not applying.",
	ambiguous:
		"The quoted text appears more than once, so it isn't clear where this belongs. Not applying.",
};
