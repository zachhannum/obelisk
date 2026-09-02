import { hasSuggestionBlock, suggestionFence } from "./suggestion";
import {
	Anchor,
	BodyPos,
	Comment,
	FRONTMATTER_KEY,
	Origin,
	Reply,
	SCHEMA_VERSION,
} from "./types";

/**
 * Reading and writing the comment list as plain data.
 *
 * This is the trust boundary between YAML and the rest of Obelisk, and it is
 * deliberately free of any notion of *where* the YAML came from: the plugin
 * hands it what `processFrontMatter` parsed, the CLI hands it what it parsed
 * off disk, and both get the same coercion, the same warnings and the same
 * forward compatibility.
 */

/**
 * Keys we know how to read. Anything else on a comment is stashed on
 * `EXTRA_KEYS` at read time and written back out by `serialize`, so a note
 * edited by a newer version of Obelisk does not lose fields when an older
 * version writes to it.
 */
const KNOWN_COMMENT_KEYS = new Set([
	"id",
	"author",
	"origin",
	"created",
	"modified",
	"edited",
	"resolved",
	"body",
	"anchor",
	"appliedAt",
	"replies",
	// Schema 1's separate suggestion field. Read so it can be folded into the
	// body (see `foldLegacySuggestion`) and dropped on the next write, rather
	// than preserved forever as an unknown key.
	"suggestion",
	"tags",
]);

// `prefix`/`suffix` are read so that context stored by an earlier version is
// recognised and dropped on the next write, rather than preserved forever as
// an unknown key. Nothing uses them: resolution matches on `quote` alone.
const KNOWN_ANCHOR_KEYS = new Set(["from", "to", "quote", "prefix", "suffix"]);

/**
 * Non-enumerable so it survives `Object.assign` (used by `patch`) but never
 * leaks into a spread — `{...comment}` is how ResolvedComment is built, and
 * those must not carry unknown keys back into the serializer twice.
 */
const EXTRA_KEYS = Symbol("obelisk.unknownKeys");

