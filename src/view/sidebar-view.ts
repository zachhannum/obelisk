import {
	Component,
	ItemView,
	Notice,
	TFile,
	WorkspaceLeaf,
	setIcon,
	setTooltip,
} from "obsidian";
import type ObeliskPlugin from "../main";
import { hasSuggestion } from "../suggestion/parse";
import { ResolvedComment, VIEW_TYPE_OBELISK } from "../types";
import { beginEditing, renderCommentCard } from "./comment-card";

type Filter = "all" | "unresolved" | "suggestions";
type Sort = "document" | "newest";

const FILTERS: Array<{ id: Filter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "unresolved", label: "Open" },
	{ id: "suggestions", label: "Suggestions" },
];

/**
 * Requirements 3 and 4: the comment list, and click-to-scroll.
 *
 * The view is deliberately dumb — it renders whatever `setComments` hands it
 * and calls back into the plugin for anything that mutates state. The plugin
 * owns the store; the view owns the DOM.
 */
export class ObeliskSidebarView extends ItemView {
	private comments: ResolvedComment[] = [];
	private file: TFile | null = null;
	private activeId: string | null = null;
	private filter: Filter = "all";
	private sort: Sort = "document";
	private headerEl!: HTMLElement;
	private listEl!: HTMLElement;
	/** Owns the render's markdown children; replaced wholesale each render. */
	private renderScope: Component | null = null;
	/** What the list was last drawn from; see `setComments`. */
	private lastSignature = "";

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ObeliskPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_OBELISK;
	}

	getDisplayText(): string {
		return "Comments";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("obelisk-sidebar");

		this.headerEl = this.contentEl.createDiv({
			cls: "obelisk-sidebar-header",
		});
		this.listEl = this.contentEl.createDiv({ cls: "obelisk-list" });

		// Obsidian can restore or un-defer this view long after the plugin's
		// last refresh — at startup, that is the note the reader already has
		// open. Ask for the current state rather than waiting for the next
		// event to push it.
		const { file, comments } = this.plugin.activeComments();
		this.lastSignature = "";
		this.setComments(file, comments);
	}

	async onClose(): Promise<void> {
		this.clearScope();
	}

	/** Called by the plugin whenever the active file or its comments change. */
	setComments(file: TFile | null, comments: ResolvedComment[]): void {
		this.file = file;
		this.comments = comments;
		// Pushed before `onOpen` built the DOM: the fields above are enough,
		// since `onOpen` draws from them.
		if (!this.listEl) return;

		// Refresh runs on every leaf change, including the one that fires when
		// this pane takes focus. Re-rendering identical content there would
		// tear down the card the user is mid-click on — and any half-typed
		// reply with it — so redraw only when something actually changed.
		const signature = this.signature();
		if (signature === this.lastSignature) return;
		this.lastSignature = signature;

		this.render();
	}

	/** Requirement 5's other direction: editor marker → sidebar. */
	setActive(id: string | null, scrollIntoView = true): void {
		this.activeId = id;
		this.listEl
			.findAll(".obelisk-card.is-active")
			.forEach((el) => el.removeClass("is-active"));
		if (!id) return;

		const card = this.listEl.querySelector<HTMLElement>(
			`.obelisk-card[data-obelisk-id="${id}"]`,
		);
		if (!card) return;
		card.addClass("is-active");
		if (scrollIntoView) card.scrollIntoView({ block: "nearest" });
	}

	/** Start editing a comment's body from outside the sidebar. */
	beginEdit(id: string): void {
		const card = this.listEl.querySelector<HTMLElement>(
			`.obelisk-card[data-obelisk-id="${id}"]`,
		);
		if (!card) {
			// Filtered out, or resolved with resolved comments hidden.
			new Notice("That comment is hidden by the current filter.");
			return;
		}
		card.scrollIntoView({ block: "nearest" });
		beginEditing(card);
	}

	// ── Rendering ────────────────────────────────────────────────────────────

	private render(): void {
		this.renderHeader();
		this.listEl.empty();
		const scope = this.newScope();

		if (!this.file) {
			this.empty("Open a note to see its comments.");
			return;
		}

		const visible = this.visibleComments();
		if (visible.length === 0) {
			this.empty(
				this.comments.length === 0
					? "No comments yet. Select some text and right-click to add one."
					: "No comments match this filter.",
			);
			return;
		}

		// Anchored comments in document order, so the list mirrors the note;
		// detached ones sink into a section of their own at the bottom, where
		// they can be dealt with instead of interleaving with live ones.
		const anchored = visible.filter((c) => c.range !== null);
		const detached = visible.filter((c) => c.range === null);
		const file = this.file;

		for (const comment of this.sorted(anchored)) {
			renderCommentCard(this.listEl, comment, {
				plugin: this.plugin,
				file,
				component: scope,
			});
		}

		if (detached.length > 0) {
			this.listEl.createDiv({
				cls: "obelisk-section-heading",
				text: `Detached (${detached.length})`,
			});
			for (const comment of this.sorted(detached)) {
				renderCommentCard(this.listEl, comment, {
					plugin: this.plugin,
					file,
					component: scope,
				});
			}
		}

		this.setActive(this.activeId, false);
	}

	private renderHeader(): void {
		this.headerEl.empty();
		if (!this.file) return;

		const top = this.headerEl.createDiv({ cls: "obelisk-header-row" });
		const total = this.comments.length;
		const open = this.comments.filter((c) => !c.resolved).length;
		top.createSpan({
			cls: "obelisk-count",
			text:
				total === 0
					? "No comments"
					: `${open} open · ${total} total`,
		});

		const sortBtn = top.createEl("button", { cls: "obelisk-icon-button" });
		setIcon(
			sortBtn,
			this.sort === "document" ? "list-ordered" : "clock",
		);
		setTooltip(
			sortBtn,
			this.sort === "document"
				? "Sorted by position in the note"
				: "Sorted newest first",
		);
		sortBtn.addEventListener("click", () => {
			this.sort = this.sort === "document" ? "newest" : "document";
			this.render();
		});

		const chips = this.headerEl.createDiv({ cls: "obelisk-chips" });
		for (const { id, label } of FILTERS) {
			const chip = chips.createEl("button", {
				cls: "obelisk-chip",
				text: label,
			});
			chip.toggleClass("is-active", this.filter === id);
			chip.addEventListener("click", () => {
				this.filter = id;
				this.render();
			});
		}
	}

	private visibleComments(): ResolvedComment[] {
		return this.comments.filter((c) => {
			if (c.resolved && !this.plugin.settings.showResolved) return false;
			if (this.filter === "unresolved" && c.resolved) return false;
			if (this.filter === "suggestions" && !hasSuggestion(c)) return false;
			return true;
		});
	}

	private sorted(comments: ResolvedComment[]): ResolvedComment[] {
		const copy = [...comments];
		if (this.sort === "newest") {
			return copy.sort(
				(a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0),
			);
		}
		return copy.sort((a, b) => {
			const byPosition =
				(a.range?.from ?? Number.MAX_SAFE_INTEGER) -
				(b.range?.from ?? Number.MAX_SAFE_INTEGER);
			if (byPosition !== 0) return byPosition;
			// Two comments on the same passage read oldest-first, like a thread.
			return (Date.parse(a.created) || 0) - (Date.parse(b.created) || 0);
		});
	}

	/**
	 * Everything the list is drawn from — the file, the comments as resolved,
	 * and the one setting that changes what is visible.
	 */
	private signature(): string {
		return JSON.stringify([
			this.file?.path ?? null,
			this.plugin.settings.showResolved,
			this.comments,
		]);
	}

	private empty(text: string): void {
		this.listEl.createDiv({ cls: "obelisk-empty", text });
	}

	// ── Child component lifecycle ────────────────────────────────────────────

	private newScope(): Component {
		this.clearScope();
		const scope = new Component();
		this.addChild(scope);
		this.renderScope = scope;
		return scope;
	}

	private clearScope(): void {
		if (!this.renderScope) return;
		this.removeChild(this.renderScope);
		this.renderScope = null;
	}
}
