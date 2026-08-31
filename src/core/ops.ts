import { DocFrame, lineNumberAt, makeAnchor, resolveAll } from "./anchors";
import { newCommentId } from "./id";
import { readNote, writeComments } from "./note";
import { findSuggestions, threadSuggestions } from "./suggestion";
import { Comment, Origin, Reply, ResolvedComment } from "./types";

/**
 * The four verbs, over a note's text and nothing else.
 *
 * Every one of them takes the file's contents and returns new contents, so the
 * CLI and the MCP server are I/O and argument parsing with no rules of their
 * own — and the rules live somewhere they can be reasoned about without a
 * vault. See docs/AGENT-INTEGRATION.md § 5.
 *
 * The one rule that matters is the anchor contract: **a caller never supplies
 * a line or a column.** It supplies the quote, and `locate` does the
 * arithmetic by mirroring `resolve()` exactly. A model asked for a line number
 * will produce a plausible one, and a plausible wrong one writes a
 * structurally valid anchor that points somewhere else — invisible until the
 * quote turns out to be ambiguous and the comment silently attaches to the
 * wrong twin. Refusing the field is the only version of this that cannot go
 * quietly wrong. See § 4.
 */

/**
 * The most comments one run may leave on one note before the write is refused.
 *
 * Enforced here because a description is advice; a caller that ignores its
 * budget still cannot turn a note's sidebar into a wall. The number stated to
 * the model is lower — see `SUGGESTED_BUDGET` — so the enforced cap is a
 * backstop rather than a target.
 */
export const MAX_COMMENTS_PER_RUN = 20;

/**
 * The budget the tool description quotes. Deliberately below the enforced cap:
 * forty comments is not a review, and neither is twenty. § 9 leaves both
 * numbers open; these are the starting positions.
 */
export const SUGGESTED_BUDGET = 8;

export type FailureCode =
	/** The quote is nowhere in the body. */
	| "quote-not-found"
	/** The quote appears more than once and no `nearLine` was given. */
	| "quote-ambiguous"
	/** The body's suggestion fences do not parse as intended. */
	| "bad-suggestion"
	/** A proposal that proposes the text it is replacing. */
	| "no-op-suggestion"
	/** This run has already left its allowance of comments on this note. */
	| "budget"
	/** No comment (or reply) with that id. */
	| "not-found"
	/** The note changed underneath the write, so nothing was saved. */
	| "conflict"
	/** A comment with nothing in it. */
	| "empty-body";

/** A refusal, with a message written to be read by whoever asked. */
export interface Failure {
	ok: false;
	code: FailureCode;
	message: string;
}

export type Outcome<T> = { ok: true; value: T } | Failure;

function fail(code: FailureCode, message: string): Failure {
	return { ok: false, code, message };
}

/** Who is writing. `origin` is omitted for a human, which is the default. */
export interface Identity {
	author?: string;
	origin?: Origin;
}

export interface CommentRequest extends Identity {
	/** Verbatim text from the note body. Never a paraphrase. */
	quote: string;
	/** Markdown, suggestion fences and all. */
	body: string;
	/**
	 * A 1-indexed body line, as printed by `list` — the tiebreak when `quote`
	 * appears more than once. Only ever used to choose between identical
	 * candidates, never to place the anchor.
	 */
	nearLine?: number;
}

