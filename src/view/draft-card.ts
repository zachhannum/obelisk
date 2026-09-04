import { App, Component } from "obsidian";
import { findSuggestions, stripSuggestions } from "../core/suggestion";
import { Composer } from "./composer";

export interface DraftRequest {
	app: App;
	/** The passage the comment will anchor to. */
	quote: string;
	/** Opens with a suggestion block already dropped in. */
	withSuggestion: boolean;
	/** Resolves links in the preview. */
	sourcePath: string;
	onSubmit: (body: string) => void;
	onCancel: () => void;
}

/** A draft on screen, for whoever needs to take it back down. */
export interface Draft {
	focus(): void;
	destroy(): void;
}

/**
 * The card a new comment is written in, at the top of the sidebar.
 *
 * It carries what the comment will carry: the quoted passage, one markdown
 * box, suggestion blocks and all. Writing a comment happens where the comment
 * will live, beside the note's others rather than over them.
 *
 * There is one field, because a comment is one thing: markdown. "Suggest an
 * edit" opens this same card with a suggestion block already dropped in and
 * the quoted text selected, ready to be edited in place. Prose above it, a
 * second proposal below it, a link, a list: all of it is more markdown in the
 * same box.
 */
export function renderDraftCard(
	container: HTMLElement,
	scope: Component,
	req: DraftRequest,
): Draft {
	const card = container.createDiv({ cls: "obelisk-card is-draft" });

	card.createDiv({ cls: "obelisk-card-header" }).createSpan({
		cls: "obelisk-author",
		text: req.withSuggestion ? "Suggest an edit" : "New comment",
	});

	const quote = card.createDiv({ cls: "obelisk-quote", text: req.quote });
	quote.addEventListener("click", () =>
		quote.toggleClass("is-expanded", !quote.hasClass("is-expanded")),
	);

	/** An empty comment with no change proposed is not worth writing. */
	const canSubmit = (): boolean => {
		const body = composer.value;
		if (!body.trim()) return false;
		if (stripSuggestions(body).trim()) return true;
		// Nothing but suggestion blocks: one has to change something.
		return findSuggestions(body).some((b) => b.text !== req.quote);
	};

	const submit = () => {
		if (!canSubmit()) return;
		req.onSubmit(composer.value.trim());
	};

	const composer = new Composer(card, {
		app: req.app,
		sourcePath: req.sourcePath,
		component: scope,
		quote: req.quote,
		placeholder: req.withSuggestion
			? "Why this change? (optional)"
			: "Leave a comment…",
		onChange: () => {
			submitEl.disabled = !canSubmit();
		},
		onSubmit: submit,
		onEscape: () => req.onCancel(),
	});

	const actions = card.createDiv({ cls: "obelisk-compose-actions" });
	actions
		.createEl("button", { text: "Cancel" })
		.addEventListener("click", () => req.onCancel());
	const submitEl = actions.createEl("button", {
		cls: "mod-cta",
		text: req.withSuggestion ? "Suggest" : "Comment",
	});
	submitEl.disabled = true;
	submitEl.addEventListener("click", submit);

	const focus = () => {
		card.scrollIntoView({ block: "nearest" });
		if (req.withSuggestion) composer.insertSuggestion();
		else composer.focus();
	};

	return {
		focus,
		destroy: () => {
			composer.destroy();
			card.remove();
		},
	};
}
