---
title: Agents
description: How a model leaves a comment on a note, and reads the ones already there.
---

<p class="ob-lede">The same comments, from outside Obsidian. A model reviews a note and its remarks appear in the sidebar of the note you already have open.</p>

The other direction works too: you leave comments asking for things, a model
reads them, makes the edits, and resolves them.

## The anchor contract

**An agent never supplies a line or a column.** It supplies the quote, and the
tool does the arithmetic.

Models cannot count lines, and produce a plausible number under any prompt that
asks for one. A wrong number writes a valid anchor whose hint points somewhere
else, and the comment attaches to the wrong twin as soon as the quote is
ambiguous.

What a write does with the quote:

- **found once** → compute the range from the match, write the comment.
- **found several** → refuse, unless a near-line was given, in which case take
  the nearest occurrence.
- **not found** → refuse, with the rule that the quote must be verbatim.

The third case is the common one: a model asked to quote a passage paraphrases
it, normalizes its whitespace, or straightens its quotation marks. The refusal
keeps a bad anchor out of the note.

Matching is strict. A looser search runs only *after* a failure, and only to
report: it quotes the note's own wording back, to be copied. See
[Refusals](../../reference/refusals/).

## Attribution

An agent's comment carries an `origin` with the model that wrote it and a run
id shared by every comment in that pass.

A review pass arrives all at once, and the shared run id is what makes it one
thing to act on: one chip to filter by, and one × to dismiss it with, with an
undo behind it.

## Writing while Obsidian is open

An external write re-reads the file and proceeds only if it is byte-for-byte
what it was. Otherwise it refuses, and the write has to be run again.

The write itself splices a new frontmatter block in front of *unchanged* body
text, so a note Obsidian has open keeps its editor state and every one of its
anchors.
