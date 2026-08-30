import { EditorState } from "@codemirror/state";
import { App, TFile } from "obsidian";
import {
	frameFromState,
	makeAnchor,
	occurrenceCount,
	resolve,
} from "../store/anchors";
import { Anchor, Comment, ResolvedComment } from "../types";

export type ApplyResult =
	| {
			ok: true;
			from: number;
			to: number;
			/**
			 * Anchors to write back: the applied comment now covers the
			 * replacement, and everything after the splice point has shifted.
			 */
			anchors: Array<{ id: string; anchor: Anchor }>;
	  }
	| {
			ok: false;
			reason: "orphaned" | "stale" | "ambiguous" | "already-applied";
	  };

/**
 * Requirement 2c: apply a suggested modification, GitHub-style.
 *
 * The contract that makes this safe: a suggestion is only applied when the
 * text on disk is still character-for-character what the commenter quoted.
 * Anything else and we refuse and tell the user, rather than silently
 * overwriting text that has since changed — the same guarantee GitHub gives
 * when it greys out a stale suggestion.
 *
 * That contract is about the *text*, not the stored coordinates. An `exact`
 * anchor satisfies it. So does a `relocated` one — relocation means the quote
 * was found verbatim, just somewhere other than the recorded line, which is
 * the normal state of affairs after the note is edited above the anchor or
 * from another device. Refusing there would reject an edit that is provably
 * safe. What we do refuse is an *ambiguous* relocation: if the quote occurs
 * more than once in the body we cannot tell which one the commenter meant,
 * and guessing would splice into the wrong paragraph.
 *
 * The write goes through `vault.process` rather than the editor, so it works
 * on notes that are not open, and so the read and the write cannot interleave
 * with anything else touching the file.
 */
export async function applySuggestion(
	app: App,
	file: TFile,
	comment: ResolvedComment,
	others: readonly Comment[] = [],
): Promise<ApplyResult> {
	const suggestion = comment.suggestion;
	if (!suggestion) return { ok: false, reason: "orphaned" };
	if (suggestion.appliedAt) return { ok: false, reason: "already-applied" };

	let result: ApplyResult = { ok: false, reason: "stale" };

	await app.vault.process(file, (data) => {
		// Re-resolve against what is on disk right now, not against the
		// ResolvedComment the sidebar rendered from — the user may have typed
		// since.
		const before = EditorState.create({ doc: data });
		const frame = frameFromState(before);
		const fresh = resolve(comment, before, frame, { reanchor: true });

		if (!fresh.range) {
			result = { ok: false, reason: "orphaned" };
			return data;
		}
		if (
			fresh.state === "relocated" &&
			occurrenceCount(comment.anchor.quote, before, frame, 2) > 1
		) {
			result = { ok: false, reason: "ambiguous" };
			return data;
		}

		const { from, to } = fresh.range;
		const next =
			data.slice(0, from) + suggestion.replacement + data.slice(to);

		result = {
			ok: true,
			from,
			to,
			anchors: reanchorAfterSplice(
				comment,
				others,
				{ from, to, replacement: suggestion.replacement },
				before,
				next,
			),
		};
		return next;
	});

	return result;
}

/**
 * Every comment in the note is anchored to a body offset, and the splice just
 * moved most of them.
 *
 * Rather than leaving them all to quote search on the next resolve — which is
 * ambiguous exactly where it matters most, among neighbours on the same line —
 * we translate each one across the edit while we still know precisely what
 * moved and by how much. Comments that straddle the splice are left alone:
 * their text genuinely changed, and orphaning them is the honest outcome.
 */
function reanchorAfterSplice(
	applied: ResolvedComment,
	others: readonly Comment[],
	splice: { from: number; to: number; replacement: string },
	before: EditorState,
	afterText: string,
): Array<{ id: string; anchor: Anchor }> {
	const beforeFrame = frameFromState(before);
	const after = EditorState.create({ doc: afterText });
	const afterFrame = frameFromState(after);
	const delta = splice.replacement.length - (splice.to - splice.from);

	// The applied comment now quotes the text it asked for, so it stays exact
	// and the sidebar can show it as accepted rather than detached.
	const anchors: Array<{ id: string; anchor: Anchor }> = [
		{
			id: applied.id,
			anchor: makeAnchor(
				splice.from,
				splice.from + splice.replacement.length,
				after,
				afterFrame,
			),
		},
	];

	for (const other of others) {
		if (other.id === applied.id) continue;

		const resolved = resolve(other, before, beforeFrame, {
			reanchor: true,
		});
		if (!resolved.range) continue;

		let { from, to } = resolved.range;
		if (to <= splice.from) {
			// Entirely before the edit: unmoved.
		} else if (from >= splice.to) {
			from += delta;
			to += delta;
		} else {
			continue; // Overlaps the replaced text.
		}

		const anchor = makeAnchor(from, to, after, afterFrame);
		// Same freeze as the drift flush: never retarget a pending
		// suggestion's quote. See store/anchors.ts#pendingAnchorWrites.
		if (other.suggestion && !other.suggestion.appliedAt) {
			anchor.quote = other.anchor.quote;
		}
		anchors.push({ id: other.id, anchor });
	}

	return anchors;
}
