import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type ObeliskPlugin from "../main";
import { ResolvedComment, VIEW_TYPE_OBELISK } from "../types";
import { renderCommentCard } from "./comment-card";

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
	private listEl!: HTMLElement;

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

		// TODO: header row — comment count, filter chips (unresolved / mine /
		// has-suggestion), and a sort toggle (document order vs. newest first).
		this.contentEl.createDiv({ cls: "obelisk-sidebar-header" });
		this.listEl = this.contentEl.createDiv({ cls: "obelisk-list" });

		this.render();
	}

	/** Called by the plugin whenever the active file or its comments change. */
	setComments(file: TFile | null, comments: ResolvedComment[]): void {
		this.file = file;
		this.comments = comments;
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

	private render(): void {
		this.listEl.empty();

		if (!this.file) {
			this.listEl.createDiv({
				cls: "obelisk-empty",
				text: "Open a note to see its comments.",
			});
			return;
		}

		const visible = this.comments.filter(
			(c) => this.plugin.settings.showResolved || !c.resolved,
		);

		if (visible.length === 0) {
			this.listEl.createDiv({
				cls: "obelisk-empty",
				text: "No comments yet. Select some text and right-click to add one.",
			});
			return;
		}

		// TODO: sort by resolved anchor position so the sidebar mirrors
		// document order; orphaned comments sink to the bottom in a section of
		// their own.
		for (const comment of visible) {
			renderCommentCard(this.listEl, comment, this.plugin, this.file);
		}

		this.setActive(this.activeId, false);
	}
}
