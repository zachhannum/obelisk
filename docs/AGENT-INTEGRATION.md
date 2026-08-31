# Obelisk — agent integration

How a language model leaves a comment on a note, and how it reads the ones
already there.

**All three layers are built.** This was the design document; it has been kept
as one, with a note wherever the implementation settled something it left open.
It sits beside [`DESIGN.md`](DESIGN.md), which describes the plugin as it
exists, and inherits every decision made there.

Where things live: `src/core/` is the Obsidian-free half — the model, the
anchor arithmetic, the YAML, and the four verbs. `src/cli/` and `src/mcp/` are
the two front ends over it, built to `dist/` by `npm run build`.

---

## 1. The premise

The integration is mostly already built, because the storage format *is* the
interface. Comments are plain YAML under one frontmatter key, a suggested edit
is a fenced block inside an ordinary markdown body, and `normalize()` puts
unknown keys back on a round-trip. Any process that can edit a file can already
leave a comment that this plugin will render.

So the question is not how to give a model a channel. It is what a model gets
wrong when handed the format directly, and the answer is narrow:

| What an agent needs | Already true | What is missing |
|---|---|---|
| Somewhere to write | frontmatter, `store/frontmatter.ts` | — |
| A body format | markdown, suggestion fences | — |
| To be told apart from a person | `author`, free text | attribution that survives a batch |
| **An anchor** | `anchor.quote` + a line/col hint | a model cannot count lines |
| Not to corrupt the note | `processFrontMatter`, in-app only | a safe path from outside |

One of those rows is the whole problem. Everything below is arranged around it.

---

## 2. Three layers

Delivered in order, each useful on its own.

| Layer | What it is | Where it runs | Built |
|---|---|---|---|
| 0 | `origin` on a comment — attribution that a whole review pass shares | in the plugin | `core/types.ts`, `core/schema.ts`, `view/sidebar-view.ts` |
| 1 | `obelisk`, a headless reader/writer over the same core | Node, outside Obsidian | `core/ops.ts`, `core/note.ts`, `cli/` |
| 2 | an MCP server wrapping layer 1 | Node, outside Obsidian | `mcp/` |

Nothing in this list calls a model. See § 8.

---

## 3. Attribution

Add one field to `Comment`, and bump `SCHEMA_VERSION` to 3:

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

`kind` is `human` when absent, so every comment written before this exists is
already correct and no migration runs — the same read-time fold the schema 1
suggestion key gets.

**`run` is the half that earns its place.** A model does not leave a comment;
it leaves twenty, in one pass, and the only gesture a reader wants afterwards
is *all of these, gone*. A shared run id makes a pass an addressable thing: one
filter chip, one delete, one undo. Attribution per comment without it means
twenty deletions and no way to say which pass a comment came from once a second
one has run.

This is worth doing first and out of order, cheap now and awkward later:
comments written by a build that predates the field carry no `origin` at all,
and the alternative is inferring a machine author from a free-text name.

**Consequences in the sidebar.** An agent card is badged. Runs are filter
chips beside *Open*, and a chip has a *Dismiss all* on it. Agent comments are
not hidden by default and not sorted apart — they are comments, in document
order, or the feature is a second inbox rather than a review.

> **As built.** The run chip is labelled with the model, carries the run id and
> a count on its tooltip, and has an × that dismisses the pass with an undo
> notice rather than a confirmation — the same bargain every other deletion in
> the plugin makes. Dismissing restores each comment at its old index, so the
> undo does not reorder the frontmatter. A filter pinned to a run that has just
> been dismissed falls back to *All*.

---

## 4. The anchor contract

**An agent never supplies `line` or `col`.** It supplies the quote; the tool
does the arithmetic.

Models cannot count lines, and will produce a plausible number under any
prompt that asks for one. A wrong number is not a visible error: it writes a
structurally valid anchor whose hint points somewhere else, which costs nothing
until the quote turns out to be ambiguous and the comment silently attaches to
the wrong twin. Refusing to accept the field is the only version of this that
cannot go quietly wrong.

So the write path takes `--quote` and mirrors `resolve()` exactly:

- **found once** → compute `from`/`to` from the match, write the comment.
- **found several** → refuse, unless `--near-line` was given, in which case
  take the nearest occurrence, which is the tiebreak rule `resolve()` already
  applies at read time.
- **not found** → refuse, and say that the quote must be verbatim.

The third case is the one that will actually fire, constantly, because a model
asked to quote a passage will paraphrase it, normalize its whitespace, or
straighten its quotation marks. That refusal is the feature. The alternative —
accepting a near-miss and storing it — writes a comment that is born detached
and reads to the user as the plugin losing their comment.

