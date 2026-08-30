import { Component, MarkdownRenderer, TFile, setIcon, setTooltip } from "obsidian";
import type ObeliskPlugin from "../main";
import { diffWords, renderDiff } from "../suggestion/diff";
import { ResolvedComment } from "../types";
import { absoluteTime, relativeTime } from "../util/format";

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
 * One comment in the sidebar: quoted text, body, optional suggestion diff,
 * and the action row.
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
	card.toggleClass("is-orphaned", comment.state === "orphaned");
	card.toggleClass("is-relocated", comment.state === "relocated");

	// Requirement 4: clicking the card scrolls the editor to the passage.
	card.addEventListener("click", (evt) => {
		const target = evt.target as HTMLElement;
		if (target.closest("button, textarea, a")) return;
		plugin.scrollToComment(comment.id);
	});

	renderHeader(card, comment);

	if (comment.state === "orphaned") {
		notice(
			card,
			"alert-triangle",
			"The commented text no longer exists in this note.",
		);
	} else if (comment.state === "relocated") {
		notice(
			card,
			"move",
			"The note moved since this was written; re-found by its quoted text.",
		);
	}

	const quote = card.createDiv({ cls: "obelisk-quote", text: comment.anchor.quote });
	// Long quotes are clamped; clicking one opens it out rather than pushing
	// every other comment off the screen.
	quote.addEventListener("click", () => quote.toggleClass("is-expanded", !quote.hasClass("is-expanded")));

	if (comment.body) {
		const body = card.createDiv({ cls: "obelisk-body" });
		void MarkdownRenderer.render(
			plugin.app,
			comment.body,
			body,
			file.path,
			component,
		);
	}

	if (comment.suggestion) renderSuggestion(card, comment);
	renderReplies(card, comment, ctx);
	renderActions(card, comment, ctx);

	return card;
}

function renderHeader(card: HTMLElement, comment: ResolvedComment): void {
	const header = card.createDiv({ cls: "obelisk-card-header" });
	header.createSpan({
		cls: "obelisk-author",
		text: comment.author || "Anonymous",
	});

	if (comment.suggestion?.appliedAt) {
		header.createSpan({
			cls: "obelisk-badge is-applied",
			text: "Applied",
		});
	} else if (comment.suggestion) {
		header.createSpan({ cls: "obelisk-badge", text: "Suggestion" });
	}

	const date = header.createSpan({
		cls: "obelisk-date",
		text: relativeTime(comment.created),
	});
	if (comment.created) setTooltip(date, absoluteTime(comment.created));
}

function renderSuggestion(card: HTMLElement, comment: ResolvedComment): void {
	const sug = card.createDiv({ cls: "obelisk-suggestion" });
	renderDiff(
		sug,
		diffWords(comment.anchor.quote, comment.suggestion!.replacement),
	);
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
		const body = el.createDiv({ cls: "obelisk-body" });
		void MarkdownRenderer.render(
			ctx.plugin.app,
			reply.body,
			body,
			ctx.file.path,
			ctx.component,
		);
	}
}

function renderActions(
	card: HTMLElement,
	comment: ResolvedComment,
	ctx: CardContext,
): void {
	const { plugin, file } = ctx;
	const actions = card.createDiv({ cls: "obelisk-actions" });

	if (comment.suggestion && !comment.suggestion.appliedAt) {
		const apply = actions.createEl("button", {
			cls: "mod-cta",
			text: "Apply suggestion",
		});
		apply.disabled = comment.state === "orphaned";
		if (apply.disabled) {
			setTooltip(
				apply,
				"The quoted text is gone, so there is nothing to replace.",
			);
		}
		apply.addEventListener("click", () =>
			plugin.applySuggestion(file, comment.id),
		);
	}

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
 * The reply box is created on demand: a textarea per card, always mounted,
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

	const composer = card.createDiv({ cls: "obelisk-composer" });
	const input = composer.createEl("textarea", { cls: "obelisk-compose-body" });
	input.placeholder = "Reply…";

	const row = composer.createDiv({ cls: "obelisk-actions" });
	const send = row.createEl("button", { cls: "mod-cta", text: "Reply" });
	const cancel = row.createEl("button", { text: "Cancel" });

	const submit = () => {
		const body = input.value.trim();
		if (!body) return;
		void ctx.plugin.addReply(ctx.file, comment.id, body);
	};

	send.addEventListener("click", submit);
	cancel.addEventListener("click", () => composer.remove());
	input.addEventListener("keydown", (evt) => {
		if (evt.key === "Enter" && (evt.metaKey || evt.ctrlKey)) {
			evt.preventDefault();
			submit();
		}
	});

	input.focus();
}

function notice(card: HTMLElement, icon: string, text: string): void {
	const el = card.createDiv({ cls: "obelisk-notice" });
	setIcon(el.createSpan({ cls: "obelisk-notice-icon" }), icon);
	el.createSpan({ text });
}
