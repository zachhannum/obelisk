---
title: Suggested edits
description: Proposing a replacement, and what happens when it is applied.
---

A suggested edit is a fenced `suggestion` block inside an ordinary comment
body, the way GitHub does it. Its contents replace exactly the anchored
passage when the reader clicks Apply.

````markdown
Two clauses fighting over one sentence.

```suggestion
The horse bolted.
```

Happy to be talked out of it.
````

The proposal is part of the body, so a comment can hold prose, a link and a
rewrite at once. Two alternatives can sit side by side, and a reply can carry a
counter-proposal.

## How it renders

The card shows the proposal as a diff against the quoted passage, word by word,
with an Apply button in its header. The diff is display only. The composer's
Preview tab draws the same diff, so what you see while writing is what the
reader gets.

The treatment only happens inside a comment. A ` ```suggestion ` block typed
into a note stays an ordinary code block.

## Applying

Apply is refused unless the quoted passage is still intact, which is the same
thing as the comment still being attached. A card offering an Apply button
lands its change on exactly the characters the commenter read.

When the quote occurs more than once, the occurrence that was highlighted is
the one spliced, so the reader applies what they were looking at.

Applying does three things:

1. Splices the block's contents over the anchored range.
2. Re-anchors the comment onto its replacement, so it stays attached to the
   passage it just changed.
3. Resolves the comment, marking the card *Applied*.

**Reopen** is one click away if the comment also asked something the edit did
not answer. **Remove comment after applying its suggestion**, in the settings
tab, throws the record away instead of keeping the resolved card.

The splice leaves every other comment attached, because each one is found by
its own quoted text.

## Writes and open notes

Applying is the one thing Obelisk does that changes the prose of a note rather
than its frontmatter. It does not need the note open: applying from the sidebar
of a note you have closed since works the same way.
