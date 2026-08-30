import { MarkdownRenderer, TFile } from "obsidian";
import type ObeliskPlugin from "../main";
import { ResolvedComment } from "../types";

/**
 * One comment in the sidebar: quoted text, body, optional suggestion diff,
 * and the action row.
 */
export function renderCommentCard(
	container: HTMLElement,
	comment: ResolvedComment,
	plugin: ObeliskPlugin,
	file: TFile,
): HTMLElement {
	const card = container.createDiv({ cls: "obelisk-card" });
	card.dataset.obeliskId = comment.id;
	card.toggleClass("is-resolved", !!comment.resolved);
	card.toggleClass("is-orphaned", comment.state === "orphaned");

	// Requirement 4: clicking the card scrolls the editor to the passage.
	card.addEventListener("click", (evt) => {
		if ((evt.target as HTMLElement).closest("button")) return;
		plugin.scrollToComment(comment.id);
	});

	const header = card.createDiv({ cls: "obelisk-card-header" });
	header.createSpan({
		cls: "obelisk-author",
		text: comment.author || "Anonymous",
	});
	header.createSpan({
		cls: "obelisk-date",
		// TODO: relative formatting ("2h ago") with an absolute title attr.
		text: comment.created?.slice(0, 10) ?? "",
	});

	if (comment.state === "orphaned") {
		card.createDiv({
			cls: "obelisk-orphan-notice",
			text: "The commented text no longer exists.",
		});
	}

	card.createDiv({ cls: "obelisk-quote", text: comment.anchor.quote });

	const body = card.createDiv({ cls: "obelisk-body" });
	// TODO: this needs a Component to own the lifecycle so embedded content is
	// unloaded with the card. Pass the view, not the plugin.
	void MarkdownRenderer.render(
		plugin.app,
		comment.body,
		body,
		file.path,
		plugin,
	);

	if (comment.suggestion) {
		// TODO: render as a real two-column diff (see suggestion/diff.ts)
		// rather than the raw replacement text.
		const sug = card.createDiv({ cls: "obelisk-suggestion" });
		sug.createDiv({ cls: "obelisk-diff-del", text: comment.anchor.quote });
		sug.createDiv({
			cls: "obelisk-diff-add",
			text: comment.suggestion.replacement,
		});
	}

	const actions = card.createDiv({ cls: "obelisk-actions" });

	if (comment.suggestion && !comment.suggestion.appliedAt) {
		const apply = actions.createEl("button", {
			cls: "mod-cta",
			text: "Apply suggestion",
		});
		apply.disabled = comment.state === "orphaned";
		apply.addEventListener("click", () =>
			plugin.applySuggestion(file, comment.id),
		);
	}

	actions
		.createEl("button", {
			text: comment.resolved ? "Reopen" : "Resolve",
		})
		.addEventListener("click", () =>
			plugin.toggleResolved(file, comment.id),
		);

	actions
		.createEl("button", { cls: "mod-warning", text: "Delete" })
		.addEventListener("click", () => plugin.deleteComment(file, comment.id));

	// TODO: reply composer, and an inline editor for the comment body.

	return card;
}
