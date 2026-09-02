# Obelisk agent integration

How a language model leaves a comment on a note, and how it reads the ones
already there. This sits beside [`DESIGN.md`](DESIGN.md) and inherits every
decision made there.

Where things live: `src/core/` is the model, the anchor arithmetic, the YAML
and the four verbs, and imports nothing from Obsidian. `src/cli/` and
`src/mcp/` are two front ends over it, built to `dist/` by `npm run build`.

---

## 1. The premise

The storage format is the interface. Comments are plain YAML under one
frontmatter key, a suggested edit is a fenced block inside an ordinary markdown
body, and `normalize()` puts unknown keys back on a round-trip. Any process
that can edit a file can leave a comment this plugin will render.

So the question is not how to give a model a channel. It is what a model gets
wrong when handed the format directly, and there are three answers. It cannot
count lines, so an anchor it supplies cannot be trusted. A free-text `author`
cannot tell one review pass from the next. And a write from outside the app has
no serialized path to the file. The anchor is the one that fails silently, and
the sections below are arranged around it.

---

## 2. Three layers

| Layer | What it is | Where it runs | Where it lives |
|---|---|---|---|
| 0 | `origin` on a comment: attribution that a whole review pass shares | in the plugin | `core/types.ts`, `core/schema.ts`, `view/sidebar-view.ts` |
| 1 | `obelisk`, a headless reader/writer over the same core | Node, outside Obsidian | `core/ops.ts`, `core/note.ts`, `cli/` |
| 2 | an MCP server wrapping layer 1 | Node, outside Obsidian | `mcp/` |

None of them calls a model. See § 8.

---

## 3. Attribution

A comment written from outside Obsidian carries one field beyond a person's:

```yaml
- id: cq7fk2m9x
  author: claude
  origin:
    kind: agent
    model: claude-opus-5
    run: r7k2mq
  created: 2026-08-29T14:02:11.000Z
  body: |-
    This paragraph does two things at once.
  anchor:
    from: { line: 12, col: 0 }
    to: { line: 12, col: 47 }
    quote: The horse, which had been standing there, bolted.
```

`kind` is `human` when absent, so every comment written before the field
existed is already correct and no migration runs. That is the same read-time
fold the schema 1 suggestion key gets.

`run` is the field that does the work. A model does not leave a comment; it
leaves twenty, in one pass, and the gesture a reader wants afterwards is *all
of these, gone*. A shared run id makes a pass something the reader can address:
filter to it, or dismiss it in one click. Attribution per comment without a run
id means twenty separate deletions, and no way to tell which pass a comment
came from once a second one has run.

In the sidebar, an agent's card is badged. Each run is a chip beside *Open*,
labelled with the model, carrying the run id and a count on its tooltip, with
an × that dismisses the pass. Dismissing offers an undo notice rather than a
confirmation, the same bargain every other deletion in the plugin makes, and
restores each comment at its old index so the frontmatter is not reordered. A
filter pinned to a run that has just been dismissed falls back to *All*.

Agent comments are not hidden by default and not sorted apart. They are
comments, in document order, or the feature is a second inbox rather than a
review.

---

## 4. The anchor contract

**An agent never supplies `line` or `col`.** It supplies the quote; the tool
does the arithmetic.

Models cannot count lines, and will produce a plausible number under any prompt
that asks for one. A wrong number is not a visible error: it writes a
structurally valid anchor whose hint points somewhere else, which costs nothing
until the quote turns out to be ambiguous and the comment attaches to the wrong
twin. Refusing the field is the only version of this that cannot go quietly
wrong.

So the write path takes `--quote` and mirrors `resolve()` exactly:

- **found once** computes `from`/`to` from the match and writes the comment.
- **found several** is refused, unless `--near-line` was given, in which case
  the nearest occurrence wins, which is the tiebreak `resolve()` already
  applies at read time. A `--near-line` past the end of the note is refused
  rather than falling back to the occurrence nearest the top, because a number
  a model invented should not quietly resolve to the wrong twin.
- **not found** is refused, with the note that the quote must be verbatim.

