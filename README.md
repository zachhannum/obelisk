# Obelisk

Inline comments and GitHub-style suggested edits for [Obsidian](https://obsidian.md).

Select a passage, leave a comment on it, and optionally propose a replacement
that can be applied with one click. Comments are stored in the note's own
frontmatter, so they travel with the file through sync, git, export and
rename.

> An *obelus* (†) was the mark ancient editors drew in the margin of a
> manuscript to say: this passage is disputed.

## Status

Early. Anchoring, decoration, the sidebar, suggested edits and the agent
integration are implemented. The plugin is in the Obsidian community plugin
directory, and the CLI and the MCP server are on npm as `obelisk-mcp`. None of
it has been exercised against a large vault.

## Install

Search for **Obelisk** in *Settings → Community plugins → Browse*, install it,
and enable it. Updates come from the same panel.

## Features

- **Comment on any passage.** Select text, right-click, *Add comment*.
- **Markdown everywhere.** Comments and replies are ordinary markdown, with a
  Write/Preview pair while you type. Links, lists, callouts, embeds and math
  render in the sidebar exactly as they would in a note.
- **Suggested edits.** A proposal is a fenced ` ```suggestion ` block *inside*
  the comment, the way GitHub does it. It renders as a diff against the quoted
  passage with an Apply button, so one comment can explain itself and propose a
  change, and a reply can offer a counter-proposal. Applying is refused if the
  underlying text has changed since. It also resolves the comment, and *Reopen*
  is there if the comment asked something the edit did not answer.
- **Sidebar.** All of a note's comments in document order, or newest first from
  the sort toggle. Click one to scroll the editor to it. Chips filter to open
  comments, to comments carrying a suggestion, or to one agent's review pass.
  Resolved comments stay in the list, grayed rather than hidden, since they are
  still highlighted in the note.
- **In-text highlighting.** Commented passages are highlighted, with a †
  marker that opens the comment in the sidebar.
- **Stored in frontmatter.** Plain YAML under an `obelisk` key. Readable,
  diffable, portable.
- **Survives editing.** A comment is anchored to the text it quotes, so it
  keeps up with edits anywhere else in the note, including ones made outside
  Obsidian. Edit or delete the quoted passage itself and the comment detaches:
  flagged in the sidebar, highlighting nothing, never moved onto a different
  passage and never dropped. Restore the text and it reattaches. Resolved
  comments are exempt from the flag, because a resolved comment usually
  detaches when the edit it asked for is made.
- **The editor you already use.** Comments are written in Obsidian's own
  markdown editor, so Cmd+B, list continuation, `[[` autocompletion and live
  preview work in a comment exactly as they do in a note.
- **Threaded replies.** On any comment, stored alongside it, and markdown all
  the way down.
- **Editable.** Rewrite a comment or a reply in the same composer that wrote
  it, suggestion button and all, from the card's *Edit* button or by
  right-clicking the passage. Edited bodies are marked as such. The anchor is
  left alone, so changing what you said never changes what you said it about.
- **Deletable.** A whole comment from the card's *Delete*, or a single reply
  from the trash icon in its header, so striking one remark out of a thread
  does not take the conversation with it. Both offer an undo rather than a
  confirmation dialog.
- **Open to agents.** A command-line tool and an MCP server read and write the
  same comments from outside Obsidian, so a model can review a note into the
  sidebar, or answer the comments left for it. Its comments are
  badged, and a whole review pass is one chip in the header with a *dismiss
  all* on it. See below.

## Data format

```yaml
---
obelisk:
  - id: cq7fk2m9x
    author: zach
    created: 2026-08-29T14:02:11.000Z
    body: |-
      This paragraph does two things at once.

      ```suggestion
      The horse bolted.
      ```
    anchor:
      from: { line: 12, col: 0 }
      to: { line: 12, col: 47 }
      quote: The horse, which had been standing there, bolted.
---
```

A comment is one piece of markdown. A proposed edit is a ` ```suggestion `
fenced block inside it, whose content replaces exactly the anchored range when
applied, so one comment can hold prose, a link and a proposal at once.

The `quote` is what a comment is anchored by. The line/column range records
where the passage was when the comment was written. It orders the sidebar and
breaks ties when a quote appears twice, and is never rewritten. Lines are
counted from the first line *after* the frontmatter block, so adding a comment
never invalidates the others.

A comment written by a model carries one more key, `origin`, holding the model
and an id shared by every comment in that review pass. Its absence means a
person wrote it, so nothing already in a vault needs migrating.

## Agents

The same comments, from outside Obsidian. A model reviews a note and its
remarks appear in the sidebar of the note you already have open. Or you leave
comments asking for things and a model reads them, makes the edits, and
resolves them.

```bash
npm install -g obelisk-mcp            # puts `obelisk` and `obelisk-mcp` on PATH

obelisk list note.md
obelisk comment note.md --quote "The horse, which had been standing there, bolted." \
  --body "Two clauses fighting over one sentence." --run r7k2mq
```

For an agent that speaks MCP, register the server with it:

```bash
claude mcp add obelisk --scope user -- npx -y obelisk-mcp
```

One registration covers every vault: the tools work on whichever vault the
agent is running in, and an absolute path reaches a note in one it is not. The
server is listed in the official MCP registry as `io.github.zachhannum/obelisk`
for a client that installs from there.

**The agent starts it.** It speaks MCP over stdio: the agent spawns a process
when a session opens and kills it when the session ends, so there is no port
and no daemon. One process per session is also what makes a session's comments
share one run chip in the sidebar. A session keeps the process it spawned, so a
new version of the package arrives at the next one. To take it sooner,
reconnect from `/mcp`.

To check the registration, `claude mcp list`, or `/mcp` inside a session. To
check the server itself with no agent in the way:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npx -y obelisk-mcp
```

That prints the handshake and then the four tools. A server that fails this
fails the same way for an agent.

For an agent that does not speak MCP, paste
[`docs/agents-fragment.md`](docs/agents-fragment.md) into the vault's
`AGENTS.md` or `CLAUDE.md`.

The one rule worth knowing: **the quote is the anchor.** A line number is never
one. A model asked for a line produces a plausible wrong number, which attaches
a comment to the wrong paragraph without looking like an error, so
`--near-line` only picks between identical quotes and takes a number copied out
of `obelisk list`. `--quote` has to appear in the note character for character,
and if it does not, or appears twice, nothing is written and the reason is
printed. `obelisk list` prints the body numbered so the exact text is there to
copy.

Writes are frontmatter-only and leave the body byte-identical, so they are safe
while the note is open in Obsidian. A write also re-reads the file first and
refuses if it changed underneath.

## Development

```bash
npm install
npm run dev      # watch build, plugin only
npm run build    # typecheck, then main.js plus dist/cli.mjs and dist/mcp.mjs
```

`src/core/` is the half that does not import Obsidian: the model, the anchor
arithmetic, the YAML and the four verbs. The plugin, the CLI and the MCP server
are three front ends over it.

`site/` is the documentation site, an Astro project of its own with its own
`npm install`. It is not part of `npm run build`.

Symlink the repo into a test vault to try it:

```bash
ln -s "$PWD" /path/to/vault/.obsidian/plugins/obelisk
```

## License

MIT
