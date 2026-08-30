import { EditorState } from "@codemirror/state";
import {
	Anchor,
	ANCHOR_CONTEXT_CHARS,
	AnchorState,
	BodyPos,
	Comment,
	ResolvedComment,
} from "../types";

/**
 * Anchor resolution: turning stored, body-relative line/col ranges into
 * absolute offsets in the live document, and back.
 *
 * This is the part that decides whether the plugin feels solid or flaky.
 * The strategy, in order:
 *
 *   1. Convert the stored line/col to absolute offsets and check whether the
 *      text there still equals `anchor.quote`. If so → "exact".
 *   2. If not, search the document for `quote`. If exactly one match → use it.
 *      If several, pick the one whose surrounding text best matches
 *      `prefix`/`suffix`, and the one nearest the original line as a tiebreak.
 *      → "relocated" (the stored line/col should then be rewritten).
 *   3. If `quote` is nowhere to be found → "orphaned". The comment still shows
 *      in the sidebar, flagged, but decorates nothing.
 *
 * See docs/DESIGN.md § Anchoring for why we store both forms.
 */

export interface DocFrame {
	/** Absolute offset in the editor doc at which the note body begins. */
	bodyStart: number;
	/** Line number (0-indexed, editor coords) at which the note body begins. */
	bodyStartLine: number;
}

export interface ResolveOptions {
	/** Fall back to quote search when line/col no longer matches. */
	reanchor?: boolean;
}

/**
 * How many occurrences of a quote we are willing to score before giving up.
 * A one-word quote in a long note would otherwise make every resolve O(doc).
 */
const MAX_CANDIDATES = 256;

/** Below this length a quote is too generic to relocate on its own. */
const MIN_RELOCATABLE_QUOTE = 1;

// ── Frames ───────────────────────────────────────────────────────────────────

/**
 * Work out where the body starts by reading the document itself.
 *
 * Deliberately not `metadataCache`: the frame has to describe the exact text
 * we are about to anchor against, and the cache can lag the buffer by a
 * reparse. Scanning a handful of lines is cheaper than being wrong.
 */
export function frameFromState(state: EditorState): DocFrame {
	if (state.doc.lines === 0) return { bodyStart: 0, bodyStartLine: 0 };
	if (state.doc.line(1).text.trim() !== "---") {
		return { bodyStart: 0, bodyStartLine: 0 };
	}

	for (let n = 2; n <= state.doc.lines; n++) {
		const text = state.doc.line(n).text.trim();
		if (text === "---" || text === "...") {
			// `n` is 1-indexed and is the closing fence, so the body starts on
			// 1-indexed line n + 1 — which is 0-indexed line n.
			return frameFromBodyLine(state, n);
		}
	}

	// An unterminated fence is not frontmatter; treat the whole file as body.
	return { bodyStart: 0, bodyStartLine: 0 };
}

