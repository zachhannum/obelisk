import {
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { registerContextMenu } from "./editor/context-menu";
import {
	obeliskEditorExtension,
	setActiveComment,
	setComments,
} from "./editor/highlight-extension";
import { ObeliskSettingTab } from "./settings";
import { CommentStore } from "./store/frontmatter";
import { applySuggestion } from "./suggestion/apply";
import {
	Comment,
	DEFAULT_SETTINGS,
	ObeliskSettings,
	ResolvedComment,
	VIEW_TYPE_OBELISK,
} from "./types";
import { CommentDraft, CommentModal } from "./view/comment-modal";
import { ObeliskSidebarView } from "./view/sidebar-view";
import { newCommentId } from "./util/id";

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

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new CommentStore(this.app);

		this.registerView(
			VIEW_TYPE_OBELISK,
			(leaf) => new ObeliskSidebarView(leaf, this),
		);

		this.registerEditorExtension(
			obeliskEditorExtension((id) => this.revealComment(id)),
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
			this.app.workspace.on("active-leaf-change", () => this.refresh()),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file.path === this.activeFile()?.path) this.refresh();
			}),
		);

		this.app.workspace.onLayoutReady(() => this.refresh());

		// TODO: register a markdown post-processor so requirement 5 also holds
		// in Reading view (settings.highlightInReadingView). It needs its own
		// anchoring path — the rendered DOM has no line numbers, so it has to
		// match on `anchor.quote` within each rendered block, using the
		// section info from `ctx.getSectionInfo(el)` to map back to lines.
	}

	onunload(): void {
		// Views are torn down by Obsidian; nothing else to clean up yet.
		// TODO: flush any pending anchor rewrites (anchors.pendingAnchorWrites)
		// before the plugin goes away.
	}

	// ── State ────────────────────────────────────────────────────────────────

	/**
	 * TODO: this recomputes everything on every call. Once anchoring is real,
	 * cache ResolvedComment[] per file and invalidate on metadata change +
	 * document change, rather than re-resolving from scratch.
	 */
	refresh(): void {
		const file = this.activeFile();
		const view = this.activeMarkdownView();
		const comments: ResolvedComment[] = file
			? this.resolveFor(file, view)
			: [];

		this.sidebar()?.setComments(file, comments);

		// @ts-expect-error — `editor.cm` is the CM6 EditorView; not in the
		// public typings but stable in practice, and how every editor plugin
		// reaches it.
		const cm = view?.editor?.cm;
		cm?.dispatch({ effects: setComments.of(comments) });
	}

	/**
	 * TODO: resolve stored anchors against the live document.
	 * Needs `anchors.resolveAll(this.store.read(file), cm.state, frame)`,
	 * where `frame` comes from `store.bodyOffset(file)`. Until anchoring is
	 * implemented this returns comments with no ranges, so the sidebar lists
	 * them but nothing is highlighted.
	 */
	private resolveFor(
		file: TFile,
		_view: MarkdownView | null,
	): ResolvedComment[] {
		return this.store.read(file).map((c) => ({
			...c,
			range: null,
			state: "orphaned" as const,
		}));
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

		new CommentModal(this.app, quote, opts.withSuggestion, (draft) =>
			this.createComment(file, editor, draft),
		).open();
	}

	private async createComment(
		file: TFile,
		editor: Editor,
		draft: CommentDraft,
	): Promise<void> {
		// TODO: build the anchor with anchors.makeAnchor() from the CM6 state
		// so we get quote/prefix/suffix and body-relative coordinates. The
		// Editor API's line numbers are document-absolute and include the
		// frontmatter, so they must be shifted by store.bodyOffset(file).
		const from = editor.getCursor("from");
		const to = editor.getCursor("to");
		const existing = new Set(this.store.read(file).map((c) => c.id));

		const comment: Comment = {
			id: newCommentId(existing),
			author: this.settings.authorName || undefined,
			created: new Date().toISOString(),
			body: draft.body,
			anchor: {
				from: { line: from.line, col: from.ch },
				to: { line: to.line, col: to.ch },
				quote: editor.getSelection(),
			},
			suggestion:
				draft.suggestion !== undefined
					? { replacement: draft.suggestion }
					: undefined,
		};

		await this.store.add(file, comment);
		await this.openSidebar();
		this.refresh();
		this.revealComment(comment.id);
	}

	async applySuggestion(file: TFile, id: string): Promise<void> {
		const comment = this.resolveFor(file, this.activeMarkdownView()).find(
			(c) => c.id === id,
		);
		if (!comment) return;

		const result = await applySuggestion(this.app, file, comment);
		if (!result.ok) {
			new Notice(
				result.reason === "already-applied"
					? "That suggestion has already been applied."
					: "The text this suggestion targets has changed. Not applying.",
			);
			return;
		}

		if (this.settings.removeCommentOnApply) {
			await this.store.remove(file, id);
		} else {
			await this.store.patch(file, id, {
				suggestion: {
					replacement: comment.suggestion!.replacement,
					appliedAt: new Date().toISOString(),
				},
			});
		}
		this.refresh();
	}

	async toggleResolved(file: TFile, id: string): Promise<void> {
		const comment = this.store.read(file).find((c) => c.id === id);
		if (!comment) return;
		await this.store.patch(file, id, { resolved: !comment.resolved });
		this.refresh();
	}

	async deleteComment(file: TFile, id: string): Promise<void> {
		// TODO: confirmation modal, or an undo affordance via Notice.
		await this.store.remove(file, id);
		this.refresh();
	}

	// ── Navigation ───────────────────────────────────────────────────────────

	/** Requirement 4: sidebar card → editor. */
	scrollToComment(id: string): void {
		const view = this.activeMarkdownView();
		const comment = this.currentComments().find((c) => c.id === id);
		if (!view || !comment?.range) return;

		// TODO: scroll the editor and flash the highlight.
		//   const { from, to } = comment.range;
		//   cm.dispatch({
		//     selection: { anchor: from, head: to },
		//     effects: EditorView.scrollIntoView(from, { y: "center" }),
		//   });
		// Then add `.is-flashing` to the decoration for ~600ms.
		this.sidebar()?.setActive(id);
	}

	/** Requirement 5's marker click: editor → sidebar. */
	async revealComment(id: string): Promise<void> {
		await this.openSidebar();
		this.sidebar()?.setActive(id);

		// @ts-expect-error — see note in refresh().
		const cm = this.activeMarkdownView()?.editor?.cm;
		cm?.dispatch({ effects: setActiveComment.of(id) });
	}

	/**
	 * TODO: find the comment whose range contains the cursor, preferring the
	 * innermost when several overlap. Needs real anchoring first.
	 */
	commentAtCursor(
		_editor: Editor,
		_view: MarkdownView,
	): ResolvedComment | null {
		return null;
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
		this.app.workspace.revealLeaf(leaf);
		this.refresh();
	}

	private sidebar(): ObeliskSidebarView | null {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_OBELISK)[0];
		const view = leaf?.view;
		return view instanceof ObeliskSidebarView ? view : null;
	}

	private activeMarkdownView(): MarkdownView | null {
		return this.app.workspace.getActiveViewOfType(MarkdownView);
	}

	private activeFile(): TFile | null {
		return this.activeMarkdownView()?.file ?? null;
	}

	private currentComments(): ResolvedComment[] {
		const file = this.activeFile();
		return file ? this.resolveFor(file, this.activeMarkdownView()) : [];
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
