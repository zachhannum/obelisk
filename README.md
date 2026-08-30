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
- **Suggested edits** — propose a concrete replacement; apply it from the
  sidebar. Refuses to apply if the underlying text has changed since.
- **Sidebar** — all of a note's comments in document order; click one to scroll
  the editor to it.
- **In-text highlighting** — commented passages are highlighted, with a †
  marker that opens the comment in the sidebar.
- **Stored in frontmatter** — plain YAML under an `obelisk` key. Readable,
  diffable, portable.
- **Survives editing** — a comment is anchored to the text it quotes, so it
  keeps up with edits anywhere else in the note, including ones made outside
  Obsidian. Edit or delete the quoted passage itself and the comment detaches:
  flagged in the sidebar, highlighting nothing, never guessing at a new home
  and never quietly disappearing. Restore the text and it reattaches.
- **Threaded replies** — on any comment, stored alongside it.

## Data format

```yaml
---
obelisk:
  - id: cq7fk2m9x
    author: zach
    created: 2026-08-29T14:02:11.000Z
    body: This paragraph does two things at once.
    anchor:
      from: { line: 12, col: 0 }
      to: { line: 12, col: 47 }
      quote: The horse, which had been standing there, bolted.
    suggestion:
      replacement: The horse bolted.
---
```

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
