# Prose style

The voice the documentation site, the README and the agents fragment
are written in. CLAUDE.md's documentation rules still hold. This says
what the voice is once they are satisfied.

## Voice

### Subject first, then verb

No inverted openers, no clause that holds the subject back.

Before:

> Select a passage, and the sidebar fills with what was said about it.

After:

> The sidebar lists every comment on the note.

### No epigrams

A sentence whose job is to be pleasing gets cut, however true it is.

> A quote is a promise the rest of the note has to keep.

### No riddles

State the thing, then show it. Do not describe a shape and leave the
reader to find it.

Before:

> Four verbs, one vault.

After:

> The command has four subcommands: `list`, `comment`, `reply` and
> `resolve`.

### Stop at the fact

A sentence that explains, justifies or admires the fact before it ends
at the fact instead.

Before:

> A comment detaches when its quote is gone, because guessing at a near
> miss is how a comment ends up on the wrong sentence.

After:

> A comment detaches when its quote is gone.

### Plain beats clever, even when clever is shorter

"can be used to" is fine. Compression is not the goal.

## Words

Use the ordinary word. A trade word belongs where it is the product's
own term, not in explanation. `anchor`, `quote`, `detached`,
`suggestion`, `resolve` and `reopen` are the product's terms and are
used as written, in prose, in the UI, in the CLI's output and in the
YAML.

One name per concept, used everywhere: in prose, in code comments, in
strings, in headings, and in filenames. A rename is finished when
nothing in the repo still uses the old name.

Name packages and commands the way the reader types them, in backticks.

Spelling is American: `normalize`, `gray`, `canceled`, `capitalization`. That
holds outside the documentation too, in code comments, in identifiers and in
the strings the plugin, the CLI and the MCP server print.

A refusal is behavior. It has a reason the reader can act on, and it is
written as what happens. A feature that is missing is not supported
yet, and nothing frames a gap as a decision against it.

## What does not go in a page

Numbers measured somewhere else. Counts, sizes and timings belong on
the page that measures them, and go stale everywhere else.

Sample output that drifts. Either something checks the text or it stays
out.

Anything another page already says. One page owns a fact and the rest
link to it.

The future. No "when it reaches the directory", no "this will change".

Claims wider than the code. "No comment is ever lost" is a claim about
every note anyone will ever write.

The reader's possessions. Describe what the software does, not what the
reader owns: "hands the note to your editor" is "opens the note".

Implementation detail, for a reader outside the repo. What a command
does and what comes back is theirs. How it is done is not. Anchor
arithmetic, the schema fold, the capture harness and CI belong in
CLAUDE.md. A section whose heading says it is for someone building the
repo is the exception.

## Shape of a page

Headings are labels a reader scans and a search box matches, not lines
of prose. Page titles are sentence case.

A quickstart opens with install, then the one thing that produces a
result, then what came back.

A section that explains a mechanism ends in the thing that runs it: a
command with its output, or a frontmatter block.

A screenshot on a page comes from the capture harness, so the page
cannot drift from the plugin.

A reference table links out rather than carrying a paragraph inline.
The page that owns a detail is the page that carries it.

## Links

Documentation pages link: to other pages, to the plugin's dependencies,
to Obsidian. CLAUDE.md's rule against links covers code comments and
internal notes.

The agents fragment is read inside someone else's vault, where a link
into this repo resolves to nothing. It carries commands and no links.
