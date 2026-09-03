import { App, TFile } from "obsidian";
import { frameFrom, makeAnchor, resolve } from "../core/anchors";
import { Anchor, ResolvedComment } from "../types";

export type ApplyResult =
	| {
			ok: true;
			from: number;
			to: number;
			/**
			 * The applied comment's new anchor: it now quotes the replacement
			 * it asked for, so it stays attached to the passage it changed
			 * instead of detaching on text that no longer exists.
			 */
			anchor: Anchor;
	  }
	| { ok: false; reason: "already-applied" | "detached" };

/**
 * Requirement 2c: apply a suggested modification, GitHub-style.
 *
 * `replacement` is the content of one ```suggestion block from the thread —
 * the one whose Apply button was pressed. The comment does not "have" a single
 * suggestion any more than a GitHub review comment does; it has markdown, and
 * that markdown may propose several things.
 *
 * The contract that makes this safe: a suggestion is only applied where the
 * text is still character-for-character what the commenter quoted. That is the
 * same condition as being attached at all, so there is nothing extra to check
 * here — if `resolve` found the quote, the splice lands on exactly the text
 * the commenter saw; if it did not, we refuse with a reason rather than
 * overwriting text that has since changed.
 *
 * When the quote occurs more than once, we splice the occurrence `resolve`
 * picked — which is the one the sidebar and the editor were highlighting. The
 * user applies what they were looking at.
 *
 * The write goes through `vault.process` rather than the editor, so it works
 * on notes that are not open, and so the read and the write cannot interleave
 * with anything else touching the file.
 */
export async function applySuggestion(
	app: App,
	file: TFile,
	comment: ResolvedComment,
	replacement: string,
): Promise<ApplyResult> {
	if (comment.appliedAt) return { ok: false, reason: "already-applied" };

	let result: ApplyResult = { ok: false, reason: "detached" };

	await app.vault.process(file, (data) => {
		// Re-resolve against what is on disk right now, not against the
		// ResolvedComment the sidebar rendered from — the user may have typed
		// since.
		const fresh = resolve(comment, frameFrom(data));
		if (!fresh.range) return data;

		const { from, to } = fresh.range;
		const next = data.slice(0, from) + replacement + data.slice(to);

		result = {
			ok: true,
			from,
			to,
			anchor: makeAnchor(from, from + replacement.length, frameFrom(next)),
		};
		return next;
	});

	return result;
}
