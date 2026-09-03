---
title: What Obelisk is
description: Inline comments and GitHub-style suggested edits for Obsidian, stored in the note's own frontmatter.
---

<p class="ob-lede">Select a passage in a note, leave a comment on it, and optionally propose a replacement that can be applied with one click.</p>

Comments are stored in the note's own frontmatter, so they travel with the file
through sync, git, export and rename. There is no sidecar database and nothing
to keep in step with the vault.

## Three front ends over one format

| | What it is | Where it runs |
|---|---|---|
| **Plugin** | Highlights, sidebar, composer, Apply button | Obsidian |
| **`obelisk`** | Four commands: list, comment, reply, resolve | A shell |
| **`obelisk-mcp`** | The same four, as MCP tools | An agent |

The storage format is the interface. Anything that can edit a file can leave a
comment the plugin will render.

## What it does

- **Comments on any passage**, by selecting text and choosing *Add comment*.
- **Suggested edits**, written as a fenced `suggestion` block inside the
  comment body and rendered as a diff against the quoted passage, with an
  Apply button.
- **Threaded replies**, markdown all the way down.
- **A sidebar** listing a note's comments in document order.
- **Highlighting in the text**, with a † that opens the comment.
- **A CLI and an MCP server** over the same comments.

## What it is not

There is no model client in the plugin: no API key in settings, no *Review this
note* button. The plugin's job is to be a good place for a comment to land, and
the agent is one the reader already has open in another window.

There is no sidecar store for machine comments either. An agent's comment is
the same object as a person's, in the same file, under the same anchoring
rules.

Comments go on markdown notes. Canvas, PDF and other file types are out of
scope, because a comment is stored in the note's own frontmatter.

## Status

Pre-release. Anchoring, decoration, the sidebar, suggested edits and the agent
integration are implemented. The CLI and the MCP server are on npm as
`obelisk-mcp`. The plugin has not been submitted to the Obsidian community
plugin directory, and none of it has been exercised against a large vault.
