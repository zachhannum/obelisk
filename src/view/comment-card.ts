import { Component, Notice, TFile, setIcon, setTooltip } from "obsidian";
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
 * How to start editing a given card's body, keyed by the card itself.
 *
 * The card is the handle the sidebar (and through it the context menu) already
 * has; this saves it from having to reach into the DOM and synthesise a click
 * on a button whose markup is this file's business. Weak, so a card that has
 * been re-rendered away takes its entry with it.
 */
const EDIT_OPENERS = new WeakMap<HTMLElement, () => void>();

/** Open the body editor on an already-rendered card. */
export function beginEditing(card: HTMLElement): void {
	EDIT_OPENERS.get(card)?.();
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
	// Detachment is only a problem while the comment is still open; see
	// `flagDetached`.
	card.toggleClass("is-detached", flagDetached(comment));

	// Requirement 4: clicking the card scrolls the editor to the passage.
	card.addEventListener("click", (evt) => {
		const target = evt.target as HTMLElement;
		// Not while the reader is using a control, a link, or the reply box.
		if (target.closest("button, textarea, a, .obelisk-composer")) return;
		plugin.scrollToComment(comment.id);
	});

	renderHeader(card, comment);

	if (flagDetached(comment)) {
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

	const body = card.createDiv({ cls: "obelisk-body" });
	if (comment.body) {
		renderCommentBody(body, comment.body, {
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
 * Whether losing the quoted text is worth flagging on this card.
 *
 * Only while the comment is open. A resolved comment that has come loose has
 * almost always come loose *because* it was settled — its suggestion was
 * applied, or the passage was rewritten in answer to it — so warning about it
 * is warning about the thing having worked. It keeps its quote and its card,
 * without the dashed border and the alert.
 */
function flagDetached(comment: ResolvedComment): boolean {
	return comment.state === "detached" && !comment.resolved;
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
	editedMarker(header, comment.edited);
}

/**
 * "edited" next to the timestamp. Driven by `edited` rather than `modified`,
 * which also moves when a comment is resolved or replied to — the reader is
 * being told the text in front of them was rewritten, not that something
 * somewhere on the record changed.
 */
function editedMarker(header: HTMLElement, edited: string | undefined): void {
	if (!edited) return;
	const el = header.createSpan({ cls: "obelisk-edited", text: "edited" });
	setTooltip(el, `Edited ${absoluteTime(edited)}`);
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
		editedMarker(head, reply.edited);

		// A reply is a comment body in every respect, so a counter-proposal in
		// one is applied from exactly where it is written.
		const body = el.createDiv({ cls: "obelisk-body" });
		renderCommentBody(body, reply.body, {
			app: ctx.plugin.app,
			sourcePath: ctx.file.path,
			component: ctx.component,
			suggestion: suggestionOptions(comment, ctx),
		});

		const edit = head.createEl("button", { cls: "obelisk-icon-button" });
		setIcon(edit, "pencil");
		setTooltip(edit, "Edit this reply");
		edit.addEventListener("click", () =>
			openEditor(el, body, comment, ctx, {
				value: reply.body,
				save: (next) =>
					void ctx.plugin.editReply(
						ctx.file,
						comment.id,
						reply.id,
						next,
					),
			}),
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

	const reply = actions.createEl("button", { text: "Reply" });
	reply.addEventListener("click", () => openComposer(card, comment, ctx));

	const startEdit = () => {
		const body = card.querySelector<HTMLElement>(":scope > .obelisk-body");
		if (!body) return;
		openEditor(card, body, comment, ctx, {
			value: comment.body,
			save: (next) => void plugin.editComment(file, comment.id, next),
		});
	};
	EDIT_OPENERS.set(card, startEdit);

	actions
		.createEl("button", { text: "Edit" })
		.addEventListener("click", startEdit);

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
		Composer.focusWithin(existing);
		return;
	}

	const wrapper = card.createDiv({ cls: "obelisk-reply-composer" });
	const cancel = () => {
		composer.destroy();
		wrapper.remove();
	};
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
		onEscape: cancel,
	});

	const row = wrapper.createDiv({ cls: "obelisk-actions" });
	row.createEl("button", { cls: "mod-cta", text: "Reply" })
		.addEventListener("click", submit);
	row.createEl("button", { text: "Cancel" }).addEventListener(
		"click",
		cancel,
	);

	composer.focus();
}

interface EditTarget {
	/** The markdown as it stands. */
	value: string;
	save: (body: string) => void;
}

/**
 * Rewrite a body in place: the rendered markdown steps aside for the same
 * composer that wrote it, so a suggestion block can be fixed, added or removed
 * with the button that inserts one — rather than by hand-typing a fence.
 *
 * Saving writes through the plugin, which refreshes the sidebar and rebuilds
 * this card from the store; nothing here has to put the rendered body back.
 * Cancelling does, since no write happened.
 */
function openEditor(
	host: HTMLElement,
	bodyEl: HTMLElement,
	comment: ResolvedComment,
	ctx: CardContext,
	target: EditTarget,
): void {
	const existing = host.querySelector<HTMLElement>(":scope > .obelisk-editor");
	if (existing) {
		Composer.focusWithin(existing);
		return;
	}

	const wrapper = host.createDiv({ cls: "obelisk-editor" });
	bodyEl.after(wrapper);
	bodyEl.hide();

	const close = () => {
		composer.destroy();
		wrapper.remove();
		bodyEl.show();
	};

	const submit = () => {
		const body = composer.value.trim();
		if (!body) {
			new Notice("A comment needs a body. Delete it instead?");
			return;
		}
		// An unchanged body is a no-op in the store, so close on this side
		// rather than waiting for a re-render that will never come.
		if (body !== target.value.trim()) target.save(body);
		close();
	};

	const composer = new Composer(wrapper, {
		app: ctx.plugin.app,
		sourcePath: ctx.file.path,
		component: ctx.component,
		quote: comment.anchor.quote,
		value: target.value,
		placeholder: "Edit… (markdown, suggestions and all)",
		onSubmit: submit,
		onEscape: close,
	});

	const row = wrapper.createDiv({ cls: "obelisk-actions" });
	row.createEl("button", { cls: "mod-cta", text: "Save" })
		.addEventListener("click", submit);
	row.createEl("button", { text: "Cancel" }).addEventListener("click", close);

	composer.focus();
}

function notice(card: HTMLElement, icon: string, text: string): void {
	const el = card.createDiv({ cls: "obelisk-notice" });
	setIcon(el.createSpan({ cls: "obelisk-notice-icon" }), icon);
	el.createSpan({ text });
}
