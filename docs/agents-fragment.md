# Obelisk: the fragment for a vault's `AGENTS.md`

Paste the block below into the `AGENTS.md` or `CLAUDE.md` at the root of a
vault, for agents that do not speak MCP. Agents that do should use the MCP
server instead, which carries the same rules in its tool descriptions:

```
claude mcp add obelisk --scope user -- npx -y obelisk-mcp
```

See the *Agents* section of [`../README.md`](../README.md) for what each flag
in that command is doing, and for how to tell whether it took.

The fragment below assumes `obelisk` is on the reader's PATH, which is what
`npm install -g obelisk-mcp` does.

This file is the only copy. The documentation site generates its own page from
it at build time, so edit it here.

Everything after the line is the fragment.

---

## Commenting on notes

This vault uses Obelisk: comments live in each note's own
frontmatter, and the reader sees them in a sidebar in Obsidian,
anchored to the passage they are about.

Use the `obelisk` command. **Do not write the `obelisk:` frontmatter key by
hand.** A hand-written anchor puts a comment where the sidebar cannot place
it.

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
character: same punctuation, same capitalization, same spacing. Copy it. Do
not retype it, tidy it, or straighten its quotation marks. If the quote is not
found, or is found more than once, nothing is written and you are told which.

**A line is never the anchor.** Do not count lines, and do not pass a number
you worked out yourself. `--near-line` does one thing: it picks which of two
identical quotes you meant, and the number for it is copied from what `list`
printed. If a quote is ambiguous, quoting more of the passage is the better
answer.

**Proposing a rewrite.** A suggested edit is a ` ```suggestion ` fenced block
inside the comment body, GitHub-style. Its contents replace exactly the quoted
passage when the reader clicks Apply, so one comment can explain itself and
propose the change:

````
obelisk comment note.md --quote "The horse, which had been standing there, bolted." --body - <<'EOF'
Two clauses fighting over one sentence.

```suggestion
The horse bolted.
```
EOF
````

**One id per pass.** Pass the same `--run` id for every comment in one review,
so the reader can filter or dismiss the whole pass with one click. Make one up
per review. It only has to be distinct from the last one.

**Answering a comment someone left you.** `obelisk list --open` gives you the
open comments with the passage each one is about. Make the edit in the note
yourself, since there is no apply verb and you do not need one, then
`obelisk resolve <note> <id>`. Resolving records that what the comment asked
for has been done, so resolve only once it has been.
