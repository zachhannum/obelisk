import { App, Component, MarkdownRenderer, setIcon, setTooltip } from "obsidian";
import { diffWords, renderDiff } from "../suggestion/diff";
import { SUGGESTION_LANG, findSuggestions } from "../suggestion/parse";

/**
 * What a rendered suggestion block can do, and against what.
 *
 * A comment card passes `onApply`; the compose preview does not, and gets the
 * same block rendered read-only. One renderer, so what you see while writing
 * is what the reader gets.
 */
export interface SuggestionOptions {
	/** The anchored text the proposal is diffed against. */
	quote: string;
	/** Accept the proposal. Omitted = read-only rendering. */
	onApply?: (replacement: string) => void;
	/** A suggestion in this thread has already been applied. */
	applied?: boolean;
	/** Why this cannot be applied right now, if it cannot. */
	blocked?: string;
}

export interface RenderOptions {
	app: App;
	/** Resolves links, embeds and transclusions in the comment. */
	sourcePath: string;
	/** Owns everything the render creates; unloaded by the caller. */
	component: Component;
	suggestion: SuggestionOptions;
}

/**
 * Render a comment or reply body.
 *
 * The body is plain markdown and goes through Obsidian's own renderer, so
 * links, embeds, callouts, tables and math all work exactly as they do in a
 * note. The one addition is that ```suggestion fenced blocks are swapped out
 * afterwards for a diff against the anchored text, with an Apply button —
 * GitHub's move, and the reason the proposal can live in the prose instead of
 * in a field beside it.
 *
 * Post-processing the rendered DOM (rather than registering a global code
 * block processor) keeps the treatment scoped to comment bodies: a
 * ```suggestion block typed into a *note* stays an ordinary code block.
 */
export function renderCommentBody(
	container: HTMLElement,
	markdown: string,
	opts: RenderOptions,
): HTMLElement {
	const host = container.createDiv({ cls: "obelisk-body markdown-rendered" });
	void MarkdownRenderer.render(
		opts.app,
		markdown,
		host,
		opts.sourcePath,
		opts.component,
	).then(() => {
		// The card may be gone by the time the renderer settles.
		if (host.isConnected) enhanceSuggestions(host, markdown, opts.suggestion);
	});
	return host;
}

/** Swap every rendered `suggestion` code block for a diff and an Apply button. */
function enhanceSuggestions(
	host: HTMLElement,
	markdown: string,
	opts: SuggestionOptions,
): void {
	const proposals = findSuggestions(markdown).map((block) => block.text);
	if (proposals.length === 0) return;

	for (const code of suggestionCode(host, proposals)) {
		const pre = code.parentElement;
		if (!pre) continue;
		// Obsidian's renderer terminates a code block with a newline that was
		// never part of the fenced content.
		const replacement = (code.textContent ?? "").replace(/\n$/, "");
		pre.replaceWith(suggestionBlock(replacement, opts));
	}
}

/**
 * The rendered code blocks that are suggestions.
 *
 * Normally that is the info string, which Obsidian puts on the element as a
 * `language-` class. The fallback matches on content instead, against the
 * blocks we parsed out of the same markdown: it costs little and means a
 * change in how Obsidian tags code blocks degrades a suggestion to a plain
 * code block in the *renderer's* opinion only, not in ours.
 */
function suggestionCode(
	host: HTMLElement,
	proposals: readonly string[],
): HTMLElement[] {
	const tagged = host.findAll(
		`pre > code[class~="language-${SUGGESTION_LANG}"]`,
	);
	if (tagged.length > 0) return tagged;

	const remaining = [...proposals];
	return host.findAll("pre > code").filter((code) => {
		const at = remaining.indexOf((code.textContent ?? "").replace(/\n$/, ""));
		if (at === -1) return false;
		remaining.splice(at, 1);
		return true;
	});
}

function suggestionBlock(
	replacement: string,
	opts: SuggestionOptions,
): HTMLElement {
	const block = createDiv({ cls: "obelisk-suggestion" });
	block.toggleClass("is-applied", !!opts.applied);

	const header = block.createDiv({ cls: "obelisk-suggestion-header" });
	setIcon(header.createSpan({ cls: "obelisk-suggestion-icon" }), "replace");
	header.createSpan({
		cls: "obelisk-suggestion-title",
		text: "Suggested change",
	});

	if (opts.applied) {
		const badge = header.createSpan({
			cls: "obelisk-badge is-applied",
			text: "Applied",
		});
		setTooltip(badge, "This thread's suggestion is already in the note.");
	} else if (opts.onApply) {
		const apply = header.createEl("button", {
			cls: "obelisk-apply mod-cta",
			text: "Apply",
		});
		const unchanged = replacement === opts.quote;
		apply.disabled = !!opts.blocked || unchanged;
		if (opts.blocked) setTooltip(apply, opts.blocked);
		else if (unchanged) {
			setTooltip(apply, "This suggestion matches the text as it stands.");
		}
		apply.addEventListener("click", (evt) => {
			evt.stopPropagation();
			opts.onApply?.(replacement);
		});
	}

	renderDiff(
		block.createDiv({ cls: "obelisk-diff" }),
		diffWords(opts.quote, replacement),
	);

	return block;
}