/** Frame for a body known to start at a given 0-indexed editor line. */
export function frameFromBodyLine(
	state: EditorState,
	bodyStartLine: number,
): DocFrame {
	const clamped = Math.max(0, Math.min(bodyStartLine, state.doc.lines - 1));
	return {
		bodyStart: state.doc.line(clamped + 1).from,
		bodyStartLine: clamped,
	};
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * Resolve every comment against the current document in one pass.
 */
export function resolveAll(
	comments: Comment[],
	state: EditorState,
	frame: DocFrame,
	opts: ResolveOptions = {},
): ResolvedComment[] {
	return comments.map((c) => resolve(c, state, frame, opts));
}

export function resolve(
	comment: Comment,
	state: EditorState,
	frame: DocFrame,
	opts: ResolveOptions = {},
): ResolvedComment {
	const { quote } = comment.anchor;

	// An empty quote can be "found" anywhere and highlights nothing, so it is
	// never anchored — not exact, not relocatable.
	if (quote.length === 0) return orphan(comment);

	const from = toOffset(comment.anchor.from, state, frame);
	const to = toOffset(comment.anchor.to, state, frame);

	if (
		from !== null &&
		to !== null &&
		to > from &&
		state.sliceDoc(from, to) === quote
	) {
		return { ...comment, range: { from, to }, state: "exact" };
	}

	if (opts.reanchor === false) return orphan(comment);
	return relocate(comment, state, frame);
}

/**
 * Step 2 of the strategy: find `quote` elsewhere in the document.
 *
 * Candidates are scored on how much of the stored prefix/suffix still
 * surrounds them, with distance from the stored position as the tiebreak — so
 * an unedited duplicate of the quote elsewhere in the note loses to the one
 * the comment was actually written against.
 */
export function relocate(
	comment: Comment,
	state: EditorState,
	frame: DocFrame,
): ResolvedComment {
	const { quote, prefix, suffix } = comment.anchor;
	if (quote.length < MIN_RELOCATABLE_QUOTE) return orphan(comment);

	const body = state.sliceDoc(frame.bodyStart);
	const expected =
		toOffset(comment.anchor.from, state, frame) ?? frame.bodyStart;

	let bestFrom = -1;
	let bestScore = -1;
	let bestDistance = Number.POSITIVE_INFINITY;

	let index = body.indexOf(quote);
	for (let seen = 0; index !== -1 && seen < MAX_CANDIDATES; seen++) {
		const from = frame.bodyStart + index;
		const to = from + quote.length;
		const score =
			commonSuffixLength(state.sliceDoc(Math.max(0, from - ANCHOR_CONTEXT_CHARS), from), prefix) +
			commonPrefixLength(
				state.sliceDoc(to, Math.min(state.doc.length, to + ANCHOR_CONTEXT_CHARS)),
				suffix,
			);
		const distance = Math.abs(from - expected);

		if (
			score > bestScore ||
			(score === bestScore && distance < bestDistance)
		) {
			bestFrom = from;
			bestScore = score;
			bestDistance = distance;
		}

		// Non-overlapping scan: a quote cannot start inside its own match.
		index = body.indexOf(quote, index + quote.length);
	}

	if (bestFrom === -1) return orphan(comment);
	return {
		...comment,
		range: { from: bestFrom, to: bestFrom + quote.length },
		state: "relocated",
	};
}

/**
 * How many times `quote` occurs in the body, counting up to `cap`.
 *
 * Used to decide whether a relocation is trustworthy: one occurrence means
 * there is nothing to confuse it with, several means we are guessing.
 */
export function occurrenceCount(
	quote: string,
	state: EditorState,
	frame: DocFrame,
	cap = MAX_CANDIDATES,
): number {
	if (quote.length === 0) return 0;
	const body = state.sliceDoc(frame.bodyStart);
	let count = 0;
	let index = body.indexOf(quote);
	while (index !== -1 && count < cap) {
		count++;
		index = body.indexOf(quote, index + quote.length);
	}
	return count;
}

function orphan(comment: Comment): ResolvedComment {
	return { ...comment, range: null, state: "orphaned" };
}

// ── Coordinate conversion ────────────────────────────────────────────────────

/**
 * Body-relative position → absolute document offset.
 * Returns null if the position is past the end of the document.
 */
export function toOffset(
	pos: BodyPos,
	state: EditorState,
	frame: DocFrame,
): number | null {
	const lineNo = frame.bodyStartLine + pos.line + 1; // CM lines are 1-indexed
	if (lineNo < 1 || lineNo > state.doc.lines) return null;
	const line = state.doc.line(lineNo);
	return Math.min(line.from + pos.col, line.to);
}

/**
 * Absolute document offset → body-relative position.
 */
export function toBodyPos(
	offset: number,
	state: EditorState,
	frame: DocFrame,
): BodyPos {
	const line = state.doc.lineAt(offset);
	return {
		line: line.number - 1 - frame.bodyStartLine,
		col: offset - line.from,
	};
}

/**
 * Build a fresh anchor for a selection. Called when a comment is created.
 */
export function makeAnchor(
	from: number,
	to: number,
	state: EditorState,
	frame: DocFrame,
): Anchor {
	const anchor: Anchor = {
		from: toBodyPos(from, state, frame),
		to: toBodyPos(to, state, frame),
		quote: state.sliceDoc(from, to),
	};
	const prefix = state.sliceDoc(
		Math.max(frame.bodyStart, from - ANCHOR_CONTEXT_CHARS),
		from,
	);
	const suffix = state.sliceDoc(
		to,
		Math.min(state.doc.length, to + ANCHOR_CONTEXT_CHARS),
	);
	if (prefix) anchor.prefix = prefix;
	if (suffix) anchor.suffix = suffix;
	return anchor;
}

// ── Drift write-back ─────────────────────────────────────────────────────────

/** A comment's range as CodeMirror has been mapping it through edits. */
export interface TrackedRange {
	id: string;
	from: number;
	to: number;
}

/**
 * Compute the frontmatter writes needed to catch stored anchors up with where
 * the text has actually moved.
 *
 * Highlights follow edits live inside CodeMirror (see editor/highlight-
 * extension.ts); writing that back on every keystroke would be unacceptable,
 * so the drift is flushed on a debounce and on file close. This function is
 * that flush: it turns mapped ranges into anchors, and returns only the ones
 * that actually differ from what is on disk.
 *
 * One rule earns its keep: a comment carrying an unapplied suggestion keeps
 * its original `quote`. Positions still move — an edit above it must not
 * detach it — but if the anchored text *itself* changed, freezing the quote is
 * what makes the anchor resolve as non-exact, which is what makes
 * `applySuggestion` refuse. Retargeting the quote here would quietly re-point
 * a suggestion at text its author never saw. See docs/DESIGN.md § 4.
 */
export function pendingAnchorWrites(
	comments: Comment[],
	tracked: readonly TrackedRange[],
	state: EditorState,
	frame: DocFrame,
): Array<{ id: string; anchor: Anchor }> {
	const byId = new Map(comments.map((c) => [c.id, c]));
	const writes: Array<{ id: string; anchor: Anchor }> = [];

	for (const range of tracked) {
		const comment = byId.get(range.id);
		if (!comment) continue;
		// Collapsed: the anchored text was deleted outright. Leave the stored
		// anchor alone so the comment orphans loudly instead of pointing at an
		// empty span.
		if (range.to <= range.from) continue;
		if (range.from < frame.bodyStart) continue;
		if (range.to > state.doc.length) continue;

		const next = makeAnchor(range.from, range.to, state, frame);
		if (comment.suggestion && !comment.suggestion.appliedAt) {
			next.quote = comment.anchor.quote;
		}
		if (!sameAnchor(comment.anchor, next)) {
			writes.push({ id: comment.id, anchor: next });
		}
	}

	return writes;
}

function sameAnchor(a: Anchor, b: Anchor): boolean {
	return (
		a.from.line === b.from.line &&
		a.from.col === b.from.col &&
		a.to.line === b.to.line &&
		a.to.col === b.to.col &&
		a.quote === b.quote &&
		(a.prefix ?? "") === (b.prefix ?? "") &&
		(a.suffix ?? "") === (b.suffix ?? "")
	);
}

// ── Text helpers ─────────────────────────────────────────────────────────────

/** Length of the longest common suffix of `text` and `expected`. */
function commonSuffixLength(text: string, expected?: string): number {
	if (!expected) return 0;
	let n = 0;
	while (
		n < text.length &&
		n < expected.length &&
		text[text.length - 1 - n] === expected[expected.length - 1 - n]
	) {
		n++;
	}
	return n;
}

/** Length of the longest common prefix of `text` and `expected`. */
function commonPrefixLength(text: string, expected?: string): number {
	if (!expected) return 0;
	let n = 0;
	while (n < text.length && n < expected.length && text[n] === expected[n]) {
		n++;
	}
	return n;
}

export type { AnchorState };
