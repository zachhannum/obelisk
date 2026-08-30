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
- **Survives editing** — anchors record both a line/column range and the quoted
  text, so comments re-find their passage after the note drifts. A passage that
  is deleted outright leaves its comment flagged in the sidebar rather than
  quietly disappearing.
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

Line numbers are counted from the first line *after* the frontmatter block, so
adding a comment never invalidates the others.

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
