---
title: Agents
description: How a model leaves a comment on a note, and reads the ones already there.
---

<p class="ob-lede">The same comments, from outside Obsidian. A model reviews a note and its remarks appear in the sidebar of the note you already have open.</p>

Or the other direction, which is the one that will get more use: you leave
comments asking for things, a model reads them, makes the edits, and resolves
them.

## The anchor contract

**An agent never supplies a line or a column.** It supplies the quote; the tool
does the arithmetic.

Models cannot count lines, and will produce a plausible number under any prompt
that asks for one. A wrong number is not a visible error. It writes a
structurally valid anchor whose hint points somewhere else, which costs nothing
until the quote turns out to be ambiguous and the comment silently attaches to
the wrong twin.

The write path mirrors resolution exactly:

- **found once** → compute the range from the match, write the comment.
- **found several** → refuse, unless a near-line was given, in which case take
  the nearest occurrence.
- **not found** → refuse, and say the quote must be verbatim.

The third case fires constantly, because a model asked to quote a passage will
paraphrase it, normalize its whitespace, or straighten its quotation marks.
Refusing there is what keeps a review honest. Accepting a near miss would write
a comment that is born detached, which reads as the plugin losing their
comment.

Matching is strict. A looser search runs only *after* a failure: if
straightening the punctuation and collapsing the whitespace finds exactly one
match, the refusal quotes the note's own wording back and says to copy it. The
loose match is never what gets stored, because a writer more permissive than
the resolver would create comments the plugin cannot then find.

## Attribution

An agent's comment carries an `origin` with the model that wrote it and a run
id shared by every comment in that pass.

The run id is what makes a pass usable. A review pass is twenty comments
arriving at once, and the reader wants to be able to act on all twenty
together: a shared id gives them one chip to filter the pass with and one × to
dismiss it by, with an undo behind it.

## A budget

At most 20 comments per run per note, enforced, against 8 stated in the tool
description, so the number a model plans against is lower than the number it
can hit. A review is the few remarks worth reading, not every remark that could
be made.

## Writing while Obsidian is open

An external write re-reads the file and proceeds only if it is byte-for-byte
what it was; otherwise it refuses and says to run it again.

The write itself splices a new frontmatter block in front of *unchanged* body
text, so a note Obsidian has open keeps its editor state and every one of its
anchors.
