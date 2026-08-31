import { Anchor, BodyPos, Comment, ResolvedComment } from "./types";

/**
 * Anchor resolution: finding where each comment's quoted text lives in the
 * note as it stands right now.
 *
 * There is exactly one rule, and everything else in the plugin defers to it:
 *
 *   **The quote is the anchor.** Search the body for it.
 *     - found once     → attached there
 *     - found several  → attached to the occurrence nearest the stored
 *                        line/col, which is a hint and nothing more
 *     - not found      → detached
 *
 * Resolution is a pure function of the document text. It reads the stored
 * anchor and never writes one back, so there is no drift to flush, nothing
 * racing the editor, and no second opinion about where a comment lives. A
 * comment whose text was edited or deleted goes detached and stays detached
 * until that exact text comes back — which, since detachment is derived rather
 * than stored, means an undo silently reattaches it.
 *
 * The stored line/col earns its keep only when a quote appears more than once.
 * It is written when the comment is created and never updated, so it drifts as
 * the note is edited; that is fine, because it is only ever used to choose the
 * nearest of several identical candidates.
 *
 * See docs/DESIGN.md § Anchoring.
 */

/**
 * A document, indexed for anchoring: the text itself, where its body begins,
 * and the offset of every line start.
 *
 * Deliberately plain strings rather than a CodeMirror `EditorState`. The
 * editor and the on-disk apply path both need to resolve against text they
 * hold in different forms, and offsets into a string are exactly CodeMirror's
 * offsets.
 */
export interface DocFrame {
	/** The full document text this frame describes. */
	text: string;
	/** Offset at which the note body — everything past the frontmatter — begins. */
	bodyStart: number;
	/** 0-indexed line on which the body begins. */
	bodyStartLine: number;
	/** Offset of the start of each line, 0-indexed. */
	lineStarts: readonly number[];
}

// ── Frames ───────────────────────────────────────────────────────────────────

/**
 * Index a document for anchoring.
 *
 * The body start is derived from the text itself rather than from
 * `metadataCache`: the frame has to describe the exact text we are about to
 * anchor against, and the cache can lag the buffer by a reparse.
 */
export function frameFrom(text: string): DocFrame {
	const lineStarts = [0];
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
	}

	const bodyStartLine = bodyLineOf(text, lineStarts);
	return {
		text,
		lineStarts,
		bodyStartLine,
		bodyStart: lineStarts[bodyStartLine] ?? text.length,
	};
}

/** 0-indexed line on which the body begins, i.e. past the frontmatter block. */
function bodyLineOf(text: string, lineStarts: readonly number[]): number {
	if (lineOf(text, lineStarts, 0).trim() !== "---") return 0;

	for (let n = 1; n < lineStarts.length; n++) {
		const line = lineOf(text, lineStarts, n).trim();
		// `n` is the closing fence, so the body starts on the next line —
		// which may be one past the end, for a file that is only frontmatter.
		if (line === "---" || line === "...") return n + 1;
	}

	// An unterminated fence is not frontmatter; treat the whole file as body.
	return 0;
}

function lineOf(
	text: string,
	lineStarts: readonly number[],
	line: number,
): string {
	const next = lineStarts[line + 1];
	return text.slice(lineStarts[line], next === undefined ? text.length : next - 1);
}

// ── Resolution ───────────────────────────────────────────────────────────────

/** Resolve every comment against the document in one pass. */
export function resolveAll(
	comments: readonly Comment[],
	frame: DocFrame,
): ResolvedComment[] {
	return comments.map((c) => resolve(c, frame));
}

/**
 * Find `comment`'s quoted text in the body.
 *
 * The scan walks occurrences left to right and stops as soon as they start
 * getting further from the stored hint — distance to a fixed point is
 * decreasing and then increasing, so the first occurrence that fails to
 * improve is one past the best one. That bounds the search around the hint
 * instead of over the whole note, with no candidate cap to tune.
 */
export function resolve(comment: Comment, frame: DocFrame): ResolvedComment {
	const { quote } = comment.anchor;

	// An empty quote is "found" everywhere and would highlight nothing.
	if (quote.length === 0) return detached(comment);

	const hint = toOffset(comment.anchor.from, frame) ?? frame.bodyStart;
	let best = -1;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (
		let at = frame.text.indexOf(quote, frame.bodyStart);
		at !== -1;
		at = frame.text.indexOf(quote, at + quote.length)
	) {
		const distance = Math.abs(at - hint);
		if (distance >= bestDistance) break;
		best = at;
		bestDistance = distance;
	}

	if (best === -1) return detached(comment);
	return {
		...comment,
		range: { from: best, to: best + quote.length },
		state: "attached",
	};
}

function detached(comment: Comment): ResolvedComment {
	return { ...comment, range: null, state: "detached" };
}

// ── Coordinate conversion ────────────────────────────────────────────────────

/**
 * Body-relative position → absolute offset.
 * Returns null if the position is past the end of the document.
 */
export function toOffset(pos: BodyPos, frame: DocFrame): number | null {
	const line = frame.bodyStartLine + pos.line;
	if (line < 0 || line >= frame.lineStarts.length) return null;
	return Math.min(frame.lineStarts[line] + pos.col, lineEnd(frame, line));
}

/** Absolute offset → body-relative position. */
export function toBodyPos(offset: number, frame: DocFrame): BodyPos {
	const line = lineNumberAt(frame, offset);
	return {
		line: line - frame.bodyStartLine,
		col: offset - frame.lineStarts[line],
	};
}

/** The 0-indexed line containing `offset`, in whole-document coordinates. */
export function lineNumberAt(frame: DocFrame, offset: number): number {
	let lo = 0;
	let hi = frame.lineStarts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (frame.lineStarts[mid] <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

function lineEnd(frame: DocFrame, line: number): number {
	const next = frame.lineStarts[line + 1];
	return next === undefined ? frame.text.length : next - 1;
}

/**
 * Build an anchor for a range. Called when a comment is created, and again
 * when a suggestion is applied and the comment comes to quote its replacement.
 */
export function makeAnchor(from: number, to: number, frame: DocFrame): Anchor {
	return {
		from: toBodyPos(from, frame),
		to: toBodyPos(to, frame),
		quote: frame.text.slice(from, to),
	};
}
