---
title: Design notes
description: The decisions that are expensive to change, and the questions still open.
---

The repo carries two design documents: `docs/DESIGN.md` for the plugin, and
`docs/AGENT-INTEGRATION.md` for the CLI and the MCP server. This page is the
short version of both.

## Shape

One repo, one package, three front ends. `src/core/` is the part that does not
import Obsidian: the model, the anchor arithmetic, the YAML, and the four
verbs. The plugin, the CLI and the MCP server are written against it.

The dependency runs one way. A `from "obsidian"` under `core/` breaks the CLI
and the MCP server without breaking the plugin build, which is why it is the
one import worth checking by eye.

## Decisions

**Comments live in the note's frontmatter.** They travel with it through sync,
git, export and rename with no extra machinery.

**The quote is the anchor.** Nothing fuzzy-matches or re-finds. A quote that is
not found detaches the comment, and the sidebar flags it.

**Detachment is derived, never stored.** Nothing about where a comment sits is
written back to disk.

**A suggestion is a fenced block in the comment body.** A proposal composes
with prose, with alternatives, and with a counter-proposal in a reply, and none
of that needs new storage.

**Errors are returned, not thrown.** `Outcome<T>` with a failure code, so a
front end renders a refusal.

**No model client in the plugin.** No API key in settings, no *Review this
note* button. It would buy key storage, provider drift, streaming UI, cost
display, retries and a mobile story, all to duplicate an agent already open in
another window.

**Reading view shows nothing.** Anchoring against rendered HTML fails on any
quote that spans markup, and what survived the compromises was a hairline
nobody noticed. Comments live in the editor.

## Open questions

**Multi-user attribution.** `author` is free text, which is enough for one
person working across devices and not enough for a vault several people
share.

**Replies from an agent.** A reply has no `origin`, so a machine reply in a
human thread is unbadged. Adding the field is trivial; whether an agent should
be replying into a thread at all is the actual question.

**Resolving someone else's comment.** An agent can close a thread its author
considers open, and there is no record that an agent did it. `origin` on the
resolution would fix it.

**A quote that is not unique.** Editing one of two identical passages attaches
its comment to the surviving twin rather than detaching it. Fixing it means
storing which occurrence a comment meant and reconciling that count on every
resolve, which is the bookkeeping this design deleted on purpose.

**Performance ceiling.** Quote search is O(document × comments) per resolve,
with each comment's scan stopping as soon as occurrences start getting further
from its hint. A note with a thousand comments would need a cache keyed on
document version.

**Canvas, PDF, and non-markdown files.** Out of scope. The store assumes a
markdown file with frontmatter.

**A run that spans notes.** The budget counts comments per run per note, which
is what a single file write can see. A pass over thirty notes has no ceiling
other than thirty times the per-note one.
