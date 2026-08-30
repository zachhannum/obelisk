# Obelisk

Inline comments and GitHub-style suggested edits for [Obsidian](https://obsidian.md).

Select a passage, leave a comment on it, and optionally propose a replacement
that can be applied with one click. Comments are stored in the note's own
frontmatter, so they travel with the file through sync, git, and export — no
sidecar database, nothing to lose.

> An *obelus* (†) was the mark ancient editors drew in the margin of a
> manuscript to say: this passage is disputed.

## Status

**Working.** Anchoring, decoration, the sidebar, and suggested edits are
implemented. Not yet released or submitted to the community plugin list, and
not yet exercised against a large vault. See [`docs/DESIGN.md`](docs/DESIGN.md)
for the decisions behind it and what remains open.

## Features

- **Comment on any passage** — select text, right-click, *Add comment*.
- **Markdown everywhere** — comments and replies are ordinary markdown, with a
  Write/Preview pair while you type. Links, lists, embeds, callouts and math
  render in the sidebar exactly as they would in a note.
- **Suggested edits** — a proposal is a fenced ` ```suggestion ` block *inside*
  the comment, the way GitHub does it. It renders as a diff against the quoted
  passage with an Apply button, so one comment can explain itself and propose a
  change, and a reply can offer a counter-proposal. Refuses to apply if the
  underlying text has changed since. Applying resolves the comment — the
  proposal got the only answer it was after — and *Reopen* is there if it also
  asked something the edit did not settle.
- **Sidebar** — all of a note's comments in document order; click one to scroll
  the editor to it. Resolved ones stay in the list, greyed rather than hidden,
  since they are still highlighted in the note; the *Open* filter is there when
  you want only the working set.
- **In-text highlighting** — commented passages are highlighted, with a †
  marker that opens the comment in the sidebar.
- **Stored in frontmatter** — plain YAML under an `obelisk` key. Readable,
  diffable, portable.
- **Survives editing** — a comment is anchored to the text it quotes, so it
  keeps up with edits anywhere else in the note, including ones made outside
  Obsidian. Edit or delete the quoted passage itself and the comment detaches:
  flagged in the sidebar, highlighting nothing, never guessing at a new home
  and never quietly disappearing. Restore the text and it reattaches. Resolved
  comments are exempt from the flag — a settled comment usually comes loose
  because the edit it asked for was made.
- **The editor you already use** — comments are written in Obsidian's own
  markdown editor, so Cmd+B, list continuation, `[[` autocompletion and live
  preview work in a comment exactly as they do in a note.
- **Threaded replies** — on any comment, stored alongside it, and markdown all
  the way down.
- **Editable** — rewrite a comment or a reply in the same composer that wrote
  it, suggestion button and all, from the card's *Edit* button or by
  right-clicking the passage. Edited bodies are marked as such; the anchor is
  left alone, so changing what you said never changes what you said it about.

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

A comment is markdown and nothing else. A proposed edit is a ` ```suggestion `
fenced block inside that markdown — the block's content replaces exactly the
anchored range when applied — so there is no second, poorer text format beside
the body, and a comment can hold prose, a link and a proposal at once.

The `quote` is what a comment is anchored by. The line/column range records
where the passage was when the comment was written — it orders the sidebar and
breaks ties when a quote appears twice, and is never rewritten. Lines are
counted from the first line *after* the frontmatter block, so adding a comment
never invalidates the others.

## Development

```bash
npm install
npm run dev      # watch build
npm run build    # typecheck + production build
```

Symlink the repo into a test vault to try it:

```bash
ln -s "$PWD" /path/to/vault/.obsidian/plugins/obelisk
```

## License

MIT
