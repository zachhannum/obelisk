---
title: Your first comment
description: Leaving a comment, proposing an edit, and applying it.
---

## Leave one

Select a passage in a note, right-click it, and choose **Add comment**. The
composer opens with the selected text quoted at the top.

The composer is Obsidian's own markdown editor, so `Cmd+B`, list continuation,
`[[` autocompletion and live preview behave the way they do in a note. Write
the comment as markdown; there is no plain-text mode, because the sidebar
renders it as markdown too.

Submit, and three things happen: the comment appears in the right sidebar, the
passage gets an underline in the editor, and a † appears at the end of it.

## Propose a rewrite

**Suggest an edit** in the same context menu opens the composer with a
suggestion block already inserted, prefilled with the quoted passage and
selected, ready to be typed over:

````markdown
The relative clause is doing no work here.

```suggestion
The horse bolted.
```
````

The card renders that as a word-level diff against the quoted passage, with an
**Apply** button in its header. Applying splices the block's contents over
exactly the quoted range and resolves the comment.

## Answer one

Click a card to scroll the editor to its passage. **Reply** opens the same
composer under the comment; a reply can carry a suggestion block of its own, so
a counter-proposal is an ordinary reply.

**Resolve** greys the card out and drops the comment from the open count. It
stays in the list, and its passage stays underlined. Resolving is not hiding.

## Where it went

Open the note's frontmatter in source mode and it is all there, under one
`obelisk` key. That file is the whole database.
