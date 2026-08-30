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

/**
 * Resolve every comment against the current document in one pass.
 */
export function resolveAll(
	comments: Comment[],
	state: EditorState,
	frame: DocFrame,
): ResolvedComment[] {
	return comments.map((c) => resolve(c, state, frame));
}

export function resolve(
	comment: Comment,
	state: EditorState,
	frame: DocFrame,
): ResolvedComment {
	// TODO: implement steps 1–3 above.
	// Sketch:
	//   const from = toOffset(comment.anchor.from, state, frame);
	//   const to   = toOffset(comment.anchor.to, state, frame);
	//   if (from != null && to != null && state.sliceDoc(from, to) === quote)
	//       return { ...comment, range: { from, to }, state: "exact" };
	//   return relocate(comment, state, frame);
	void state;
	void frame;
	return { ...comment, range: null, state: "orphaned" };
}

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
	return {
		from: toBodyPos(from, state, frame),
		to: toBodyPos(to, state, frame),
		quote: state.sliceDoc(from, to),
		prefix: state.sliceDoc(Math.max(0, from - ANCHOR_CONTEXT_CHARS), from),
		suffix: state.sliceDoc(
			to,
			Math.min(state.doc.length, to + ANCHOR_CONTEXT_CHARS),
		),
	};
}

/**
 * Step 2 of the strategy: find `quote` elsewhere in the document.
 *
 * TODO: implement. Scan with `state.doc.toString().indexOf(quote, i)`, score
 * each candidate by (prefix match length + suffix match length), break ties by
 * distance from the stored line, and bail out over a candidate cap so a
 * one-word quote in a huge note cannot stall the render.
 */
export function relocate(
	comment: Comment,
	state: EditorState,
	frame: DocFrame,
): ResolvedComment {
	void state;
	void frame;
	return { ...comment, range: null, state: "orphaned" };
}

/**
 * TODO: after a document change, comments whose anchors moved should have
 * their stored line/col rewritten — but writing frontmatter on every keystroke
 * is unacceptable. Plan: keep resolved ranges in a CM6 StateField mapped
 * through transactions, and flush the drifted positions back to frontmatter
 * on a debounce / on file close. This function is that flush.
 */
export function pendingAnchorWrites(
	_resolved: ResolvedComment[],
): Array<{ id: string; anchor: Anchor }> {
	return [];
}

export type { AnchorState };
