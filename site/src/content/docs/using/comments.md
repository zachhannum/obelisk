---
title: Comments and replies
description: Writing, editing, deleting and threading comments.
---

A comment is one piece of markdown. Whatever you would write in a note goes in
the body, a proposed rewrite included, so there is nothing else to fill in and
nothing that has to sit in a field of its own.

## Writing

The composer has a Write/Preview pair and a button that inserts a suggestion
block. It is Obsidian's embedded markdown editor, the same one Canvas cards and
property fields use, so everything you know from writing a note applies.

Preview stays even though the editor previews live, because it is the only
place a `suggestion` block renders as the diff the reader will get.

:::note
If the embedded editor is unavailable, the composer falls back to a plain text
box. Tabs, the suggestion button and submit all still work. The editor
shortcuts do not.
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

## Deleting

**Delete** removes a whole comment. The trash icon in a reply's header removes
that one reply. Both offer an undo notice rather than a confirmation dialog, so
striking one remark out of a thread does not cost a click and does not take the
conversation with it.

## Attribution

**Author name** in the settings tab is free text, attached to the comments you
create. It is fine for one person across devices and weak for a shared vault.

A comment written from outside Obsidian records the model that wrote it and the
review pass it belonged to, which is what the badge and the run chip in the
sidebar are drawn from. Nothing already in a vault needs migrating for that:
a comment with no such record is a comment a person wrote.
