---
title: Anchoring
description: How a comment finds its passage, and what happens when it cannot.
---

<p class="ob-lede">The quote is the anchor. A comment attaches by searching the note body for the exact text it was written on.</p>

Found → the comment attaches there. Not found → the comment is **detached**:
listed in the sidebar, flagged, decorating nothing. There is no partial match
and no fuzzy re-find. If the text a comment was written on is edited or
deleted, the comment says so instead of guessing where it went.

## Bring the text back and the comment comes back

Nothing about where a comment sits is written to disk, so a comment that
detached when you deleted its passage attaches again the moment the text
returns. An undo is enough.

A resolved comment is never flagged as detached. A resolved comment that
detaches has usually detached for a good reason: its suggestion was applied, or
the passage was rewritten in answer to it. It keeps its card and its quote,
without the dashed border or the alert, and stays at the bottom of the list.

## Editing elsewhere costs nothing

The position recorded with a comment is not what finds it. It orders the
sidebar and breaks a tie when the same quote appears twice, and nothing keeps
it current. So an edit anywhere else in the note leaves every comment attached,
whether you make it in Obsidian, in another editor, on another device, or
through a git merge.

## While you are typing

Highlights keep up with you as you type around them, and the list settles a
moment after you stop. A comment whose quoted text you have just typed over
greys out then, rather than flickering while you are still working on the
sentence.

## The one case it cannot tell apart

Anchoring by quoted text cannot distinguish two identical passages. The stored
position picks the nearer one, which is right while the anchored copy still
exists. Edit the anchored copy itself and its text is gone, so the comment
attaches to the surviving twin rather than detaching.

That is rare for a whole sentence and plausible for a two-word quote.