interface WithExtras {
	[EXTRA_KEYS]?: {
		comment: Record<string, unknown>;
		anchor: Record<string, unknown>;
	};
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Coerce whatever came out of YAML into a Comment[].
 *
 * This is the trust boundary: frontmatter is hand-editable, so every field is
 * checked and a bad entry is dropped with a warning rather than thrown. One
 * malformed comment must not take down the sidebar for the whole note.
 */
export function normalize(
	raw: unknown,
	source = "<unknown>",
	schema?: unknown,
): Comment[] {
	if (raw == null) return [];
	if (!Array.isArray(raw)) {
		warn(source, "expected a list under `" + FRONTMATTER_KEY + "`");
		return [];
	}

	if (typeof schema === "number" && schema > SCHEMA_VERSION) {
		warn(
			source,
			`written by a newer Obelisk (schema ${schema} > ${SCHEMA_VERSION}); ` +
				"unknown fields will be preserved but not understood",
		);
	}

	const out: Comment[] = [];
	const seen = new Set<string>();

	raw.forEach((entry, index) => {
		const comment = normalizeComment(entry, source, index);
		if (!comment) return;
		if (seen.has(comment.id)) {
			warn(source, `duplicate comment id "${comment.id}"; dropping`);
			return;
		}
		seen.add(comment.id);
		out.push(comment);
	});

	return out;
}

function normalizeComment(
	entry: unknown,
	source: string,
	index: number,
): Comment | null {
	const at = `entry ${index}`;
	if (!isRecord(entry)) {
		warn(source, `${at}: not a mapping; dropping`);
		return null;
	}

	// `id` is how every mutation targets a comment. A generated stand-in would
	// differ between reads, so patches would silently miss. Drop instead.
	const id = entry.id;
	if (typeof id !== "string" || id.length === 0) {
		warn(source, `${at}: missing or non-string \`id\`; dropping`);
		return null;
	}

	const anchor = normalizeAnchor(entry.anchor, source, `comment ${id}`);
	if (!anchor) return null;

	const comment: Comment = {
		id,
		created: str(entry.created) ?? "",
		body: str(entry.body) ?? "",
		anchor: anchor.value,
	};

	const author = str(entry.author);
	if (author) comment.author = author;

	const origin = normalizeOrigin(entry.origin);
	if (origin) comment.origin = origin;

	const modified = str(entry.modified);
	if (modified) comment.modified = modified;

	if (entry.resolved === true) comment.resolved = true;

	const appliedAt = str(entry.appliedAt);
	if (appliedAt) comment.appliedAt = appliedAt;

	foldLegacySuggestion(comment, entry.suggestion, source);

	const replies = normalizeReplies(entry.replies, source, id);
	if (replies.length > 0) comment.replies = replies;

	const tags = asArray(entry.tags)
		.map((t) => str(t))
		.filter((t): t is string => !!t);
	if (tags.length > 0) comment.tags = tags;

	const extraComment = unknownKeys(entry, KNOWN_COMMENT_KEYS);
	if (
		Object.keys(extraComment).length > 0 ||
		Object.keys(anchor.extra).length > 0
	) {
		Object.defineProperty(comment, EXTRA_KEYS, {
			value: { comment: extraComment, anchor: anchor.extra },
			enumerable: false,
			writable: true,
			configurable: true,
		});
	}

	return comment;
}

function normalizeAnchor(
	raw: unknown,
	source: string,
	at: string,
): { value: Anchor; extra: Record<string, unknown> } | null {
	if (!isRecord(raw)) {
		warn(source, `${at}: missing or malformed \`anchor\`; dropping`);
		return null;
	}

	const quote = str(raw.quote);
	if (quote === undefined) {
		warn(source, `${at}: \`anchor.quote\` must be a string; dropping`);
		return null;
	}

	const from = normalizePos(raw.from);
	if (!from) {
		warn(source, `${at}: malformed \`anchor.from\`; dropping`);
		return null;
	}

	// A hand-written anchor may reasonably give only the start. For a
	// single-line quote the end is implied, so fill it in rather than
	// discarding an otherwise usable comment.
	let to = normalizePos(raw.to);
	if (!to) {
		if (quote.includes("\n")) {
			warn(
				source,
				`${at}: malformed \`anchor.to\` on a multi-line quote; dropping`,
			);
			return null;
		}
		to = { line: from.line, col: from.col + quote.length };
	}

	return {
		value: { from, to, quote },
		extra: unknownKeys(raw, KNOWN_ANCHOR_KEYS),
	};
}

function normalizePos(raw: unknown): BodyPos | null {
	if (!isRecord(raw)) return null;
	const line = int(raw.line);
	const col = int(raw.col);
	if (line === undefined || col === undefined) return null;
	if (line < 0 || col < 0) return null;
	return { line, col };
}

/**
 * A missing or unreadable `origin` is a human comment, which is what the
 * absence of the field has always meant. Nothing here drops a comment: an
 * anchor that cannot be read makes a comment unplaceable, but not knowing who
 * wrote one never does.
 */
function normalizeOrigin(raw: unknown): Origin | undefined {
	if (!isRecord(raw)) return undefined;
	if (str(raw.kind) !== "agent") return undefined;

	const origin: Origin = { kind: "agent" };
	const model = str(raw.model);
	if (model) origin.model = model;
	const run = str(raw.run);
	if (run) origin.run = run;
	return origin;
}

/**
 * Schema 1 kept the proposed text in `suggestion.replacement`. It now lives in
 * the body as a ```suggestion fence, so a comment is markdown and nothing else.
 *
 * Migration is a read-time fold, not a rewrite pass: the note on disk is left
 * alone until something writes to it anyway, at which point `serialize` emits
 * the new shape and the old key falls away. Nothing is lost in between, and a
 * vault that is only ever read is never dirtied.
 */
function foldLegacySuggestion(
	comment: Comment,
	raw: unknown,
	source: string,
): void {
	if (raw == null) return;
	if (!isRecord(raw)) {
		warn(source, `comment ${comment.id}: malformed \`suggestion\`; ignoring it`);
		return;
	}

	const replacement = str(raw.replacement);
	if (replacement === undefined) {
		warn(
			source,
			`comment ${comment.id}: \`suggestion.replacement\` must be a string; ignoring it`,
		);
		return;
	}

	const appliedAt = str(raw.appliedAt);
	if (appliedAt && !comment.appliedAt) comment.appliedAt = appliedAt;

	// If the body already proposes something, the comment has been through a
	// newer Obelisk and the old field is a leftover, not a second suggestion.
	if (hasSuggestionBlock(comment.body)) return;

	const block = suggestionFence(replacement);
	comment.body = comment.body.trim()
		? `${comment.body.trimEnd()}\n\n${block}`
		: block;
}

function normalizeReplies(raw: unknown, source: string, id: string): Reply[] {
	return asArray(raw).flatMap((entry): Reply[] => {
		if (!isRecord(entry)) return [];
		const replyId = str(entry.id);
		if (!replyId) {
			warn(source, `comment ${id}: reply without an \`id\`; dropping`);
			return [];
		}
		const reply: Reply = {
			id: replyId,
			created: str(entry.created) ?? "",
			body: str(entry.body) ?? "",
		};
		const author = str(entry.author);
		if (author) reply.author = author;
		const edited = str(entry.edited);
		if (edited) reply.edited = edited;
		return [reply];
	});
}

// ── Serialization ────────────────────────────────────────────────────────────

/**
 * Convert a Comment to its on-disk form: a fixed key order, no runtime-only
 * fields, no empty values, and any unknown keys seen at read time put back.
 */
export function serialize(comment: Comment): Record<string, unknown> {
	const extras = (comment as Comment & WithExtras)[EXTRA_KEYS];

	const anchor: Record<string, unknown> = {
		from: { line: comment.anchor.from.line, col: comment.anchor.from.col },
		to: { line: comment.anchor.to.line, col: comment.anchor.to.col },
		quote: comment.anchor.quote,
	};
	Object.assign(anchor, extras?.anchor ?? {});

	const out: Record<string, unknown> = { id: comment.id };
	if (comment.author) out.author = comment.author;
	// `human` is the default, so writing it would be noise in every note that
	// has never seen an agent.
	if (comment.origin && comment.origin.kind !== "human") {
		const origin: Record<string, unknown> = { kind: comment.origin.kind };
		if (comment.origin.model) origin.model = comment.origin.model;
		if (comment.origin.run) origin.run = comment.origin.run;
		out.origin = origin;
	}
	out.created = comment.created;
	if (comment.modified) out.modified = comment.modified;
	if (comment.edited) out.edited = comment.edited;
	if (comment.resolved) out.resolved = true;
	out.body = comment.body;
	out.anchor = anchor;

	if (comment.appliedAt) out.appliedAt = comment.appliedAt;

	if (comment.replies?.length) {
		out.replies = comment.replies.map((r) => {
			const reply: Record<string, unknown> = { id: r.id };
			if (r.author) reply.author = r.author;
			reply.created = r.created;
			if (r.edited) reply.edited = r.edited;
			reply.body = r.body;
			return reply;
		});
	}

	if (comment.tags?.length) out.tags = [...comment.tags];

	// Unknown top-level keys last, and never allowed to clobber a key we own.
	for (const [key, value] of Object.entries(extras?.comment ?? {})) {
		if (!(key in out)) out[key] = value;
	}

	return out;
}

// ── Small helpers ────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	// YAML happily produces Dates for unquoted timestamps and numbers for
	// numeric-looking bodies; both are reasonable to accept.
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	return undefined;
}

function int(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return Math.trunc(value);
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function unknownKeys(
	source: Record<string, unknown>,
	known: ReadonlySet<string>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source)) {
		if (!known.has(key)) out[key] = value;
	}
	return out;
}

function warn(source: string, message: string): void {
	console.warn(`[obelisk] ${source}: ${message}`);
}
