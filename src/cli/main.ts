import { readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve as resolvePath } from "node:path";
import { parseArgs } from "node:util";
import { NoteError } from "../core/note";
import * as ops from "../core/ops";
import { Listing, Outcome, proposals } from "../core/ops";
import { Comment, Origin, ResolvedComment } from "../core/types";

/**
 * `obelisk` — the same comments, from outside Obsidian.
 *
 * Four verbs, and no verb for applying a suggestion: an agent that wants the
 * edit made can make it. Apply exists in the plugin because a *reader* needs
 * one click to take a proposal they did not write.
 *
 * Everything with a rule in it lives in `core/ops.ts`. This file is argument
 * parsing, file I/O, and the printing that makes a verbatim quote easy to copy
 * back in.
 */

const USAGE = `obelisk — read and write Obelisk comments on a note.

  obelisk list <note> [--open] [--json] [--no-body]
  obelisk comment <note> --quote "…" --body "…" [--near-line N] [--run ID]
  obelisk reply <note> <id> --body "…"
  obelisk resolve <note> <id> [--reopen]

Anchoring
  --quote is the passage the comment attaches to, and must appear in the note
  character for character. Copy it out of \`obelisk list\`. There is no way to
  pass a line or column: the quote is the anchor, and the tool does the
  arithmetic.

  If the quote appears more than once the write is refused; pass --near-line
  with the line number \`list\` printed to say which one you mean.

Attribution
  Comments written here are marked as coming from an agent, so the sidebar can
  badge them and dismiss a whole pass at once. Pass --run with the same id for
  every comment in one review; --human writes an ordinary human comment
  instead.

Options
  --vault DIR     Resolve <note> inside this vault (or $OBELISK_VAULT).
  --body -        Read the comment body from stdin, fences and all.
  --author NAME   Written into \`author\`. Defaults to the model, or "agent".
  --model NAME    Recorded on the comment as the model that wrote it.
  --run ID        Groups every comment from one review pass.
  --near-line N   Which occurrence of an ambiguous quote to anchor to.
  --open          list: only unresolved comments.
  --json          list: machine-readable output.
  --no-body       list: skip the line-numbered note body.
  --reopen        resolve: mark the comment open again.
  --human         Write as a person rather than as an agent.
`;

const OPTIONS = {
	quote: { type: "string" },
	body: { type: "string" },
	"near-line": { type: "string" },
	run: { type: "string" },
	model: { type: "string" },
	author: { type: "string" },
	vault: { type: "string" },
	open: { type: "boolean", default: false },
	json: { type: "boolean", default: false },
	"no-body": { type: "boolean", default: false },
	reopen: { type: "boolean", default: false },
	human: { type: "boolean", default: false },
	help: { type: "boolean", default: false },
} as const;

type Flags = ReturnType<typeof parse>["values"];

function parse(argv: string[]) {
	return parseArgs({
		args: argv,
		options: OPTIONS,
		allowPositionals: true,
	});
}

/** Anything the user did wrong, as opposed to anything Obelisk refused. */
class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
	let parsed;
	try {
		parsed = parse(argv);
	} catch (err) {
		process.stderr.write(`${message(err)}\n\n${USAGE}`);
		return 2;
	}

	const { values, positionals } = parsed;
	const [verb, ...rest] = positionals;

	if (values.help || !verb) {
		process.stdout.write(USAGE);
		return verb ? 0 : 2;
	}

	try {
		switch (verb) {
			case "list":
				return await listCommand(values, rest);
			case "comment":
				return await commentCommand(values, rest);
			case "reply":
				return await replyCommand(values, rest);
			case "resolve":
				return await resolveCommand(values, rest);
			default:
				throw new UsageError(`Unknown verb "${verb}".`);
		}
	} catch (err) {
		if (err instanceof UsageError) {
			process.stderr.write(`${err.message}\n\n${USAGE}`);
			return 2;
		}
		process.stderr.write(`${message(err)}\n`);
		return 1;
	}
}

// ── Verbs ────────────────────────────────────────────────────────────────────

