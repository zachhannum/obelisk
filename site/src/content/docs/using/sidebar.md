---
title: The sidebar
description: What the list shows, how it sorts, and what the chips do.
---

The right sidebar lists every comment on the current note. Clicking a card
scrolls the editor to its passage and flashes the highlight.

## Order

Comments are listed in document order, so the list mirrors the note, with open
detached comments in a section at the bottom. The button beside the count
switches to newest first, which is the order a review pass was written in.

## Chips

Three chips sit under the count. **All** is everything. **Open** is the
unresolved comments. **Suggestions** narrows to the comments carrying a
proposed rewrite. An agent's review pass adds a chip of its own beside them.

## Resolved comments stay

There is no setting to hide them. A resolved comment still highlights its
passage in the note, and a list that disagreed with the text would be the
harder thing to read. **Open** is there for the unresolved ones.

## Highlighting

A commented passage carries a hairline underline and a † at the end of it that
opens the comment. Resolved comments underline with a dotted rule, and a
comment carrying an unapplied suggestion underlines in green.

Overlapping comments nest: each layer thickens the underline, and comments
sharing an end position collapse into one marker with a count. It is legible to
about three deep, and the marker opens the innermost.

Reading view shows none of this. Comments live in the editor.

## Agent passes

A comment written from outside Obsidian is badged. Every comment from one
review pass shares a run id, and that pass shows up as one chip, labeled with
the model, with the run id and a count on its tooltip.

The chip has an × on it that dismisses the whole pass, with an undo notice
rather than a confirmation. Undo puts each comment back where it was. A filter
pinned to a run that has just been dismissed falls back to *All*.

Agent comments sit in document order among everything else, on the passages
they are about.
