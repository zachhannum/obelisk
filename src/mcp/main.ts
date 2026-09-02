import { readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve as resolvePath } from "node:path";
import { parseArgs } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { version } from "../../package.json";
import { newCommentId } from "../core/id";
import * as ops from "../core/ops";
import { Outcome } from "../core/ops";
import { ResolvedComment } from "../core/types";

/**
 * The same four verbs, over MCP.
 *
 * A thin wrapper with no logic of its own: every rule is in `core/ops.ts`, and
 * the only thing this file decides is what to say to a model. That matters
 * more here than in the CLI, because a refusal is the main channel through
 * which an agent learns the anchor contract, so the descriptions carry the
 * verbatim-quote rule, and the failure messages come straight back as text the
 * caller can act on.
 *
 *   claude mcp add obelisk --scope user -- \
 *     npx -y obelisk-mcp --vault /path/to/your/vault
 *
 * Stdio: the agent spawns one process per session and kills it at the end, so
 * there is nothing to start by hand, and RUN below is per session as a result.
 * The vault path is absolute because the process gets no shell and inherits
 * the agent's cwd, not the vault's. See the Agents section of README.md.
 */

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: { vault: { type: "string" } },
	allowPositionals: false,
});

const VAULT = values.vault ?? process.env.OBELISK_VAULT ?? process.cwd();

/**
 * One run id for the life of the server process, so a review pass leaves one
 * chip in the sidebar rather than twenty. A caller that knows better can pass
 * its own. Two agents working the same note in parallel is deliberately not
 * modelled.
 */
const RUN = newCommentId();

const server = new McpServer({ name: "obelisk", version });

const noteArg = z
	.string()
	.describe("Path to the note, relative to the vault root. `.md` optional.");

server.registerTool(
	"obelisk_list",
	{
		title: "List a note's comments",
		description:
			"Every Obelisk comment on a note, with the passage each one is " +
			"anchored to, plus the note body with line numbers.\n\n" +
			"Read this before commenting: the `quote` you pass to obelisk_comment " +
			"has to be copied out of this body character for character, and the " +
			"line numbers here are what `nearLine` refers to.\n\n" +
			"It is also the first half of the other flow — a person leaves a " +
			"comment asking for something, you read it here, make the edit " +
			"yourself, and call obelisk_resolve.",
		inputSchema: {
			note: noteArg,
			openOnly: z
				.boolean()
				.optional()
				.describe("Only unresolved comments. Defaults to false."),
			includeBody: z
				.boolean()
				.optional()
				.describe(
					"Include the line-numbered note body. Defaults to true; turn " +
						"it off only if you already have the text.",
				),
		},
	},
	async ({ note, openOnly, includeBody }) => {
		const path = notePath(note);
		const listing = ops.list(await readFile(path, "utf8"), basename(path));
		const shown = openOnly
			? listing.comments.filter((c) => !c.resolved)
			: listing.comments;

		return text(
			JSON.stringify(
				{
					note,
					comments: shown.map((c) => summarize(c, listing)),
					...(includeBody === false
						? {}
						: { body: numbered(listing.body) }),
				},
				null,
				2,
			),
		);
	},
);

server.registerTool(
	"obelisk_comment",
	{
		title: "Comment on a passage",
		description:
			"Leave a comment on one passage of a note. It appears in the " +
			"reader's Obsidian sidebar, badged as coming from an agent.\n\n" +
			"`quote` is the anchor and must appear in the note verbatim — the " +
			"same characters, punctuation, capitalisation and spacing. Copy it " +
			"from obelisk_list; do not retype it or tidy it up. There is no way " +
			"to pass a line or column, and you should not try to count them: " +
			"the quote is the anchor and the tool does the arithmetic. If the " +
			"quote is not found, or is found more than once, nothing is written " +
			"and you are told which.\n\n" +
			"`body` is markdown. To propose a specific rewrite, put it in a " +
			"```suggestion fenced block inside the body — its contents replace " +
			"exactly the quoted passage when the reader clicks Apply, so a " +
			"comment can explain itself and propose the change at once.",
		inputSchema: {
			note: noteArg,
			quote: z
				.string()
				.describe(
					"The passage to anchor to, copied verbatim out of the note.",
				),
			body: z
				.string()
				.describe(
					"The comment, as markdown. A ```suggestion block inside it " +
						"proposes a replacement for the quoted passage.",
				),
			nearLine: z
				.number()
				.int()
				.positive()
				.optional()
				.describe(
					"Only when the quote appears more than once: the body line " +
						"number, as printed by obelisk_list, of the occurrence " +
						"you mean.",
				),
			run: z
				.string()
				.optional()
				.describe(
					"Groups the comments from one review pass so the reader can " +
						"dismiss them together. Defaults to this session's id; " +
						"pass the same value for every comment in a pass.",
				),
			model: z
				.string()
				.optional()
				.describe("Recorded on the comment as the model that wrote it."),
		},
	},
	async ({ note, quote, body, nearLine, run, model }) =>
		write(note, (current, source) =>
			ops.comment(
				current,
				{
					quote,
					body,
					nearLine,
					author: model ?? "agent",
					origin: { kind: "agent", ...(model ? { model } : {}), run: run ?? RUN },
				},
				source,
			),
		).then((result) =>
			result.ok
				? text(`Commented as ${result.value.comment.id}.`)
				: refusal(result.message),
		),
);

