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

Because the proposal is part of the body, a comment can hold prose, a link and
a rewrite at once; two alternatives can sit side by side; and a reply can carry
a counter-proposal without any new field.

## How it renders

The body is rendered with Obsidian's own markdown renderer, and each
`suggestion` code block in the output is then swapped for a diff and an Apply
button. Post-processing the output rather than registering a global code block
processor keeps the treatment inside comment bodies, so a ` ```suggestion `
block typed into a *note* stays an ordinary code block.

The diff is word-level, against `anchor.quote`, and display-only. The compose
preview diffs against the same text, so what you see while writing is what the
reader gets.

## Applying

Apply is refused unless the quoted text is still intact. That is the same
condition as being attached, so there is no separate staleness check: if the
comment is attached, the splice lands on exactly the characters the commenter
read.

When the quote occurs more than once, the occurrence that was highlighted is
the one spliced, so the reader applies what they were looking at.

Applying does three things:

1. Splices the block's contents over the anchored range.
2. Re-anchors the comment onto its replacement, so it stays attached to the
   passage it just changed.
3. Resolves the comment, marking the card *Applied*.

Resolving on apply is deliberate: taking the edit is the strongest answer a
proposal can get, and once it is taken no other block in the thread can be
applied anyway. **Reopen** is one click away if the comment also asked
something the edit did not settle. The `removeCommentOnApply` setting takes the
same gesture further and throws the record away.

Every other comment in the note is unaffected by the splice, because comments
are found by their quoted text and the splice did not touch theirs.

## Writes and open notes

Applying is the one write that touches the note body, so it goes through
Obsidian's `vault.process` rather than the editor, and works on notes that are
not open.
