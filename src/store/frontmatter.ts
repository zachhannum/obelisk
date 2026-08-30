import { App, TFile } from "obsidian";
import {
	Anchor,
	BodyPos,
	Comment,
	FRONTMATTER_KEY,
	Reply,
	SCHEMA_VERSION,
	Suggestion,
} from "../types";

const SCHEMA_KEY = FRONTMATTER_KEY + "_schema";

/**
 * Keys we know how to read. Anything else on a comment is stashed on
 * `EXTRA_KEYS` at read time and written back out by `serialize`, so a note
 * edited by a newer version of Obelisk does not lose fields when an older
 * version writes to it. See docs/DESIGN.md § Storage, "Forward compatibility".
 */
const KNOWN_COMMENT_KEYS = new Set([
	"id",
	"author",
	"created",
	"modified",
	"resolved",
	"body",
	"anchor",
	"suggestion",
	"replies",
	"tags",
]);

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

/**
 * The single place that reads and writes comments to disk.
 *
 * All mutations go through `app.fileManager.processFrontMatter`, which is the
 * only sanctioned way to edit frontmatter: it serializes concurrent writes,
 * preserves the rest of the YAML, and does not disturb the body (so live
 * editor state and anchors survive a write).
 */
export class CommentStore {
	constructor(private app: App) {}

	/**
	 * Read the comments for a file out of the metadata cache. Cheap — safe to
	 * call on every editor change. Returns [] for a file with no comments.
	 */
	read(file: TFile): Comment[] {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const raw = fm?.[FRONTMATTER_KEY];
		if (!raw) return [];
		return normalize(raw, file.path, fm?.[SCHEMA_KEY]);
	}

	/**
	 * Read-modify-write the comment array for a file.
	 *
	 * The mutator receives a mutable copy and either mutates it in place or
	 * returns a replacement.
	 */
	async update(
		file: TFile,
		mutate: (comments: Comment[]) => Comment[] | void,
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const current = normalize(
				fm[FRONTMATTER_KEY],
				file.path,
				fm[SCHEMA_KEY],
			);
			const next = mutate(current) ?? current;
			if (next.length === 0) {
				delete fm[FRONTMATTER_KEY];
				delete fm[SCHEMA_KEY];
			} else {
				fm[FRONTMATTER_KEY] = next.map(serialize);
				fm[SCHEMA_KEY] = SCHEMA_VERSION;
			}
		});
	}

	async add(file: TFile, comment: Comment): Promise<void> {
		await this.update(file, (comments) => {
			comments.push(comment);
		});
	}

	async remove(file: TFile, id: string): Promise<void> {
		await this.update(file, (comments) =>
			comments.filter((c) => c.id !== id),
		);
	}

	/**
	 * Merge `patch` into one comment.
	 *
	 * `touch` controls whether `modified` is bumped. Anchor drift flushes pass
	 * `false`: the reader did not change the comment, the text moved under it,
	 * and stamping every keystroke-driven flush would make `modified`
	 * meaningless.
	 */
	async patch(
		file: TFile,
		id: string,
		patch: Partial<Comment>,
		opts: { touch?: boolean } = {},
	): Promise<void> {
		await this.patchMany(file, [{ id, patch }], opts);
	}

	/**
	 * Apply several patches in a single frontmatter write. Applying a
	 * suggestion re-anchors every other comment in the note, and doing that as
	 * N separate writes would be N sync events and N metadata reparses.
	 */
	async patchMany(
		file: TFile,
		patches: Array<{ id: string; patch: Partial<Comment> }>,
		opts: { touch?: boolean } = {},
	): Promise<void> {
		if (patches.length === 0) return;
		const touch = opts.touch ?? true;
		const stamp = new Date().toISOString();

		await this.update(file, (comments) => {
			for (const { id, patch } of patches) {
				const target = comments.find((c) => c.id === id);
				if (!target) continue;
				Object.assign(target, patch);
				if (touch) target.modified = stamp;
			}
		});
	}

	/**
	 * Character offset in the raw file at which the body begins — i.e. just
	 * past the closing `---` of the frontmatter block. Anchors are stored
	 * relative to this point, so callers converting between stored positions
	 * and editor positions need it.
	 *
	 * Returns 0 for a file with no frontmatter.
	 *
	 * This is the metadata-cache route, for callers that have a TFile but no
	 * document text (the Reading-view post-processor). Anything holding an
	 * EditorState should use `anchors.frameFromState`, which derives the same
	 * number from the text it is about to anchor against and so cannot be
	 * stale with respect to it.
	 */
	bodyOffset(file: TFile): { line: number; ch: number } {
		const pos =
			this.app.metadataCache.getFileCache(file)?.frontmatterPosition;
		if (!pos) return { line: 0, ch: 0 };
		// `pos.end.line` is the line of the closing `---`; the body starts on
		// the following line.
		return { line: pos.end.line + 1, ch: 0 };
	}
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

	const modified = str(entry.modified);
	if (modified) comment.modified = modified;

	if (entry.resolved === true) comment.resolved = true;

	const suggestion = normalizeSuggestion(entry.suggestion, source, id);
	if (suggestion) comment.suggestion = suggestion;

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

	const value: Anchor = { from, to, quote };
	const prefix = str(raw.prefix);
	if (prefix) value.prefix = prefix;
	const suffix = str(raw.suffix);
	if (suffix) value.suffix = suffix;

	return { value, extra: unknownKeys(raw, KNOWN_ANCHOR_KEYS) };
}

function normalizePos(raw: unknown): BodyPos | null {
	if (!isRecord(raw)) return null;
	const line = int(raw.line);
	const col = int(raw.col);
	if (line === undefined || col === undefined) return null;
	if (line < 0 || col < 0) return null;
	return { line, col };
}

function normalizeSuggestion(
	raw: unknown,
	source: string,
	id: string,
): Suggestion | null {
	if (raw == null) return null;
	if (!isRecord(raw)) {
		warn(source, `comment ${id}: malformed \`suggestion\`; ignoring it`);
		return null;
	}
	const replacement = str(raw.replacement);
	if (replacement === undefined) {
		warn(
			source,
			`comment ${id}: \`suggestion.replacement\` must be a string; ignoring it`,
		);
		return null;
	}
	const suggestion: Suggestion = { replacement };
	const appliedAt = str(raw.appliedAt);
	if (appliedAt) suggestion.appliedAt = appliedAt;
	return suggestion;
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
	if (comment.anchor.prefix) anchor.prefix = comment.anchor.prefix;
	if (comment.anchor.suffix) anchor.suffix = comment.anchor.suffix;
	Object.assign(anchor, extras?.anchor ?? {});

	const out: Record<string, unknown> = { id: comment.id };
	if (comment.author) out.author = comment.author;
	out.created = comment.created;
	if (comment.modified) out.modified = comment.modified;
	if (comment.resolved) out.resolved = true;
	out.body = comment.body;
	out.anchor = anchor;

	if (comment.suggestion) {
		const suggestion: Record<string, unknown> = {
			replacement: comment.suggestion.replacement,
		};
		if (comment.suggestion.appliedAt) {
			suggestion.appliedAt = comment.suggestion.appliedAt;
		}
		out.suggestion = suggestion;
	}

	if (comment.replies?.length) {
		out.replies = comment.replies.map((r) => {
			const reply: Record<string, unknown> = { id: r.id };
			if (r.author) reply.author = r.author;
			reply.created = r.created;
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
