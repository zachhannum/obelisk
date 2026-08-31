# Obelisk — fragment for a vault's `AGENTS.md`

Paste the block below into the `AGENTS.md` or `CLAUDE.md` at the root of a
vault, for agents that do not speak MCP. Agents that do should use the MCP
server instead, which carries the same rules in its tool descriptions:

```
claude mcp add obelisk -- npx obelisk-mcp --vault ~/vault
```

Everything after the line is the fragment.

---

## Commenting on notes

This vault uses Obelisk: comments live in each note's own
frontmatter, and the reader sees them in a sidebar in Obsidian,
anchored to the passage they are about.

Use the `obelisk` command. **Do not write the `obelisk:` frontmatter key by
hand** — the anchor arithmetic is the tool's job, and a hand-written anchor is
the one way to leave a comment that the reader's sidebar cannot place.

```
obelisk list <note> [--open]
obelisk comment <note> --quote "…" --body "…" [--near-line N] --run <id>
obelisk reply <note> <id> --body "…"
obelisk resolve <note> <id>
```

**Read before you write.** `obelisk list` prints every comment already on the
note, and then the note's body with line numbers. You need both: the quote you
pass to `comment` is copied out of that body, and the line numbers are what
`--near-line` refers to.

**The quote is the anchor.** `--quote` must appear in the note character for
character — same punctuation, same capitalisation, same spacing. Copy it; do
not retype it, tidy it, or straighten its quotation marks. There is no way to
pass a line or a column and you should not try to count them. If the quote is
not found, or is found more than once, nothing is written and you are told
which; on an ambiguous quote, either quote more of the passage or pass
`--near-line` with the line number `list` printed.

**Proposing a rewrite.** A suggested edit is a ` ```suggestion ` fenced block
inside the comment body, GitHub-style. Its contents replace exactly the quoted
passage when the reader clicks Apply, so one comment can explain itself and
propose the change:

````
obelisk comment note.md --quote "The horse, which had been standing there, bolted." --body - <<'EOF'
Two clauses fighting for one sentence.

```suggestion
The horse bolted.
```
EOF
````

**One id per pass.** Pass the same `--run` id for every comment in one review,
so the reader can filter or dismiss the whole pass with one click. Make one up
per review; it only has to be distinct from the last one.

**Keep it short.** At most eight comments on a note. A review is the few
remarks worth reading, not every remark that could be made — a sidebar with
forty cards in it does not get opened twice. (The tool refuses past twenty per
run, but that is a backstop, not a target.)

**Answering a comment someone left you.** `obelisk list --open` gives you the
open comments with the passage each one is about. Make the edit in the note
yourself — there is no apply verb, and you do not need one — then
`obelisk resolve <note> <id>`. Resolving says the thing the comment asked for
has been done, so only say it when it has.
