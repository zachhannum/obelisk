---
title: Refusals
description: Every way Obelisk declines to write, and what to do about it.
---

A refusal writes nothing. Every one of them carries a code and a message
written to be read by whoever asked.

| Code | What happened | What fixes it |
|---|---|---|
| `quote-not-found` | The quote is nowhere in the body. | Copy the passage out of `list`, with the same punctuation and spacing. |
| `quote-ambiguous` | The quote appears more than once. | Quote more of the passage, or pass the line `list` printed. |
| `bad-suggestion` | The body's suggestion fences do not parse as intended. | Usually a suggestion containing a code sample that closed the wrong fence. |
| `no-op-suggestion` | The proposal is the text it replaces. | Propose something, or drop the block. |
| `not-found` | No comment or reply with that id. | Ids come from `list`. |
| `conflict` | The note changed underneath the write. | Nothing was saved. Run it again. |
| `empty-body` | A comment or reply with nothing in it. | Send a body with something in it. |

## On a quote that is not found

The search is strict. A looser one, with straightened punctuation and
collapsed whitespace, runs only after the strict search fails, and only to
*report*: if it finds exactly one match, the refusal quotes the note's own
wording back, to be copied.

Nothing is stored that did not come out of the note.

## On an ambiguous quote

`--near-line` past the end of the note is refused too, rather than falling back
to the nearest occurrence to the top. A number a model invented should not
quietly resolve to the wrong twin.

## On a conflict

External writes re-read the file and proceed only if it is byte-for-byte what
it was when the work started. A refusal here means an edit was made while the
command was running, and that nothing was written.