export interface ReplyRequest extends Identity {
	body: string;
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface Listing {
	comments: ResolvedComment[];
	/** The note body, for printing line-numbered. */
	body: string;
	/** 0-indexed line the body starts on, to convert offsets for display. */
	frame: DocFrame;
}

export function list(text: string, source = "<note>"): Listing {
	const note = readNote(text, source);
	return {
		comments: resolveAll(note.comments, note.frame),
		body: text.slice(note.frame.bodyStart),
		frame: note.frame,
	};
}

/**
 * The 1-indexed body line a resolved comment sits on, for display. Null when
 * the comment is detached and so sits nowhere.
 */
export function lineOf(comment: ResolvedComment, frame: DocFrame): number | null {
	if (!comment.range) return null;
	return bodyLineAt(frame, comment.range.from) + 1;
}

// ── Writing ──────────────────────────────────────────────────────────────────

/**
 * Leave a comment on the passage `quote`, which must appear in the body
 * character for character.
 */
export function comment(
	text: string,
	request: CommentRequest,
	source = "<note>",
): Outcome<{ text: string; comment: Comment }> {
	const note = readNote(text, source);

	const bad = checkBody(request.body, request.quote);
	if (bad) return bad;

	const budget = checkBudget(note.comments, request.origin);
	if (budget) return budget;

	const at = locate(note.frame, request.quote, request.nearLine);
	if (!at.ok) return at;

	const created: Comment = {
		id: newCommentId(new Set(note.comments.map((c) => c.id))),
		...(request.author ? { author: request.author } : {}),
		...(request.origin ? { origin: request.origin } : {}),
		created: new Date().toISOString(),
		body: request.body.trim(),
		anchor: makeAnchor(at.value.from, at.value.to, note.frame),
	};

	return {
		ok: true,
		value: {
			text: writeComments(text, [...note.comments, created], source),
			comment: created,
		},
	};
}

/** Add a reply to an existing thread. */
export function reply(
	text: string,
	id: string,
	request: ReplyRequest,
	source = "<note>",
): Outcome<{ text: string; reply: Reply }> {
	const note = readNote(text, source);
	const target = note.comments.find((c) => c.id === id);
	if (!target) return missing(id, note.comments);

	const bad = checkBody(request.body, target.anchor.quote);
	if (bad) return bad;

	const added: Reply = {
		id: newCommentId(new Set((target.replies ?? []).map((r) => r.id))),
		...(request.author ? { author: request.author } : {}),
		created: new Date().toISOString(),
		body: request.body.trim(),
	};

	target.replies = [...(target.replies ?? []), added];
	target.modified = added.created;

	return {
		ok: true,
		value: { text: writeComments(text, note.comments, source), reply: added },
	};
}

/**
 * Mark a thread settled, or reopen it.
 *
 * Deliberately callable on a comment a person wrote: an agent asked to address
 * a comment and then close it is doing the job it was asked to do. That it
 * leaves no record of *who* closed it is an open question — see § 9.
 */
export function resolve(
	text: string,
	id: string,
	resolved: boolean,
	source = "<note>",
): Outcome<{ text: string; comment: Comment }> {
	const note = readNote(text, source);
	const target = note.comments.find((c) => c.id === id);
	if (!target) return missing(id, note.comments);

	target.resolved = resolved || undefined;
	target.modified = new Date().toISOString();

	return {
		ok: true,
		value: { text: writeComments(text, note.comments, source), comment: target },
	};
}

// ── The anchor contract ──────────────────────────────────────────────────────

/**
 * Turn a quote into a range, or refuse.
 *
 * The three cases are `resolve()`'s three cases, on purpose: a writer that is
 * more permissive than the resolver can create a comment the plugin then
 * cannot find, which reads to the user as Obelisk losing their comment.
 */
export function locate(
	frame: DocFrame,
	quote: string,
	nearLine?: number,
): Outcome<{ from: number; to: number }> {
	if (!quote) {
		return fail("quote-not-found", "A comment needs a quote to anchor to.");
	}

	const hits = occurrences(frame, quote);

	if (hits.length === 0) return notFound(frame, quote);

	if (hits.length === 1) {
		return { ok: true, value: { from: hits[0], to: hits[0] + quote.length } };
	}

	const lines = hits.map((at) => bodyLineAt(frame, at) + 1);
	if (nearLine === undefined) {
		return fail(
			"quote-ambiguous",
			`That text appears ${hits.length} times in the note, on lines ` +
				`${lines.join(", ")}. Quote more of the surrounding passage so it ` +
				"is unique, or pass the line you mean as --near-line.",
		);
	}

	// A line number past the end of the note is a guess, and a guess that
	// silently falls back to "nearest the top" is how the wrong twin gets
	// commented on. Refuse it the same way an unaccompanied ambiguity is
	// refused.
	const target = frame.lineStarts[frame.bodyStartLine + nearLine - 1];
	if (target === undefined) {
		const length = frame.lineStarts.length - frame.bodyStartLine;
		return fail(
			"quote-ambiguous",
			`There is no line ${nearLine} in this note — its body ends at line ` +
				`${length}. The occurrences of that text are on lines ` +
				`${lines.join(", ")}.`,
		);
	}

	let best = hits[0];
	for (const at of hits) {
		if (Math.abs(at - target) < Math.abs(best - target)) best = at;
	}
	return { ok: true, value: { from: best, to: best + quote.length } };
}

/** Every offset in the body at which `quote` occurs. */
function occurrences(frame: DocFrame, quote: string): number[] {
	const out: number[] = [];
	for (
		let at = frame.text.indexOf(quote, frame.bodyStart);
		at !== -1;
		at = frame.text.indexOf(quote, at + quote.length)
	) {
		out.push(at);
	}
	return out;
}

/**
 * The refusal that will actually fire, constantly, because a model asked to
 * quote a passage will paraphrase it, collapse its whitespace or straighten
 * its quotation marks.
 *
 * So the message does the one thing that turns a refusal into a retry: when a
 * loosened search finds the passage anyway, it hands back the note's own
 * wording to copy. What it does not do is *accept* that wording on the
 * caller's behalf. Storing a near-miss writes a comment that is born detached;
 * the exact text has to come from the note. See § 9.
 */
function notFound(frame: DocFrame, quote: string): Failure {
	const body = frame.text.slice(frame.bodyStart);
	const loose = looseMatch(body, quote);

	const hint = loose
		? `\n\nThe closest thing in the note is:\n\n    ${loose}\n\n` +
			"Quote that, character for character."
		: "";

	return fail(
		"quote-not-found",
		"That text is not in the note. The quote has to be verbatim — copy it " +
			"straight out of the listed note body, including its punctuation, " +
			"capitalisation and spacing." +
			hint,
	);
}

/**
 * A single match under collapsed whitespace and straightened punctuation, if
 * there is exactly one. Used only to quote the note's version back; nothing
 * anchors on it.
 */
function looseMatch(body: string, quote: string): string | null {
	const needle = loosen(quote);
	if (!needle) return null;

	// Walk the body's own offsets so the text handed back is the note's, not a
	// loosened rendering of it.
	const map: number[] = [];
	let hay = "";
	for (let i = 0; i < body.length; i++) {
		const ch = straighten(body[i]);
		// Collapsed whitespace: one space stands for any run of it.
		if (/\s/.test(ch)) {
			if (hay.endsWith(" ")) continue;
			hay += " ";
		} else {
			hay += ch;
		}
		map.push(i);
	}

	const at = hay.indexOf(needle);
	if (at === -1 || hay.indexOf(needle, at + 1) !== -1) return null;

	const from = map[at];
	const to = map[at + needle.length - 1] + 1;
	return body.slice(from, to);
}

/** Straighten quotes and dashes, collapse whitespace, for comparison only. */
function loosen(text: string): string {
	return straighten(text).replace(/\s+/g, " ").trim();
}

/** The punctuation half of `loosen`, safe to apply one character at a time. */
function straighten(text: string): string {
	return text
		.replace(/[‘’‛]/g, "'")
		.replace(/[“”‟]/g, '"')
		.replace(/[–—]/g, "-")
		.replace(/…/g, "...");
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * What a model gets wrong about a body, checked before anything is written.
 * Each of these is cheap, and each of them catches something that renders as a
 * broken card rather than as an error.
 */
function checkBody(body: string, quote: string): Failure | null {
	if (!body.trim()) {
		return fail("empty-body", "A comment needs a body.");
	}

	const blocks = findSuggestions(body);

	// Fences nest badly under generation: a suggestion containing a code
	// sample closes the wrong one, and the block that comes out is not the
	// block that was meant. Count the opening fences that look like proposals
	// and check the parser found the same number.
	const opened = (body.match(SUGGESTION_OPEN) ?? []).length;
	if (opened !== blocks.length) {
		return fail(
			"bad-suggestion",
			`This body opens ${opened} suggestion blocks but parses as ` +
				`${blocks.length}. A suggestion fence that contains a code fence ` +
				"has to be longer than the one inside it (````suggestion, then " +
				"````). Nothing was written.",
		);
	}

	const unclosed = blocks.find((b) => !b.closed);
	if (unclosed) {
		return fail(
			"bad-suggestion",
			`The suggestion block opened on line ${unclosed.startLine + 1} of the ` +
				"body is never closed, so it swallows everything after it.",
		);
	}

	// A proposal identical to what it replaces renders as an empty diff behind
	// an Apply button that does nothing.
	if (blocks.some((b) => b.text === quote)) {
		return fail(
			"no-op-suggestion",
			"One of these suggestion blocks proposes exactly the text it would " +
				"replace. Either change the proposal or leave a comment without one.",
		);
	}

	return null;
}

/** Matches an opening fence whose info string is `suggestion`. */
const SUGGESTION_OPEN = /^ {0,3}(?:`{3,}|~{3,})[ \t]*suggestion[ \t]*$/gim;

function checkBudget(
	existing: readonly Comment[],
	origin: Origin | undefined,
): Failure | null {
	const run = origin?.run;
	if (!run) return null;

	const already = existing.filter((c) => c.origin?.run === run).length;
	if (already < MAX_COMMENTS_PER_RUN) return null;

	return fail(
		"budget",
		`Run ${run} has already left ${already} comments on this note, which is ` +
			"the cap. A review is the few remarks worth reading, not every " +
			"remark that could be made — leave the rest out, or resolve some " +
			"first.",
	);
}

function missing(id: string, comments: readonly Comment[]): Failure {
	const known = comments.map((c) => c.id).join(", ");
	return fail(
		"not-found",
		`No comment with id "${id}" in this note.` +
			(known ? ` It has: ${known}.` : " It has no comments."),
	);
}

// ── Small helpers ────────────────────────────────────────────────────────────

/** 0-indexed body-relative line containing `offset`. */
function bodyLineAt(frame: DocFrame, offset: number): number {
	return lineNumberAt(frame, offset) - frame.bodyStartLine;
}

/** Whether a thread proposes anything, for one-line listing output. */
export function proposals(comment: Comment): number {
	return threadSuggestions(comment).length;
}