async function listCommand(flags: Flags, args: string[]): Promise<number> {
	const path = notePath(flags, args[0]);
	const listing = ops.list(await read(path), basename(path));

	const shown = flags.open
		? listing.comments.filter((c) => !c.resolved)
		: listing.comments;

	if (flags.json) {
		process.stdout.write(
			JSON.stringify(
				{
					note: path,
					comments: shown.map((c) => asJson(c, listing)),
					...(flags["no-body"] ? {} : { body: listing.body }),
				},
				null,
				2,
			) + "\n",
		);
		return 0;
	}

	process.stdout.write(render(path, shown, listing, !flags["no-body"]));
	return 0;
}

async function commentCommand(flags: Flags, args: string[]): Promise<number> {
	const path = notePath(flags, args[0]);
	const quote = flags.quote;
	if (!quote) throw new UsageError("comment needs --quote.");

	const body = await bodyArg(flags);
	const nearLine = intArg(flags["near-line"], "--near-line");

	const result = await edit(path, (text) =>
		ops.comment(
			text,
			{ quote, body, nearLine, ...identity(flags) },
			basename(path),
		),
	);
	if (result === null) return 1;
	process.stdout.write(
		`Commented on ${basename(path)} as ${result.comment.id}.\n`,
	);
	return 0;
}

async function replyCommand(flags: Flags, args: string[]): Promise<number> {
	const path = notePath(flags, args[0]);
	const id = args[1];
	if (!id) throw new UsageError("reply needs the id of the comment to reply to.");

	const body = await bodyArg(flags);

	const result = await edit(path, (text) =>
		ops.reply(text, id, { body, ...identity(flags) }, basename(path)),
	);
	if (result === null) return 1;
	process.stdout.write(`Replied to ${id} as ${result.reply.id}.\n`);
	return 0;
}

async function resolveCommand(flags: Flags, args: string[]): Promise<number> {
	const path = notePath(flags, args[0]);
	const id = args[1];
	if (!id) throw new UsageError("resolve needs the id of a comment.");

	const result = await edit(path, (text) =>
		ops.resolve(text, id, !flags.reopen, basename(path)),
	);
	if (result === null) return 1;
	process.stdout.write(`${id} ${flags.reopen ? "reopened" : "resolved"}.\n`);
	return 0;
}

// ── Writing ──────────────────────────────────────────────────────────────────

/**
 * Run one operation and save the result, or refuse.
 *
 * The guard is read, work, re-read, and write only if the file is
 * byte-for-byte what it was. `processFrontMatter`
 * serializes writes *within* Obsidian and promises an outside process nothing,
 * so this is what stands between a review pass and the sentence someone is
 * typing. It turns the bad case into a refusal rather than a lost edit.
 *
 * The write itself is safe by construction: the body is spliced back
 * unchanged, so the editor's text and every anchor in it survive a frontmatter
 * rewrite even when Obsidian has the note open.
 */
async function edit<T>(
	path: string,
	operation: (text: string) => Outcome<T & { text: string }>,
): Promise<(T & { text: string }) | null> {
	const before = await read(path);
	const result = operation(before);

	if (!result.ok) {
		process.stderr.write(`${result.message}\n`);
		return null;
	}

	const now = await read(path);
	if (now !== before) {
		process.stderr.write(
			`${basename(path)} changed while this command was running. ` +
				"Nothing was written — run it again.\n",
		);
		return null;
	}

	await writeFile(path, result.value.text, "utf8");
	return result.value;
}

/** A note off disk, with a readable message when there isn't one there. */
async function read(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(`No note at ${path}.`);
		}
		throw err;
	}
}

// ── Output ───────────────────────────────────────────────────────────────────

/**
 * The listing, and then the body with line numbers down the side.
 *
 * The body is not padding. It is what makes a verbatim quote easy to copy and
 * `--near-line` cheap to supply, which is the pair of things that keep the
 * write path from refusing. The read verb matters as much as the write one.
 */
