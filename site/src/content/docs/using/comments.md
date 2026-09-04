---
title: Comments and replies
description: Writing, editing, deleting and threading comments.
---

A comment is one piece of markdown. Whatever you would write in a note goes in
the body, a proposed rewrite included.

## Writing

*Add comment* opens an empty card at the top of the sidebar, next to the
note's other comments.

The composer has a Write/Preview pair and a button that inserts a suggestion
block. It is Obsidian's embedded markdown editor, the same one Canvas cards and
property fields use, so everything you know from writing a note applies.

Preview is where a `suggestion` block renders as the diff the reader gets.

:::note
If the embedded editor is unavailable, the composer falls back to a plain text
box. Tabs, the suggestion button and submit all still work. The editor
shortcuts do not.
:::

## Replies

**Reply** on any card opens the composer inline. Replies are stored on the
comment, render as markdown, and can contain suggestion blocks.

A reply carries no author badge when an agent writes it. That is not supported
yet.

## Editing

**Edit** on a card replaces the rendered body with the composer that wrote it,
suggestion button and all. Right-clicking the passage offers the same thing.

An edit rewrites the body and marks the card *edited*. The anchor is left
alone.

## Deleting

**Delete** removes a whole comment. The trash icon in a reply's header removes
that one reply. Both offer an undo notice rather than a confirmation dialog.

## Attribution

**Author name** in the settings tab is free text, attached to the comments you
create. It is fine for one person across devices and weak for a shared vault.

A comment written from outside Obsidian records the model that wrote it and the
review pass it belonged to, which is what the badge and the run chip in the
sidebar are drawn from. A comment carrying no such record was written by a
person, so nothing already in a vault needs migrating.