server.registerTool(
	"obelisk_reply",
	{
		title: "Reply to a comment",
		description:
			"Add a reply to an existing comment thread. A reply is markdown too, " +
			"so a counter-proposal is a ```suggestion block in one.\n\n" +
			"Use this to answer a question a person asked in a comment. To say " +
			"that you have done what a comment asked, edit the note and call " +
			"obelisk_resolve instead — a reply saying \"done\" leaves the thread " +
			"open.",
		inputSchema: {
			note: noteArg,
			id: z.string().describe("The comment's id, from obelisk_list."),
			body: z.string().describe("The reply, as markdown."),
			model: z
				.string()
				.optional()
				.describe("Written into the reply's author field."),
		},
	},
	async ({ note, id, body, model }) =>
		write(note, (current, source) =>
			ops.reply(current, id, { body, author: model ?? "agent" }, source),
		).then((result) =>
			result.ok
				? text(`Replied as ${result.value.reply.id}.`)
				: refusal(result.message),
		),
);

server.registerTool(
	"obelisk_resolve",
	{
		title: "Resolve or reopen a comment",
		description:
			"Mark a comment settled — the reader's sidebar greys it out and " +
			"drops it from the open count.\n\n" +
			"This is what closes the loop on a comment a person left for you: " +
			"read it, make the edit in the note yourself, then resolve it. " +
			"Resolving a comment you did not write is allowed, but it says the " +
			"thing it asked for has been done, so only say that when it has.",
		inputSchema: {
			note: noteArg,
			id: z.string().describe("The comment's id, from obelisk_list."),
			reopen: z
				.boolean()
				.optional()
				.describe("Mark it open again instead. Defaults to false."),
		},
	},
	async ({ note, id, reopen }) =>
		write(note, (current, source) =>
			ops.resolve(current, id, !reopen, source),
		).then((result) =>
			result.ok
				? text(`${id} ${reopen ? "reopened" : "resolved"}.`)
				: refusal(result.message),
		),
);

// ── Plumbing ─────────────────────────────────────────────────────────────────

/**
 * Read, operate, and write only if the file has not moved underneath — the
 * same guard the CLI applies, for the same reason: Obsidian may have the note
 * open, and its writes are serialized only against each other.
 */
async function write<T>(
	note: string,
	operation: (text: string, source: string) => Outcome<T & { text: string }>,
): Promise<Outcome<T & { text: string }>> {
	const path = notePath(note);
	const before = await readFile(path, "utf8");
	const result = operation(before, basename(path));
	if (!result.ok) return result;

	if ((await readFile(path, "utf8")) !== before) {
		return {
			ok: false,
			code: "conflict",
			message:
				`${note} changed while this was being written, so nothing was ` +
				"saved. List it again and retry.",
		};
	}

	await writeFile(path, result.value.text, "utf8");
	return result;
}

function notePath(note: string): string {
	const path = isAbsolute(note)
		? resolvePath(note)
		: resolvePath(join(VAULT, note));
	return path.endsWith(".md") ? path : `${path}.md`;
}

function summarize(comment: ResolvedComment, listing: ops.Listing) {
	return {
		id: comment.id,
		author: comment.author,
		origin: comment.origin,
		created: comment.created,
		resolved: !!comment.resolved,
		// Detached means the quoted text is no longer in the note; the comment
		// is still shown, attached to nothing.
		state: comment.state,
		line: ops.lineOf(comment, listing.frame),
		quote: comment.anchor.quote,
		body: comment.body,
		replies: (comment.replies ?? []).map((r) => ({
			id: r.id,
			author: r.author,
			body: r.body,
		})),
	};
}

/** The body with line numbers, which is what `nearLine` counts. */
function numbered(body: string): string {
	return body
		.split("\n")
		.map((line, n) => `${n + 1} | ${line}`)
		.join("\n");
}

function text(value: string) {
	return { content: [{ type: "text" as const, text: value }] };
}

/**
 * A refusal is a tool error, not a sentence in a successful reply: the model
 * has to see that nothing was written, and the message is the whole of what it
 * needs to fix the call.
 */
function refusal(message: string) {
	return { content: [{ type: "text" as const, text: message }], isError: true };
}

await server.connect(new StdioServerTransport());