The third case fires constantly, because a model asked to quote a passage will
paraphrase it, normalize its whitespace, or straighten its quotation marks.
Refusing there is what keeps a bad anchor out of the file. Accepting a near
miss stores a comment that is born detached, which reads to the user as the
plugin losing their comment.

Matching is strict, and the loosened search runs only *after* a failure. If
straightening the punctuation and collapsing the whitespace finds exactly one
match, the refusal quotes the note's own wording back and says to copy it.
Nothing is stored that did not come out of the note, because a writer more
permissive than the resolver can create a comment the plugin then cannot find.

`list` prints the body line-numbered, which is what makes a verbatim quote easy
to copy and `--near-line` cheap to supply. The read verb matters as much as the
write one for that reason.

---

## 5. Layer 1: `obelisk`, headless

`core/` is what the CLI and the MCP server share with the plugin: the anchor
arithmetic, the suggestion parser, id generation, and `normalize`/`serialize`
in `core/schema.ts`. `CommentStore` stays behind in
`store/` as the eighty lines that actually need Obsidian. `src/types.ts` is a
facade over `core/types.ts` plus the settings and view ids that only mean
something inside the app, so the split does not reach any plugin file.

The code that only the bins need is `core/note.ts`, the frontmatter block over
a string, and `core/ops.ts`, the four verbs. `note.ts` takes the start of the body
from `frameFrom` rather than working it out again, because that boundary is
what every anchor in the file is measured from, and two answers to it would
shift all of them at once.

```
obelisk list <note> [--open] [--json]
obelisk comment <note> --quote "…" --body "…" [--near-line 40] [--run r7k2mq]
obelisk reply <note> <id> --body "…"
obelisk resolve <note> <id>
```

Four verbs, and no verb for applying a suggestion: an agent that wants the edit
made can make it. Apply exists because a *reader* needs one click to take a
proposal they did not write.

**Validation, all of it cheap, all of it catching something models do.**
`checkBody` runs the body through the suggestion parser and refuses if the
blocks that come out are not the blocks intended, by counting opening
` ```suggestion ` fences and comparing. Fences nest badly under generation: a
model writing a suggestion that contains a code sample will close the wrong
one. It also refuses a suggestion block identical to its quote, which would
render as an empty diff under an Apply button that does nothing. `checkBudget`
caps a run at 20 comments per note, against 8 stated in the tool description,
so the number a model plans against is lower than the number it can hit.

**Reading is not the lesser direction.** The flow that gets the most use is a
person leaving a comment and asking an agent to address it: `list --open` gives
the bodies and the quoted passages, the agent edits the note, then `resolve`.
That is the same four verbs with no extra surface, and it is the one where the
agent does work the person actually queued.

---

## 6. Layer 2: MCP

A thin wrapper over the same core, one tool per verb, no logic of its own:
`obelisk_list`, `obelisk_comment`, `obelisk_reply`, `obelisk_resolve`.

```
claude mcp add obelisk --scope user -- \
  node "$PWD/dist/mcp.mjs" --vault /path/to/your/vault
