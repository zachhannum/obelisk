import { Document, isMap, isScalar, parseDocument, visit } from "yaml";
import { DocFrame, frameFrom } from "./anchors";
import { normalize, serialize } from "./schema";
import {
	Comment,
	FRONTMATTER_KEY,
	SCHEMA_KEY,
	SCHEMA_VERSION,
} from "./types";

/**
 * A note as a string: reading the comment list out of its frontmatter, and
 * putting one back.
 *
 * This is what `processFrontMatter` does for the plugin, done over plain text
 * for everything that runs outside Obsidian. The two must agree on exactly one
 * thing, where the frontmatter ends and the body begins, so this file takes
 * that boundary from `frameFrom` rather than working it out again. Every
 * anchor in the note is measured from that line, and a writer that drew the
 * boundary somewhere else would shift all of them at once.
 *
 * The body is never touched. A write splices a new frontmatter block in front
 * of byte-identical body text, which is what makes it safe to do while
 * Obsidian has the note open: the editor's own text is unchanged, and every
 * anchor still resolves.
 */

/** A note file, parsed far enough to comment on. */
export interface Note {
	/** The file text this was read from, unchanged. */
	text: string;
	/** The comments in its frontmatter, coerced and validated. */
	comments: Comment[];
	/** The same text, indexed for anchoring. */
	frame: DocFrame;
}

/** Thrown when frontmatter exists but cannot be parsed. See `readNote`. */
export class NoteError extends Error {}

export function readNote(text: string, source = "<note>"): Note {
	const frame = frameFrom(text);
	const doc = frontmatterOf(text, frame, source);
	const fm = doc?.toJS();
	const data: Record<string, unknown> =
		fm && typeof fm === "object" && !Array.isArray(fm) ? fm : {};

	return {
		text,
		frame,
		comments: normalize(data[FRONTMATTER_KEY], source, data[SCHEMA_KEY]),
	};
}

/**
 * The note's text with `comments` written into its frontmatter.
 *
 * Everything else in the frontmatter survives: key order, other keys, and the
 * YAML comments between them, because the block is edited as a parsed document
 * rather than rebuilt. An empty list removes both of our keys, and removes the
 * whole block if they were all it held — a note that has never been commented
 * on and one whose last comment was deleted should look the same.
 */
export function writeComments(
	text: string,
	comments: readonly Comment[],
	source = "<note>",
): string {
	const frame = frameFrom(text);
	const body = text.slice(frame.bodyStart);
	// A fresh `Document` rather than a parsed empty one: a document parsed
	// from `{}` is a *flow* map, and every key set on it inherits that style,
	// which would write the whole comment list on one line.
	const doc = frontmatterOf(text, frame, source) ?? new Document();

	if (comments.length === 0) {
		doc.delete(FRONTMATTER_KEY);
		doc.delete(SCHEMA_KEY);
	} else {
		doc.set(FRONTMATTER_KEY, compactPositions(doc, comments));
		doc.set(SCHEMA_KEY, SCHEMA_VERSION);
	}

	// `lineWidth: 0` disables folding. A folded scalar would rewrap a comment
	// body — and a suggestion block inside it — at some column, which changes
	// the text of a proposal that is meant to land in the note verbatim.
	const yaml = isEmptyDoc(doc) ? "" : doc.toString({ lineWidth: 0 });
	if (!yaml) return body;
	return `---\n${yaml}${yaml.endsWith("\n") ? "" : "\n"}---\n${body}`;
}

/**
 * The comment list as YAML nodes, with `anchor.from` and `anchor.to` written
 * inline: `from: { line: 12, col: 0 }`.
 *
 * Obsidian's own frontmatter writer emits them that way, and a note that both
 * tools write to should not churn between two spellings of the same six
 * numbers every time the other one touches it.
 */
function compactPositions(doc: Document, comments: readonly Comment[]) {
	const node = doc.createNode(comments.map(serialize));

	visit(node, {
		Pair(_, pair) {
			const key = isScalar(pair.key) ? pair.key.value : undefined;
			if ((key === "from" || key === "to") && isMap(pair.value)) {
				pair.value.flow = true;
			}
		},
	});

	return node;
}

/**
 * The frontmatter block as a parsed YAML document, or null if there is none.
 *
 * Refuses rather than guesses when the YAML is broken: the alternative is
 * writing a fresh block over frontmatter we could not read, which loses
 * whatever the user had in there.
 */
function frontmatterOf(text: string, frame: DocFrame, source: string) {
	if (frame.bodyStart === 0) return null;

	// `bodyStartLine` is one past the closing fence, and line 0 is the opening
	// one, so the YAML itself is everything between them.
	const open = frame.lineStarts[1] ?? frame.bodyStart;
	const close = frame.lineStarts[frame.bodyStartLine - 1] ?? frame.bodyStart;
	const doc = parseDocument(text.slice(open, close), { keepSourceTokens: false });

	if (doc.errors.length > 0) {
		throw new NoteError(
			`${source}: frontmatter is not valid YAML (${doc.errors[0].message}); ` +
				"refusing to write over it",
		);
	}
	return doc;
}

function isEmptyDoc(doc: { toJS(): unknown }): boolean {
	const value = doc.toJS();
	return (
		value == null ||
		(typeof value === "object" && Object.keys(value).length === 0)
	);
}
