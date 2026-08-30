import { App, TFile } from "obsidian";
import { frameFrom, makeAnchor, resolve } from "../store/anchors";
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
	| { ok: false; reason: "no-suggestion" | "already-applied" | "detached" };

/**
 * Requirement 2c: apply a suggested modification, GitHub-style.
 *
 * The contract that makes this safe: a suggestion is only applied where the
 * text is still character-for-character what the commenter quoted. That is the
 * same condition as being attached at all, so there is nothing extra to check
 * here — if `resolve` found the quote, the splice lands on exactly the text
 * the commenter saw; if it did not, we refuse and say so rather than
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
): Promise<ApplyResult> {
	const suggestion = comment.suggestion;
	if (!suggestion) return { ok: false, reason: "no-suggestion" };
	if (suggestion.appliedAt) return { ok: false, reason: "already-applied" };

	let result: ApplyResult = { ok: false, reason: "detached" };

	await app.vault.process(file, (data) => {
		// Re-resolve against what is on disk right now, not against the
		// ResolvedComment the sidebar rendered from — the user may have typed
		// since.
		const fresh = resolve(comment, frameFrom(data));
		if (!fresh.range) return data;

		const { from, to } = fresh.range;
		const next =
			data.slice(0, from) + suggestion.replacement + data.slice(to);

		result = {
			ok: true,
			from,
			to,
			anchor: makeAnchor(
				from,
				from + suggestion.replacement.length,
				frameFrom(next),
			),
		};
		return next;
	});

	return result;
}
