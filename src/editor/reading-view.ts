import { hasSuggestion } from "../suggestion/parse";
import { Comment } from "../types";

/**
 * Requirement 5 in Reading view, via a MarkdownPostProcessor.
 *
 * Anchoring is the same rule as everywhere else — find the quoted text — but
 * against rendered HTML rather than the source buffer, which makes it weaker
 * and is meant to be. A quote that spans markup (`**bold**`, a link, a
 * footnote) will not be found, because the rendered text no longer contains
 * those characters. The caller has already decided, from the source, which
 * section a comment resolves to; this only has to find it inside that block.
 * An accepted limitation — the editor path is the contract; this is a nicety
 * on top.
 *
 * See docs/DESIGN.md § 5.
 */

/** A quote shorter than this matches too much of the average paragraph. */
const MIN_MATCHABLE = 2;

export function highlightQuoteInSection(
	root: HTMLElement,
	comment: Comment,
	onSelect: (id: string) => void,
): boolean {
	// Only the first line: rendered blocks break at markdown structure, so a
	// multi-line quote is rarely contiguous text in one element.
	const needle = comment.anchor.quote.split("\n")[0].trim();
	if (needle.length < MIN_MATCHABLE) return false;

	const nodes = textNodes(root);
	if (nodes.length === 0) return false;

	const haystack = nodes.map((n) => n.nodeValue ?? "").join("");
	const start = haystack.indexOf(needle);
	if (start === -1) return false;

	wrap(nodes, start, start + needle.length, comment, onSelect);
	return true;
}

/** Text nodes in document order, skipping anything we already decorated. */
function textNodes(root: HTMLElement): Text[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement;
			if (parent?.closest(".obelisk-marker")) return NodeFilter.FILTER_REJECT;
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	const out: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		out.push(node as Text);
	}
	return out;
}

/**
 * Wrap the character range [start, end) — which may span several text nodes,
 * because inline markup splits a sentence into pieces — in highlight spans.
 *
 * Splitting a node produces new nodes that are not in `nodes`, and we only
 * ever split the node we are currently on, so the precomputed offsets of the
 * nodes still to come stay valid.
 */
function wrap(
	nodes: readonly Text[],
	start: number,
	end: number,
	comment: Comment,
	onSelect: (id: string) => void,
): void {
	let offset = 0;
	let last: HTMLElement | null = null;

	for (const node of nodes) {
		const nodeStart = offset;
		const nodeEnd = offset + (node.nodeValue?.length ?? 0);
		offset = nodeEnd;

		if (nodeEnd <= start) continue;
		if (nodeStart >= end) break;

		let piece = node;
		if (start > nodeStart) piece = piece.splitText(start - nodeStart);
		const take = Math.min(end, nodeEnd) - Math.max(start, nodeStart);
		if (take < (piece.nodeValue?.length ?? 0)) piece.splitText(take);

		const span = document.createElement("span");
		span.className = highlightClass(comment);
		span.dataset.obeliskId = comment.id;
		span.addEventListener("click", (event) => {
			event.preventDefault();
			onSelect(comment.id);
		});

		piece.parentNode?.insertBefore(span, piece);
		span.appendChild(piece);
		last = span;
	}

	if (last) last.after(marker(comment, onSelect));
}

function highlightClass(comment: Comment): string {
	const classes = ["obelisk-highlight", "obelisk-reading-highlight"];
	if (comment.resolved) classes.push("is-resolved");
	if (hasSuggestion(comment)) classes.push("has-suggestion");
	if (comment.appliedAt) classes.push("is-applied");
	return classes.join(" ");
}

function marker(
	comment: Comment,
	onSelect: (id: string) => void,
): HTMLElement {
	const el = document.createElement("span");
	el.className = "obelisk-marker";
	el.dataset.obeliskId = comment.id;
	el.setAttribute("role", "button");
	el.setAttribute("tabindex", "0");
	el.setAttribute("aria-label", "Open comment");
	el.createSpan({
		cls: "obelisk-marker-glyph",
		text: hasSuggestion(comment) ? "‡" : "†",
	});
	el.addEventListener("click", (event) => {
		event.preventDefault();
		onSelect(comment.id);
	});
	return el;
}