```

This is the layer that makes the feature feel like an integration rather than a
script: the review is requested in the agent you already have open, and the
comments appear in the sidebar of the note you are already reading.

The tool descriptions carry the anchor contract, because a refusal is the main
channel through which an agent learns it. The rules are stated up front and
every refusal comes back as a tool error with the message that fixes the call.

The server mints one run id at startup and uses it for every comment that does
not name its own, so a session's pass leaves one chip in the sidebar rather
than twenty. Stdio means one process per session, spawned and killed by the
agent, so there is no server to start and nothing to keep running.

Registering it is where the sharp edges are, and neither one produces an
error.
`claude mcp add` defaults to `--scope local`, which files the server under the
directory it was run in, so running it here registers a server that only exists
while you are in this repo. And `npx obelisk-mcp` resolves only *inside* this
repo, off the local `package.json`; from anywhere else npm goes to the registry
and 404s, because § 10's package is still `private`. So: `--scope user`, and an
absolute path to `dist/mcp.mjs` until there is something to `npx`. The vault
path must be absolute too, since the server is spawned without a shell, so a
`~` never expands, and the process's own working directory belongs to the
agent. `README.md` has the commands, including a stdio handshake to run by hand
when the question is whether the server or the agent is at fault.

For agents without MCP, the same repo ships a fragment to paste into a vault's
`AGENTS.md` or `CLAUDE.md`: [`agents-fragment.md`](agents-fragment.md), which
carries the format, the verbatim-quote rule and the comment budget. It
documents the CLI rather than the YAML, because an agent told to write
frontmatter directly will get the anchor wrong in exactly the way § 4 exists to
prevent.

---

## 7. Writing while Obsidian is open

`processFrontMatter` serializes writes *within* the app and gives an external
process no guarantee at all, so a CLI write can race the editor over the same
file.

The CLI writes anyway, guarded: read, work, re-read, and write only if the file
is byte-for-byte what it was, otherwise refuse and say to run it again. The
write splices a new frontmatter block in front of *unchanged* body text, so a
note Obsidian has open keeps its editor state and every one of its anchors.

The stronger version is a desktop-only localhost socket in the plugin, which
the CLI would use whenever it is listening, so writes go through
`processFrontMatter` whenever Obsidian is up. It is meaningfully more code, and mobile-safe by
construction because the socket never opens there and `isDesktopOnly` stays
`false`. It changes no format and no command, so it stays available as an
upgrade for whenever the guard turns out not to be enough.

---

## 8. What this deliberately is not

**No model client in the plugin.** No API key in settings, no *Review this
note* button. It buys key storage, provider drift, streaming UI, cost display,
retries, and a mobile story, all to duplicate an agent the user already has
open in another window. The plugin's job is to be a good place for a comment to
land.

**No sidecar.** An agent's comments are the same object as a person's, in the
same file, subject to the same anchoring. A separate store for machine comments
would mean a second sidebar and a second sync story, and would leave open the
question of which one a reply belongs in.

**No new anchoring.** An agent gets `resolve()` and its refusals, unchanged. If
quote-only anchoring is too strict for a model, that is an argument about § 3a
of `DESIGN.md`, to be had there and on its own terms.

---

## 9. Open questions

- **Replies from an agent.** A `Reply` has no `origin`, so a machine reply in a
  human thread is unbadged. Adding the field is trivial; whether an agent
  should be replying into a thread at all is the actual question.
- **Resolving someone else's comment.** `resolve` is a verb an agent can call
  on a comment a person wrote. Probably right, since that is the point of
  asking it to address one, but it means a pass can close a thread the author
  considers open, and there is no record that it was an agent that did it.
  `origin` on the resolution, not just on the comment, would fix it.
- **Multi-agent runs.** `run` is a flat id. Two agents working the same note in
  parallel is not modelled, and probably should not be.
- **The budget numbers.** 20 enforced and 8 stated. Whether either is right is
  a question for a vault with real passes in it.
- **Attribution when a person drives the CLI.** `obelisk` writes agent comments
  by default and takes `--human` to opt out, because § 3's point is that
  attribution must not depend on a model remembering to declare itself. It does
  mean a person using the CLI by hand is an agent until they say otherwise.
- **A run that spans notes.** The budget counts comments per run *per note*,
  which is what a single file write can see. A pass over thirty notes has no
  ceiling other than thirty times the per-note one.

---

## 10. Packaging

`core/` ships from this repo. The CLI and the MCP server are published from it
as one npm package with two bins, versioned with the plugin, because they share
`SCHEMA_VERSION` and a mismatch there is exactly the failure the schema field
exists to warn about.

`npm run build` produces `main.js` for the plugin and `dist/cli.mjs` /
`dist/mcp.mjs` for the two bins, from one `src/`. The bins are bundled rather
than shipped with dependencies: `yaml` and the MCP SDK are build-time only, and
the plugin has no business carrying either. The package is `private` while
nothing here has been released, so the two bins are reachable through `npm
link` or `npx .` until it is published.
