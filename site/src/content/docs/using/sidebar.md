---
title: The sidebar
description: What the list shows, how it sorts, and what the chips do.
---

The sidebar is an item view in the right leaf. It lists every comment on the
current note in document order, so the list mirrors the note, with open
detached comments in a section at the bottom.

Clicking a card scrolls the editor to its passage and flashes the highlight.

## Resolved comments stay

There is no setting to hide them. A resolved comment still highlights its
passage in the note, so hiding it from the sidebar only made the list disagree
with the text, and it made resolving feel like deleting.

The **Open** chip is there for anyone who wants the working set, in front of
the reader rather than two menus away.

## Highlighting

A commented passage carries a hairline underline and a † at the end of it that
opens the comment. Resolved comments underline with a dotted rule; a comment
carrying an unapplied suggestion underlines in green.

Overlapping comments nest: each layer thickens the underline, and comments
sharing an end position collapse into one marker with a count. It is legible to
about three deep, and the marker opens the innermost.

Reading view shows none of this. Comments live in the editor.

## Agent passes

A comment written from outside Obsidian is badged. Every comment from one
review pass shares a run id, and that pass shows up as one chip beside *Open*,
labelled with the model, with the run id and a count on its tooltip.

The chip has an × on it that dismisses the whole pass, with an undo notice
rather than a confirmation. Dismissing restores each comment at its old index
if you undo, so the frontmatter does not get reordered. A filter pinned to a
run that has just been dismissed falls back to *All*.

Agent comments are not hidden by default and not sorted apart. They are
comments, in document order, or the feature is a second inbox rather than a
review.