Whether to normalize smart quotes and collapsed whitespace before searching is
left open in § 9. The starting position is no: `resolve()` does not, and a
writer that is more permissive than the resolver can create a comment that the
plugin then cannot find.

> **As built.** Matching is strict, and the loosened search happens only *after*
> a failure: if straightening the punctuation and collapsing the whitespace
> finds exactly one match, the refusal quotes the note's own wording back and
> says to copy it. That is § 9's likely answer minus the half that stores
> anything — the exact text still has to come from the note.
>
> `--near-line` past the end of the note is refused too, rather than falling
> back to the nearest occurrence to the top. A number a model invented should
> not quietly resolve to the wrong twin, which is the whole argument of this
> section.

`list` prints the body line-numbered, which is what makes `--near-line` cheap
for the caller to supply and what makes a verbatim quote easy to copy. It is
the same reason the read verb matters as much as the write one.

---

## 5. Layer 1 — `obelisk`, headless

`store/anchors.ts` is already pure, and `normalize`/`serialize` touch Obsidian
nowhere. Extracting a `core/` that both the plugin and a Node entry point
import is a move of files, not a rewrite; the only new code underneath is
reading and writing frontmatter over `fs` instead of `processFrontMatter`.

> **As built.** It was a move of files. `store/anchors.ts` → `core/anchors.ts`,
> `suggestion/parse.ts` → `core/suggestion.ts`, `util/id.ts` → `core/id.ts`,
> and `normalize`/`serialize` out of `store/frontmatter.ts` into
> `core/schema.ts`, leaving `CommentStore` behind as the eighty lines that
> actually need Obsidian. `src/types.ts` is now a facade: the model comes from
> `core/types.ts`, and the settings and view ids that only mean something
> inside Obsidian stay put, so no plugin file had to learn about the split.
>
> The new code is `core/note.ts` — the frontmatter block over a string — and
> `core/ops.ts`, the four verbs. `note.ts` asks `frameFrom` where the body
> begins rather than deciding for itself, because that boundary is what every
> anchor in the file is measured from and two answers to it would shift all of
> them at once.

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

- Run the body through `suggestion/parse.ts` and reject if the blocks that come
  out are not the blocks intended. Fences nest badly under generation — a model
  writing a suggestion that contains a code sample will close the wrong one.
- Reject a suggestion block identical to its quote. A no-op proposal renders as
  an empty diff with an Apply button that does nothing.
- Cap comments per run, with the cap stated in the tool description rather than
  only enforced. An unconstrained model leaves forty comments on a page, and
  forty comments is not a review — it is a sidebar nobody opens twice.

> **As built.** All three, in `checkBody` and `checkBudget`. The fence check
> counts opening ` ```suggestion ` fences and refuses if the parser found a
> different number, which is what a suggestion containing a code sample looks
> like from outside. The budget is 20 per run per note, enforced, against 8
> stated in the tool description — § 9 asked for both numbers and this is where
> they landed.

**Reading is not the lesser direction.** The flow that will get the most use is
a person leaving a comment and asking an agent to address it: `list --open`
gives the bodies and the quoted passages, the agent edits the note, then
`resolve`. That is the same four verbs with no extra surface, and it is the one
where the agent is doing work the person actually queued.

---

## 6. Layer 2 — MCP

A thin wrapper over the same core, one tool per verb, no logic of its own.

```
claude mcp add obelisk --scope user -- \
  node "$PWD/dist/mcp.mjs" --vault /path/to/your/vault
