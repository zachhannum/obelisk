---
title: Agents
description: How a model leaves a comment on a note, and reads the ones already there.
---

<p class="ob-lede">The same comments, from outside Obsidian. A model reviews a note and its remarks appear in the sidebar of the note you already have open.</p>

Or the other direction, which is the one that will get more use: you leave
comments asking for things, a model reads them, makes the edits, and resolves
them.

## Why there was little to build

The storage format is the interface. Comments are plain YAML under one
frontmatter key, a suggested edit is a fenced block inside a markdown body, and
unknown keys survive a round-trip. Any process that can edit a file can already
leave a comment the plugin will render.

So the question was not how to give a model a channel. It was what a model gets
wrong when handed the format directly, and the answer is narrow:

| What an agent needs | Already true | What was missing |
|---|---|---|
| Somewhere to write | frontmatter | nothing |
| A body format | markdown, suggestion fences | nothing |
| To be told apart from a person | `author` | attribution that survives a batch |
| **An anchor** | `anchor.quote` plus a hint | a model cannot count lines |
| Not to corrupt the note | in-app writes only | a safe path from outside |

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
That refusal is the feature. Accepting a near miss writes a comment that is
born detached, which reads to the reader as the plugin losing their comment.

Matching is strict. A looser search runs only *after* a failure: if
straightening the punctuation and collapsing the whitespace finds exactly one
match, the refusal quotes the note's own wording back and says to copy it.
Nothing is stored that did not come out of the note.

## Attribution

An agent's comment carries an `origin` with the model that wrote it and a run
id shared by every comment in that pass.

The run id is the half that earns its place. A model does not leave a comment;
it leaves twenty, in one pass, and the gesture a reader wants afterwards is
*all of these, gone*. A shared id makes a pass an addressable thing: one filter
chip, one dismissal, one undo.

## A budget

At most 20 comments per run per note, enforced, against 8 stated in the tool
description. A review is the few remarks worth reading, not every remark that
could be made. A sidebar with forty cards in it does not get opened twice.

## Writing while Obsidian is open

An external write re-reads the file and proceeds only if it is byte-for-byte
what it was; otherwise it refuses and says to run it again.

The write itself splices a new frontmatter block in front of *unchanged* body
text, so a note Obsidian has open keeps its editor state and every one of its
anchors.
