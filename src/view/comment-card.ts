import { Component, TFile, setIcon, setTooltip } from "obsidian";
import type ObeliskPlugin from "../main";
import { hasSuggestion } from "../suggestion/parse";
import { ResolvedComment } from "../types";
import { absoluteTime, relativeTime } from "../util/format";
import { Composer } from "./composer";
import { SuggestionOptions, renderCommentBody } from "./markdown";

export interface CardContext {
	plugin: ObeliskPlugin;
	file: TFile;
	/**
	 * Owns everything the markdown renderer creates. The sidebar hands over a
	 * fresh child component per render and unloads the previous one, so
	 * embeds, transclusions and their event handlers die with the card that
	 * held them rather than accumulating for the life of the leaf.
	 */
	component: Component;
}

/**
 * One comment in the sidebar: quoted text, the body as rendered markdown —
 * suggestion blocks and all — its replies, and the action row.
 */
export function renderCommentCard(
	container: HTMLElement,
	comment: ResolvedComment,
	ctx: CardContext,
): HTMLElement {
	const { plugin, file, component } = ctx;

	const card = container.createDiv({ cls: "obelisk-card" });
	card.dataset.obeliskId = comment.id;
	card.toggleClass("is-resolved", !!comment.resolved);
	card.toggleClass("is-detached", comment.state === "detached");

	// Requirement 4: clicking the card scrolls the editor to the passage.
	card.addEventListener("click", (evt) => {
		const target = evt.target as HTMLElement;
		// Not while the reader is using a control, a link, or the reply box.
		if (target.closest("button, textarea, a, .obelisk-composer")) return;
		plugin.scrollToComment(comment.id);
	});

	renderHeader(card, comment);

	if (comment.state === "detached") {
		notice(
			card,
			"alert-triangle",
			"The text this was written on has changed or been removed.",
		);
	}

	const quote = card.createDiv({ cls: "obelisk-quote", text: comment.anchor.quote });
	// Long quotes are clamped; clicking one opens it out rather than pushing
	// every other comment off the screen.
	quote.addEventListener("click", () => quote.toggleClass("is-expanded", !quote.hasClass("is-expanded")));

	if (comment.body) {
		renderCommentBody(card, comment.body, {
			app: plugin.app,
			sourcePath: file.path,
			component,
			suggestion: suggestionOptions(comment, ctx),
		});
	}

	renderReplies(card, comment, ctx);
	renderActions(card, comment, ctx);

	return card;
}

/**
 * How suggestion blocks in this thread behave: what they diff against, and
 * whether they can still be accepted.
 */
function suggestionOptions(
	comment: ResolvedComment,
	ctx: CardContext,
): SuggestionOptions {
	return {
		quote: comment.anchor.quote,
		applied: !!comment.appliedAt,
		blocked:
			comment.state === "detached"
				? "The quoted text is gone, so there is nothing to replace."
				: undefined,
		onApply: (replacement) =>
			void ctx.plugin.applySuggestion(ctx.file, comment.id, replacement),
	};
}

function renderHeader(card: HTMLElement, comment: ResolvedComment): void {
	const header = card.createDiv({ cls: "obelisk-card-header" });
	header.createSpan({
		cls: "obelisk-author",
		text: comment.author || "Anonymous",
	});

	if (comment.appliedAt) {
		header.createSpan({ cls: "obelisk-badge is-applied", text: "Applied" });
	} else if (hasSuggestion(comment)) {
		header.createSpan({ cls: "obelisk-badge", text: "Suggestion" });
	}

	const date = header.createSpan({
		cls: "obelisk-date",
		text: relativeTime(comment.created),
	});
	if (comment.created) setTooltip(date, absoluteTime(comment.created));
}

function renderReplies(
	card: HTMLElement,
	comment: ResolvedComment,
	ctx: CardContext,
): void {
	if (!comment.replies?.length) return;
	const list = card.createDiv({ cls: "obelisk-replies" });
	for (const reply of comment.replies) {
		const el = list.createDiv({ cls: "obelisk-reply" });
		const head = el.createDiv({ cls: "obelisk-card-header" });
		head.createSpan({
			cls: "obelisk-author",
			text: reply.author || "Anonymous",
		});
		const date = head.createSpan({
			cls: "obelisk-date",
			text: relativeTime(reply.created),
		});
		if (reply.created) setTooltip(date, absoluteTime(reply.created));

		// A reply is a comment body in every respect, so a counter-proposal in
		// one is applied from exactly where it is written.
		renderCommentBody(el, reply.body, {
			app: ctx.plugin.app,
			sourcePath: ctx.file.path,
			component: ctx.component,
			suggestion: suggestionOptions(comment, ctx),
		});
	}
}

function renderActions(
	card: HTMLElement,
	comment: ResolvedComment,
	ctx: CardContext,
): void {
	const { plugin, file } = ctx;
	const actions = card.createDiv({ cls: "obelisk-actions" });

	const reply = actions.createEl("button", { text: "Reply" });
	reply.addEventListener("click", () => openComposer(card, comment, ctx));

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
}

/**
 * The reply box is created on demand: a composer per card, always mounted,
 * would be a lot of DOM for a list that re-renders on every keystroke
 * elsewhere in the note.
 */
function openComposer(
	card: HTMLElement,
	comment: ResolvedComment,
	ctx: CardContext,
): void {
	const existing = card.querySelector<HTMLElement>(".obelisk-composer");
	if (existing) {
		existing.querySelector("textarea")?.focus();
		return;
	}

	const wrapper = card.createDiv({ cls: "obelisk-reply-composer" });
	const submit = () => {
		const body = composer.value.trim();
		if (!body) return;
		void ctx.plugin.addReply(ctx.file, comment.id, body);
	};

	const composer = new Composer(wrapper, {
		app: ctx.plugin.app,
		sourcePath: ctx.file.path,
		component: ctx.component,
		quote: comment.anchor.quote,
		placeholder: "Reply… (markdown, suggestions and all)",
		onSubmit: submit,
	});

	const row = wrapper.createDiv({ cls: "obelisk-actions" });
	row.createEl("button", { cls: "mod-cta", text: "Reply" })
		.addEventListener("click", submit);
	row.createEl("button", { text: "Cancel" }).addEventListener("click", () =>
		wrapper.remove(),
	);

	composer.focus();
}

function notice(card: HTMLElement, icon: string, text: string): void {
	const el = card.createDiv({ cls: "obelisk-notice" });
	setIcon(el.createSpan({ cls: "obelisk-notice-icon" }), icon);
	el.createSpan({ text });
}
