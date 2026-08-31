/**
 * Suggestions live inside markdown, GitHub-style.
 *
 * A proposed edit is not a separate field on a comment — it is a fenced code
 * block in the comment's body, tagged `suggestion`:
 *
 *     Two clauses fighting for the same sentence.
 *
 *     ```suggestion
 *     The horse bolted.
 *     ```
 *
 * The body is markdown all the way through, so a comment can explain itself,
 * quote something, link elsewhere and propose a change without the plugin
 * inventing a second, poorer text format for any of it. Replies work the same
 * way, which is what makes "here's a counter-proposal" a reply rather than a
 * new comment.
 *
 * The block content is the replacement, verbatim: no trimming, no reflowing.
 * What is between the fences is exactly what lands in the note.
 */

/** The info string that turns a fenced block into a proposed edit. */
export const SUGGESTION_LANG = "suggestion";

export interface SuggestionBlock {
	/** The proposed replacement text, exactly as fenced. */
	text: string;
	/** 0-indexed line of the opening fence. */
	startLine: number;
	/** 0-indexed line of the closing fence, or of the last line if unclosed. */
	endLine: number;
	/**
	 * Whether the fence was actually closed. An unclosed one still parses —
	 * CommonMark runs it to the end of the string — but it is nearly always a
	 * generation accident rather than a proposal, so a writer can refuse it.
	 * See `core/ops.ts`.
	 */
	closed: boolean;
}

/**
 * An opening fence: up to three spaces of indent, three or more backticks or
 * tildes, then an info string. CommonMark forbids backticks in a backtick
 * fence's info string, and we only care about the first word of it anyway.
 */
const OPEN = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)/;
/** A closing fence: same character, at least as long, and nothing after it. */
const CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * Every suggestion block in a markdown string, in document order.
 *
 * This is a fence scanner rather than a regex over the whole text because
 * fences nest: a ```` ```suggestion ```` block may itself contain a fenced
 * code sample, and a suggestion mentioned inside some *other* fenced block is
 * a code sample, not a proposal.
 */
export function findSuggestions(markdown: string): SuggestionBlock[] {
	const lines = markdown.split("\n");
	const out: SuggestionBlock[] = [];

	for (let i = 0; i < lines.length; ) {
		const open = OPEN.exec(lines[i]);
		if (!open) {
			i++;
			continue;
		}

		const [, indent, fence, info] = open;
		const startLine = i;
		const content: string[] = [];
		i++;

		let endLine = lines.length - 1;
		let closed = false;
		for (; i < lines.length; i++) {
			const close = CLOSE.exec(lines[i]);
			if (
				close &&
				close[1][0] === fence[0] &&
				close[1].length >= fence.length
			) {
				endLine = i;
				closed = true;
				i++;
				break;
			}
			content.push(dedent(lines[i], indent.length));
			// An unclosed fence runs to the end of the string, per CommonMark.
			endLine = i;
		}

		if (info.toLowerCase() === SUGGESTION_LANG) {
			out.push({ text: content.join("\n"), startLine, endLine, closed });
		}
	}

	return out;
}

/** Whether a body proposes anything. Cheap enough to call per render. */
export function hasSuggestionBlock(markdown: string): boolean {
	return markdown.includes(SUGGESTION_LANG) && findSuggestions(markdown).length > 0;
}

/** The markdown with every suggestion block cut out — the prose around them. */
export function stripSuggestions(markdown: string): string {
	const blocks = findSuggestions(markdown);
	if (blocks.length === 0) return markdown;

	const lines = markdown.split("\n");
	const drop = new Set<number>();
	for (const block of blocks) {
		for (let n = block.startLine; n <= block.endLine; n++) drop.add(n);
	}

	return lines.filter((_, n) => !drop.has(n)).join("\n");
}

/**
 * Wrap text in a suggestion fence long enough to contain it — a replacement
 * that itself contains a code fence still round-trips.
 */
export function suggestionFence(text: string): string {
	const longest = (text.match(/`+/g) ?? []).reduce(
		(n, run) => Math.max(n, run.length),
		0,
	);
	const fence = "`".repeat(Math.max(3, longest + 1));
	return `${fence}${SUGGESTION_LANG}\n${text}\n${fence}`;
}

/** The whole thread's proposals: the comment's, then each reply's. */
export function threadSuggestions(comment: {
	body: string;
	replies?: ReadonlyArray<{ body: string }>;
}): string[] {
	const out = findSuggestions(comment.body).map((b) => b.text);
	for (const reply of comment.replies ?? []) {
		for (const block of findSuggestions(reply.body)) out.push(block.text);
	}
	return out;
}

/** Whether a comment or any of its replies proposes an edit. */
export function hasSuggestion(comment: {
	body: string;
	replies?: ReadonlyArray<{ body: string }>;
}): boolean {
	if (hasSuggestionBlock(comment.body)) return true;
	return (comment.replies ?? []).some((r) => hasSuggestionBlock(r.body));
}

/** Strip up to `n` leading spaces, the way an indented fence's content is. */
function dedent(line: string, n: number): string {
	let i = 0;
	while (i < n && line[i] === " ") i++;
	return line.slice(i);
}
