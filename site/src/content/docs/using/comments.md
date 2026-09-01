---
title: Comments and replies
description: Writing, editing, deleting and threading comments.
---

A comment is markdown and nothing else. There is no title field, no plain-text
body, and no separate suggestion field. Anything that wants to sit next to a
proposal is written as markdown beside it.

## Writing

The composer has a Write/Preview pair and a button that inserts a suggestion
block. It is Obsidian's embedded markdown editor, the same one Canvas cards and
property fields use, so everything you know from writing a note applies.

Preview stays even though the editor previews live, because it is the only
place a `suggestion` block renders as the diff the reader will get.

:::note
If the embedded editor is unavailable (an Obsidian release could move it), the
composer falls back to a textarea. Tabs, the suggestion button and submit all
still work; the editor shortcuts do not.
:::

## Replies

**Reply** on any card opens the composer inline. Replies are stored on the
comment, render as markdown, and can contain suggestion blocks.

A reply has no author badge of its own when an agent writes it. That is a known
gap rather than a decision.

## Editing

**Edit** on a card replaces the rendered body with the composer that wrote it,
suggestion button and all. Right-clicking the passage offers the same thing.

An edit rewrites the body and marks the card *edited*. The anchor is left
alone: changing what you said about a passage is not a claim about a different
passage.

`edited` is separate from `modified`. The latter moves on any write at all,
resolving included, so the *edited* marker means the text in front of you was
rewritten rather than that something on the record changed.

## Deleting

**Delete** removes a whole comment; the trash icon in a reply's header removes
that one reply. Both offer an undo notice rather than a confirmation dialog, so
striking one remark out of a thread does not cost a click and does not take the
conversation with it.

## Attribution

`author` is a free-text setting. It is fine for one person across devices and
weak for a shared vault.

A comment written from outside Obsidian also carries an `origin`, recording
that a model wrote it and which review pass it belonged to. Its absence means a
person wrote it, so nothing already in a vault needs migrating.
