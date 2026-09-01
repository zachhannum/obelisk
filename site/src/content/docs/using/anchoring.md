---
title: Anchoring
description: How a comment finds its passage, and what happens when it cannot.
---

<p class="ob-lede">The quote is the anchor. A comment attaches by searching the note body for the exact text it was written on.</p>

Found → the comment attaches there. Not found → the comment is **detached**:
listed in the sidebar, flagged, decorating nothing.

That is the whole model. There is no partial match, no fuzzy re-find, no
scoring of surrounding context. If the text a comment was written on is edited
or deleted, the comment says so instead of guessing where it went.

An earlier design did follow edited text, scoring candidates on context and
ranking by distance from the recorded line. It usually found *something*. What
it felt like was a highlight jumping to a different paragraph when you deleted
a sentence. Guessing produces a wrong answer confidently; detaching produces a
right answer that asks for help.

## Detachment is derived

It is recomputed on every resolve and never written to disk, so undoing a
deletion reattaches the comment on its own.

It is also only flagged while the comment is **open**. A resolved comment that
has come loose has usually come loose *because* it was settled: its suggestion
was applied, or the passage was rewritten in answer to it. So a resolved
comment keeps its card and its quote without the dashed border, the alert, or a
place in the detached pile.

## Positions are a hint

`anchor.from` and `anchor.to` record where the passage was when the comment was
written. They are used for exactly two things: ordering the sidebar, and
choosing the nearest candidate when a quote occurs more than once. Nothing
keeps them current: they are written once, at creation, and never rewritten.

Lines are counted from the first line *after* the closing `---` of the
frontmatter, so growing the frontmatter does not shift every hint in the file.

Because the hint is only a tiebreak, an edit anywhere costs nothing: in
Obsidian, in another editor, from a git merge, from another device.

## While you are typing

With a note open, the plugin maps its ranges through each CodeMirror
transaction so a highlight does not flicker as you type around it. Nothing
there is written to disk, and the next resolve overrules it.

Resolution runs about a quarter of a second after the editor goes quiet. A
resolve is a substring search per comment that writes nothing, so running one
costs roughly what deciding not to would.

## The one case it cannot tell apart

Anchoring by quoted text cannot distinguish two identical passages. The stored
hint picks the nearer one, which is right while the anchored copy still exists.
Edit the anchored copy itself and its text is gone, so the comment attaches to
the surviving twin rather than detaching.

Rare for a sentence, plausible for a two-word quote.