```

This is the layer that makes the feature feel like an integration rather than a
script: the review is requested in the agent you already have open, and the
comments appear in the sidebar of the note you are already reading.

For agents without MCP, the same repo ships a fragment to paste into a vault's
`AGENTS.md` or `CLAUDE.md` — [`agents-fragment.md`](agents-fragment.md): the
format, the verbatim-quote rule, and the comment budget. It documents the CLI
rather than the YAML — an agent told to write frontmatter directly will get the
anchor wrong in exactly the way § 4 exists to prevent.

> **As built.** Four tools, `obelisk_list` / `obelisk_comment` /
> `obelisk_reply` / `obelisk_resolve`, and the descriptions are the point: a
> refusal is the main channel through which the anchor contract gets taught, so
> the rules are stated up front and every refusal comes back as a tool error
> with the message that fixes the call. The server mints one run id at startup
> and uses it for every comment that does not name its own, so a session's pass
> leaves one chip in the sidebar rather than twenty.
>
> **Registering it** is where the two sharp edges are, and neither announces
> itself. `claude mcp add` defaults to `--scope local`, which files the server
> under the directory it was run in: run it here and the server exists only in
> this repo, which is the one directory with no notes in it. And the `npx
> obelisk-mcp` this section originally showed resolves only *inside* this repo,
> off the local `package.json`; from anywhere else npm goes to the registry and
> 404s, because § 10's package is still `private`. So: `--scope user`, and an
> absolute path to `dist/mcp.mjs` until there is something to `npx`. The
> vault path must be absolute too — the server is spawned without a shell, so a
> `~` never expands, and the process's own cwd belongs to the agent.
>
> There is no server to start. Stdio means one process per session, spawned and
> killed by the agent, which is also what gives a session its single run id.
> `README.md` has the commands, including a stdio handshake to run by hand when
> the question is whether the server or the agent is at fault.

---

## 7. Writing while Obsidian is open

The one genuinely unresolved risk. `processFrontMatter` serializes writes
*within* the app and gives an external process no guarantee at all, so a CLI
write can race the editor over the same file.

Three options:

1. **Write from the CLI, guarded.** Re-read before writing and refuse if the
   file changed underneath. Obsidian picks up external changes, and a
   frontmatter-only edit does not disturb the body, so the live editor state
   and every anchor survive it.
2. **A desktop-only localhost socket in the plugin**, which the CLI prefers
   when it answers, so writes go through `processFrontMatter` whenever Obsidian
   is up. Strictly safer, meaningfully more code, and mobile-safe by
   construction because the socket simply never opens there — `isDesktopOnly`
   stays `false`.
3. Only run passes with the vault closed. Not a feature.

**Ship (1).** The normal case for a review pass is a note the user is not
typing into at that moment, the guard turns the bad case into a refusal rather
than a lost edit, and (2) is a known upgrade that changes no format and no
command. Revisit when it actually bites.

> **As built.** Read, work, re-read, and write only if the file is byte-for-byte
> what it was; otherwise refuse and say to run it again. The write itself
> splices a new frontmatter block in front of *unchanged* body text, so a note
> Obsidian has open keeps its editor state and every one of its anchors.

---

## 8. What this deliberately is not

**No model client in the plugin.** No API key in settings, no *Review this
note* button. It buys key storage, provider drift, streaming UI, cost display,
retries, and a mobile story — all to duplicate an agent the user already has
open in another window. The plugin's job is to be a good place for a comment to
land, and every hour spent on a chat client is an hour not spent on that.

**No sidecar.** An agent's comments are the same object as a person's, in the
same file, subject to the same anchoring. A separate store for machine comments
would be a second sidebar, a second sync story, and a permanent question about
which one a reply belongs in.

**No new anchoring.** An agent gets `resolve()` and its refusals, unchanged. If
quote-only anchoring is too strict for a model, that is an argument about
§ 3a of `DESIGN.md`, to be had there and on its own terms.

---

## 9. Open questions

- ~~**Whitespace and smart-quote normalization on `--quote`.**~~ Settled, as
  the milder half of what this predicted: the search stays strict, and a
  loosened one runs only to *report* the note's wording back in the refusal.
  Nothing is stored that did not come out of the note. Reopen it if the
  refusals turn out to be frequent enough that reporting is not enough.
- **Replies from an agent.** A `Reply` has no `origin`, so a machine reply in a
  human thread is unbadged. Adding the field is trivial; whether an agent
  should be replying into a thread at all is the actual question.
- **Resolving someone else's comment.** `resolve` is currently a verb an agent
  can call on a comment a person wrote. Probably right — that is the point of
  asking it to address one — but it means a pass can close a thread the author
  considers open, and there is no record that it was an agent that did it.
  `origin` on the resolution, not just on the comment, would fix it.
- **Multi-agent runs.** `run` is a flat id. Two agents working the same note in
  parallel is not modelled, and probably should not be.
- ~~**Where the budget lives.**~~ Both, at 20 and 8. Whether either number is
  right is a question for a vault with real passes in it.
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

> **As built.** `npm run build` produces `main.js` for the plugin and
> `dist/cli.mjs` / `dist/mcp.mjs` for the two bins, from one `src/`. The bins
> are bundled rather than shipped with dependencies: `yaml` and the MCP SDK are
> build-time only, and the plugin half has no business carrying either. The
> package is still `private` — nothing here has been released yet — so the two
> bins are reachable through `npm link` or `npx .` until it is.
