import { App, TFile } from "obsidian";
import { ResolvedComment } from "../types";

export type ApplyResult =
	| { ok: true; from: number; to: number }
	| { ok: false; reason: "orphaned" | "stale" | "already-applied" };

/**
 * Requirement 2c: apply a suggested modification, GitHub-style.
 *
 * The contract that makes this safe: a suggestion may only be applied when its
 * anchor resolves "exact" — i.e. the text on disk is still character-for-
 * character what the commenter saw. Anything else and we refuse and tell the
 * user, rather than silently overwriting text that has since changed. This is
 * the same guarantee GitHub gives when it greys out a stale suggestion.
 *
 * TODO: implement.
 *
 * Sketch:
 *   1. Re-resolve the comment against the *current* file contents (not the
 *      cached ResolvedComment — the user may have typed since the sidebar
 *      rendered).
 *   2. Bail unless state === "exact".
 *   3. Rewrite via `app.vault.process(file, (data) => ...)`, splicing
 *      `replacement` over [from, to). Using vault.process rather than the
 *      editor keeps it working when the note is not open in a leaf.
 *   4. Mark `suggestion.appliedAt`, or delete the comment entirely if
 *      settings.removeCommentOnApply.
 *   5. Every other comment in the file whose anchor sits after the splice
 *      point now has stale line/col. Rather than rewriting them all here, let
 *      the anchor layer relocate them via quote search on the next resolve —
 *      but do fix up anchors on the *same* line, where quote search is most
 *      likely to be ambiguous.
 *
 * Step 3 and step 4 are two writes to the same file. They must not interleave
 * with each other; sequence them and re-read between.
 */
export async function applySuggestion(
	app: App,
	file: TFile,
	comment: ResolvedComment,
): Promise<ApplyResult> {
	void app;
	void file;
	if (comment.suggestion?.appliedAt) {
		return { ok: false, reason: "already-applied" };
	}
	if (comment.state !== "exact" || !comment.range) {
		return { ok: false, reason: "orphaned" };
	}
	return { ok: false, reason: "stale" };
}
