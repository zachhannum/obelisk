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
import { hasSuggestion } from "../core/suggestion";
import { ResolvedComment, VIEW_TYPE_OBELISK } from "../types";
import { beginEditing, renderCommentCard } from "./comment-card";
import { Draft, DraftRequest, renderDraftCard } from "./draft-card";

/** A `run:` filter narrows to one agent pass; the rest are the fixed three. */
type Filter = "all" | "unresolved" | "suggestions" | `run:${string}`;
type Sort = "document" | "newest";

const FILTERS: Array<{ id: Filter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "unresolved", label: "Open" },
	{ id: "suggestions", label: "Suggestions" },
];

/** One agent pass over this note, as gathered from the comments it left. */
interface Run {
	id: string;
	/** What to call it: the model, failing that whatever name it wrote under. */
	label: string;
	count: number;
}

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
	private draftEl!: HTMLElement;
	private listEl!: HTMLElement;
	/** The comment being written, if one is. */
	private draft: Draft | null = null;
	/** Owns the draft's composer, which outlives any number of renders. */
	private draftScope: Component | null = null;
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
		this.draftEl = this.contentEl.createDiv({ cls: "obelisk-draft" });
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
		this.cancelDraft();
		this.clearScope();
	}

	/** Called by the plugin whenever the active file or its comments change. */
	setComments(file: TFile | null, comments: ResolvedComment[]): void {
		// A draft belongs to the passage it quotes, and that passage is in the
		// note that just went away.
		if (file?.path !== this.file?.path) this.cancelDraft();
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

	/**
	 * Open an empty comment at the top of the list. Replaces whatever was
	 * being drafted, since one selection is being commented on at a time.
	 */
	beginDraft(req: Omit<DraftRequest, "onCancel">): void {
		this.cancelDraft();
		const scope = new Component();
		this.addChild(scope);
		this.draftScope = scope;
		this.draft = renderDraftCard(this.draftEl, scope, {
			...req,
			onSubmit: (body) => {
				this.cancelDraft();
				req.onSubmit(body);
			},
			onCancel: () => this.cancelDraft(),
		});
		this.draft.focus();
	}

	/** Throw away the draft, if there is one. */
	cancelDraft(): void {
		this.draft?.destroy();
		this.draft = null;
		if (!this.draftScope) return;
		this.removeChild(this.draftScope);
		this.draftScope = null;
	}

	/** Start editing a comment's body from outside the sidebar. */
	beginEdit(id: string): void {
		const card = this.listEl.querySelector<HTMLElement>(
			`.obelisk-card[data-obelisk-id="${id}"]`,
		);
		if (!card) {
			new Notice("That comment is hidden by the current filter.");
			return;
		}
		card.scrollIntoView({ block: "nearest" });
		beginEditing(card);
	}

	// ── Rendering ────────────────────────────────────────────────────────────

	private render(): void {
		// A dismissed run takes its chip with it, and a filter still pinned to
		// it would leave an empty list with nothing on screen explaining why.
		// Checked before the header is drawn, so the chip and the list agree.
		if (
			this.filter.startsWith("run:") &&
			!this.runs().some((r) => `run:${r.id}` === this.filter)
		) {
			this.filter = "all";
		}

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
		//
		// Resolved comments are not part of that pile even when their text is
		// gone. Losing the passage is how a settled comment usually ends —
		// the edit it asked for was made — so it sorts quietly to the bottom
		// of the main list rather than being flagged as something to fix.
		const anchored = visible.filter((c) => c.range !== null || c.resolved);
		const detached = visible.filter((c) => c.range === null && !c.resolved);
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

		const sortBtn = top.createEl("button", {
			cls: "obelisk-icon-button clickable-icon",
		});
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

		for (const run of this.runs()) this.renderRunChip(chips, run);
	}

	/**
	 * One chip per agent pass, beside the fixed filters.
	 *
	 * A review pass is twenty comments arriving at once, and the reader wants to
	 * act on all twenty together, so the chip that isolates a pass is also where
	 * it is dismissed. Without it, undoing a review is twenty deletions and no
	 * way to tell one pass from the next.
	 */
	private renderRunChip(chips: HTMLElement, run: Run): void {
		const chip = chips.createEl("button", { cls: "obelisk-chip is-run" });
		chip.toggleClass("is-active", this.filter === `run:${run.id}`);
		chip.createSpan({ text: run.label });
		setTooltip(chip, `Run ${run.id} — ${run.count} comments`);
		chip.addEventListener("click", () => {
			this.filter =
				this.filter === `run:${run.id}` ? "all" : `run:${run.id}`;
			this.render();
		});

		const dismiss = chip.createSpan({ cls: "obelisk-chip-dismiss" });
		setIcon(dismiss, "x");
		setTooltip(dismiss, `Dismiss all ${run.count} comments from this run`);
		dismiss.addEventListener("click", (evt) => {
			// The chip underneath is a filter; the × on it is not.
			evt.stopPropagation();
			const file = this.file;
			if (file) void this.plugin.dismissRun(file, run.id);
		});
	}

	/** The agent passes represented in this note, in the order they appear. */
	private runs(): Run[] {
		const runs = new Map<string, Run>();
		for (const comment of this.comments) {
			const id = comment.origin?.run;
			if (!id) continue;
			const existing = runs.get(id);
			if (existing) {
				existing.count++;
				continue;
			}
			runs.set(id, {
				id,
				label: comment.origin?.model || comment.author || "Agent",
				count: 1,
			});
		}
		return [...runs.values()];
	}

	private visibleComments(): ResolvedComment[] {
		const run = this.filter.startsWith("run:")
			? this.filter.slice("run:".length)
			: null;

		return this.comments.filter((c) => {
			if (this.filter === "unresolved" && c.resolved) return false;
			if (this.filter === "suggestions" && !hasSuggestion(c)) return false;
			if (run !== null && c.origin?.run !== run) return false;
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

	/** Everything the list is drawn from: the file and its resolved comments. */
	private signature(): string {
		return JSON.stringify([this.file?.path ?? null, this.comments]);
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