function render(
	path: string,
	comments: ResolvedComment[],
	listing: Listing,
	withBody: boolean,
): string {
	const open = comments.filter((c) => !c.resolved).length;
	const out: string[] = [
		`${path} — ${count(comments.length, "comment")}, ${open} open`,
		"",
	];

	if (comments.length === 0) {
		out.push("  (none)", "");
	}

	for (const comment of comments) {
		const line = ops.lineOf(comment, listing.frame);
		out.push(
			`  ${comment.id}  ${who(comment)}  ${
				line === null ? "detached" : `line ${line}`
			}${comment.resolved ? "  resolved" : ""}${badge(comment)}`,
		);
		out.push(`    quote: ${oneLine(comment.anchor.quote)}`);
		for (const text of comment.body.split("\n")) out.push(`    ${text}`);
		for (const reply of comment.replies ?? []) {
			out.push(`    ↳ ${reply.author || "anonymous"}: ${oneLine(reply.body)}`);
		}
		out.push("");
	}

	if (withBody) {
		const lines = listing.body.split("\n");
		const width = String(lines.length).length;
		out.push("Body:");
		lines.forEach((text, n) => {
			out.push(`${String(n + 1).padStart(width)} | ${text}`);
		});
	}

	return out.join("\n") + "\n";
}

function asJson(comment: ResolvedComment, listing: Listing) {
	return {
		id: comment.id,
		author: comment.author,
		origin: comment.origin,
		created: comment.created,
		resolved: !!comment.resolved,
		state: comment.state,
		line: ops.lineOf(comment, listing.frame),
		quote: comment.anchor.quote,
		body: comment.body,
		suggestions: proposals(comment),
		replies: (comment.replies ?? []).map((r) => ({
			id: r.id,
			author: r.author,
			created: r.created,
			body: r.body,
		})),
	};
}

function who(comment: Comment): string {
	const name = comment.author || "anonymous";
	const origin = comment.origin;
	if (!origin || origin.kind !== "agent") return name;
	const detail = [origin.model, origin.run && `run ${origin.run}`]
		.filter(Boolean)
		.join(", ");
	return `${name} (agent${detail ? `: ${detail}` : ""})`;
}

function badge(comment: Comment): string {
	const n = proposals(comment);
	if (n === 0) return "";
	return `  ${count(n, "proposal")}`;
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function oneLine(text: string, max = 120): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

// ── Arguments ────────────────────────────────────────────────────────────────

/**
 * Where the note is. A bare name is resolved inside the vault when there is
 * one, and `.md` is added if it was left off — an agent that has been told a
 * note's title should not have to know how it is stored.
 */
function notePath(flags: Flags, arg: string | undefined): string {
	if (!arg) throw new UsageError("Which note? Pass a path.");

	const vault = flags.vault ?? process.env.OBELISK_VAULT;
	const path =
		isAbsolute(arg) || !vault ? resolvePath(arg) : resolvePath(join(vault, arg));

	return path.endsWith(".md") ? path : `${path}.md`;
}

/** The body, from the flag or from stdin when it is `-`. */
async function bodyArg(flags: Flags): Promise<string> {
	if (flags.body === undefined) {
		throw new UsageError("This needs --body (or `--body -` to read stdin).");
	}
	if (flags.body !== "-") return flags.body;

	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

function intArg(raw: string | undefined, name: string): number | undefined {
	if (raw === undefined) return undefined;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1) {
		throw new UsageError(`${name} must be a positive line number.`);
	}
	return value;
}

/**
 * Who the comment is from.
 *
 * Agent by default, because that is what a headless writer is for, and because
 * attribution must not depend on a model remembering to declare itself. `--human` is there for the person driving the CLI by hand.
 */
function identity(flags: Flags): { author?: string; origin?: Origin } {
	if (flags.human) {
		return flags.author ? { author: flags.author } : {};
	}

	const origin: Origin = { kind: "agent" };
	if (flags.model) origin.model = flags.model;
	if (flags.run) origin.run = flags.run;

	return { author: flags.author ?? flags.model ?? "agent", origin };
}

function message(err: unknown): string {
	if (err instanceof NoteError || err instanceof Error) return err.message;
	return String(err);
}

main(process.argv.slice(2)).then(
	(code) => {
		process.exitCode = code;
	},
	(err) => {
		process.stderr.write(`${message(err)}\n`);
		process.exitCode = 1;
	},
);
