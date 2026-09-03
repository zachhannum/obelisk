import { EditorView } from "@codemirror/view";
import {
	Debouncer,
	Editor,
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
	flashComment,
	obeliskEditorExtension,
	setActiveComment,
	setComments,
	trackedRange,
} from "./editor/highlight-extension";
import { ObeliskSettingTab } from "./settings";
import {
	frameFrom,
	makeAnchor,
	resolveAll,
} from "./core/anchors";
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
import { newCommentId } from "./core/id";

/**
 * How long the editor has to be quiet before comments are re-resolved.
 *
 * Short, because a resolve is a substring search that writes nothing — the
 * cost of running one is close to the cost of deciding not to. Long enough
 * that it lands on a pause in typing rather than on every keystroke, so a
 * highlight is not torn down while the user is still mid-word inside it.
 *
 * Waiting on `metadataCache` instead would mean waiting for Obsidian to
 * autosave and reparse the file, which is seconds.
 */
const RESOLVE_DELAY = 250;

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

	/**
	 * The last markdown view that had focus. Focus moving to the sidebar (or
	 * anywhere else) doesn't mean the reader left the note, so this is what
	 * "the note we're commenting on" means everywhere below.
	 */
	private lastMarkdownView: MarkdownView | null = null;
	private scheduleResolve!: Debouncer<[], void>;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new CommentStore(this.app);
		this.scheduleResolve = debounce(
			() => this.refresh(),
			RESOLVE_DELAY,
			true,
		);

		this.registerView(
			VIEW_TYPE_OBELISK,
			(leaf) => new ObeliskSidebarView(leaf, this),
		);

		this.registerEditorExtension(
			obeliskEditorExtension({
				onSelect: (id, opts) => void this.revealComment(id, opts),
				onEdit: () => this.scheduleResolve(),
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
				if (file.path === this.activeFile()?.path) this.refresh();
			}),
		);
		// At startup the open note's frontmatter may not be parsed yet, and a
		// file already in the queue never fires "changed" — so the first read
		// can come back empty. This fires when the cache goes quiet; the
		// sidebar no-ops when nothing actually changed.
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => this.refresh()),
		);

		this.app.workspace.onLayoutReady(() => void this.onActiveViewChanged());
	}

	onunload(): void {
		this.scheduleResolve.cancel();
	}

	// ── State ────────────────────────────────────────────────────────────────

	/**
	 * Recompute everything and push it to both consumers.
	 *
	 * Runs on file switches, on frontmatter changes, and a beat after the
	 * editor goes quiet. Resolving is a substring search per comment and
	 * writes nothing, so this can afford to be unconditional rather than
	 * cached — and the sidebar redraws only when the result actually differs.
	 */
	refresh(): void {
		// A pending re-resolve has just been made redundant, whoever asked.
		this.scheduleResolve.cancel();
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

		const text = this.documentText(file, view);
		if (text === null) {
			return comments.map((c) => ({
				...c,
				range: null,
				state: "detached" as const,
			}));
		}

		return resolveAll(comments, frameFrom(text));
	}

	/**
	 * The text to anchor against: the live editor's document when there is
	 * one, and the same text through the Editor API when there is not (a
	 * Reading-view leaf may have no CodeMirror instance attached). Resolution
	 * needs a document and nothing else.
	 */
	private documentText(file: TFile, view: MarkdownView | null): string | null {
		const cm = this.editorView(view);
		if (cm) return cm.state.doc.toString();
		if (!view || view.file?.path !== file.path) return null;
		return view.editor.getValue();
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

		new CommentModal(
			this.app,
			quote,
			opts.withSuggestion,
			file.path,
			(draft) =>
				void this.createComment(file, view, { from, to, quote }, draft),
		).open();
	}

	private async createComment(
		file: TFile,
		view: MarkdownView,
		selection: { from: number; to: number; quote: string },
		draft: CommentDraft,
	): Promise<void> {
		const text = this.documentText(file, view);
		if (text === null) return;

		// The Editor API's coordinates are document-absolute and include the
		// frontmatter; `makeAnchor` shifts them into body coordinates.
		if (text.slice(selection.from, selection.to) !== selection.quote) {
			new Notice("The selection changed while you were typing. Not saving.");
			return;
		}

		const anchor = makeAnchor(
			selection.from,
			selection.to,
			frameFrom(text),
		);
		const existing = new Set(this.store.read(file).map((c) => c.id));

		const comment: Comment = {
			id: newCommentId(existing),
			author: this.settings.authorName || undefined,
			created: new Date().toISOString(),
			body: draft.body,
			anchor,
		};

		await this.store.add(file, comment);
		await this.openSidebar();
		this.refresh();
		void this.revealComment(comment.id);
	}

	/**
	 * Accept one ```suggestion block. `replacement` is that block's content —
	 * the sidebar passes whichever Apply button was pressed, since a thread may
	 * propose more than one thing.
	 */
	async applySuggestion(
		file: TFile,
		id: string,
		replacement: string,
	): Promise<void> {
		const comment = this.resolveFor(file, this.activeMarkdownView()).find(
			(c) => c.id === id,
		);
		if (!comment) return;

		const result = await applySuggestion(this.app, file, comment, replacement);
		if (!result.ok) {
			new Notice(APPLY_FAILURE[result.reason]);
			return;
		}

		const appliedAt = new Date().toISOString();
		const remove = this.settings.removeCommentOnApply;

		// The splice moved every comment after it, and none of them care:
		// they are found by their quoted text, which the splice did not touch.
		// The applied comment is the one exception — it now quotes the
		// replacement rather than the text it replaced.
		await this.store.update(file, (comments) => {
			if (remove) return comments.filter((c) => c.id !== id);
			const applied = comments.find((c) => c.id === id);
			if (applied) {
				applied.anchor = result.anchor;
				applied.appliedAt = appliedAt;
				applied.modified = appliedAt;
				// Taking the edit is the strongest possible answer to the
				// comment that proposed it, and no other proposal in the
				// thread can be applied afterwards — leaving it in the open
				// count would make that count a to-do list with nothing to do
				// on it. Reopen is one click away if the comment also asked
				// something the edit did not answer.
				applied.resolved = true;
			}
		});

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

	/**
	 * Rewrite a comment's body. The anchor is untouched: editing what you said
	 * about a passage is not a claim about a different passage — and a
	 * suggestion block added or changed here is measured against the same
	 * quoted text as before.
	 */
	async editComment(file: TFile, id: string, body: string): Promise<void> {
		const comment = this.store.read(file).find((c) => c.id === id);
		if (!comment) return;

		const next = body.trim();
		if (!next || next === comment.body) return;

		await this.store.patch(file, id, {
			body: next,
			edited: new Date().toISOString(),
		});
		this.refresh();
	}

	/** The context menu's route into the sidebar's editor. */
	async startEditComment(id: string): Promise<void> {
		await this.revealComment(id);
		this.sidebar()?.beginEdit(id);
	}

	async editReply(
		file: TFile,
		commentId: string,
		replyId: string,
		body: string,
	): Promise<void> {
		const comment = this.store.read(file).find((c) => c.id === commentId);
		const replies = comment?.replies;
		const reply = replies?.find((r) => r.id === replyId);
		if (!replies || !reply) return;

		const next = body.trim();
		if (!next || next === reply.body) return;

		const edited = new Date().toISOString();
		await this.store.patch(file, commentId, {
			replies: replies.map((r) =>
				r.id === replyId ? { ...r, body: next, edited } : r,
			),
		});
		this.refresh();
	}

	/**
	 * Drop one reply out of a thread, leaving the comment itself alone.
	 *
	 * Undo rather than a confirmation, for the same reason deleting a comment
	 * offers one — except that a reply also has to go back *where it was*, so
	 * the restore splices it in at its old index rather than appending it and
	 * quietly reordering the conversation.
	 */
	async deleteReply(
		file: TFile,
		commentId: string,
		replyId: string,
	): Promise<void> {
		const comment = this.store.read(file).find((c) => c.id === commentId);
		const replies = comment?.replies;
		const index = replies?.findIndex((r) => r.id === replyId) ?? -1;
		if (!replies || index < 0) return;

		const reply = replies[index];
		await this.store.patch(file, commentId, {
			replies: replies.filter((r) => r.id !== replyId),
		});
		this.refresh();

		const notice = new Notice("Reply deleted. Click to undo.", 8000);
		notice.messageEl.addClass("mod-clickable");
		notice.messageEl.addEventListener("click", () => {
			notice.hide();
			void this.restoreReply(file, commentId, reply, index);
		});
	}

	/** Put a deleted reply back at `index`, as far as the thread still allows. */
	private async restoreReply(
		file: TFile,
		commentId: string,
		reply: Reply,
		index: number,
	): Promise<void> {
		const comment = this.store.read(file).find((c) => c.id === commentId);
		// The whole comment may have been deleted in the meantime, and its
		// replies with it; there is nothing left to restore into.
		if (!comment) return;
		if (comment.replies?.some((r) => r.id === reply.id)) return;

		const replies = [...(comment.replies ?? [])];
		replies.splice(Math.min(index, replies.length), 0, reply);
		await this.store.patch(file, commentId, { replies });
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
		notice.messageEl.addClass("mod-clickable");
		notice.messageEl.addEventListener("click", () => {
			notice.hide();
			void this.store.add(file, comment).then(() => this.refresh());
		});
	}

	/**
	 * Drop every comment left by one agent pass.
	 *
	 * The one gesture a review pass needs and a thread does not: twenty
	 * comments arrived together, and they leave together. Undo rather than a
	 * confirmation, like every other deletion here — and the restore puts each
	 * comment back at its old index, so undoing a dismissal does not quietly
	 * reorder the note's frontmatter.
	 */
	async dismissRun(file: TFile, run: string): Promise<void> {
		const removed = this.store
			.read(file)
			.map((comment, index) => ({ comment, index }))
			.filter(({ comment }) => comment.origin?.run === run);
		if (removed.length === 0) return;

		await this.store.update(file, (comments) =>
			comments.filter((c) => c.origin?.run !== run),
		);
		this.refresh();

		const notice = new Notice(
			`${removed.length} comment${removed.length === 1 ? "" : "s"} from ` +
				`run ${run} dismissed. Click to undo.`,
			8000,
		);
		notice.messageEl.addClass("mod-clickable");
		notice.messageEl.addEventListener("click", () => {
			notice.hide();
			void this.restoreRun(file, removed);
		});
	}

	private async restoreRun(
		file: TFile,
		removed: ReadonlyArray<{ comment: Comment; index: number }>,
	): Promise<void> {
		await this.store.update(file, (comments) => {
			for (const { comment, index } of removed) {
				if (comments.some((c) => c.id === comment.id)) continue;
				comments.splice(Math.min(index, comments.length), 0, comment);
			}
		});
		this.refresh();
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

	// ── Lifecycle ────────────────────────────────────────────────────────────

	private async onActiveViewChanged(): Promise<void> {
		const view = this.activeMarkdownView();
		this.refresh();

		if (this.settings.autoOpenSidebar && view?.file) {
			if (this.store.read(view.file).length > 0) await this.openSidebar();
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
		// `loadData` reads the plugin's own JSON back untyped.
		const saved = (await this.loadData()) as Partial<ObeliskSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...saved };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

const APPLY_FAILURE: Record<string, string> = {
	"already-applied": "A suggestion from this comment has already been applied.",
	detached:
		"The text this suggestion targets has changed or been removed. Not applying.",
};
