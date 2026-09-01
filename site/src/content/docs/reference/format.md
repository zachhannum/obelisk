---
title: Data format
description: What Obelisk writes into a note's frontmatter.
---

Everything lives under a single `obelisk` frontmatter key, as a list, beside an
`obelisk_schema` key recording the writer's schema version.

```yaml
---
title: Chapter 3
obelisk_schema: 3
obelisk:
  - id: cq7fk2m9x
    author: claude
    origin:
      kind: agent
      model: claude-opus-5
      run: r7k2mq
    created: 2026-08-29T14:02:11.000Z
    body: |-
      The relative clause is doing no work here.

      ```suggestion
      The horse bolted.
      ```
    anchor:
      from: { line: 12, col: 0 }
      to: { line: 12, col: 47 }
      quote: The horse, which had been standing there, bolted.
---
```

## Comment

| Key | Type | Notes |
|---|---|---|
| `id` | string | Stable, URL-safe, unique within the note. Never reused. |
| `author` | string? | Free text. |
| `origin` | object? | Absent means a person wrote it. |
| `created` | string | ISO-8601. |
| `modified` | string? | Moves on any write, resolving included. |
| `edited` | string? | Set when the body is rewritten. |
| `resolved` | boolean? | |
| `body` | string | Markdown. |
| `anchor` | object | Where it attaches. |
| `appliedAt` | string? | When a suggestion from this thread was applied. |
| `replies` | list? | |
| `tags` | list? | Free-form labels, surfaced as filter chips. |

`appliedAt` sits on the comment rather than on a block, because applying
re-anchors the whole comment onto its replacement, so every other proposal in
the thread is then measured against text that no longer exists. Applied is a
fact about the thread.

## Anchor

| Key | Type | Notes |
|---|---|---|
| `quote` | string | The exact text selected when the comment was created. |
| `from` | `{line, col}` | Where the passage was, at creation. |
| `to` | `{line, col}` | Likewise. |

`quote` is what the comment is found by. `from` and `to` are a hint: they order
the sidebar and break ties when a quote appears twice, and are never rewritten.

`line` is 0-indexed and counted from the first line **after** the closing `---`
of the frontmatter, so adding a comment never invalidates the others. `col` is
a 0-indexed UTF-16 offset within the line.

## Origin

| Key | Type | Notes |
|---|---|---|
| `kind` | `human` \| `agent` | |
| `model` | string? | Display only. |
| `run` | string? | Groups every comment from one review pass. |

## Reply

`id`, `author?`, `created`, `edited?`, `body`. A reply has no anchor, because
it belongs to its comment, and no `origin`.

## Rules the format keeps

**Unknown keys survive a round-trip**, so a newer version's fields are not
stripped by an older one.

**Migration is a read-time fold, never a sweep.** Schema 1 kept a suggestion in
its own key beside the body; that shape is understood on read and re-expressed
as a fence, and the note on disk is left alone until something writes to it
anyway. A vault that is only ever read is never dirtied, and there is no
upgrade pass that can half-finish.

**A malformed entry is dropped with a console warning, never thrown.** The
frontmatter is hand-editable, and one bad comment must not take the sidebar
down for the whole note.

## The costs, accepted knowingly

- Comments are visible when the frontmatter is expanded in source mode. Noisy
  for a note under heavy review.
- Every comment write dirties the file. Only deliberate actions write, so
  editing a note never touches its comments, but a burst of review activity is
  a burst of sync events.
- Frontmatter is a poor fit for long threaded discussions. If replies grow past
  a handful, the escape hatch is a sidecar for bodies with anchors kept inline.
