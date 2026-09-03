---
title: What Obelisk is
description: Inline comments and GitHub-style suggested edits for Obsidian, stored in the note's own frontmatter.
---

<p class="ob-lede">Select a passage in a note, leave a comment on it, and optionally propose a replacement that can be applied with one click.</p>

Comments are stored in the note's own frontmatter, so they travel with the file
through sync, git, export and rename.

## Three front ends over one format

| | What it is | Where it runs |
|---|---|---|
| **Plugin** | Highlights, sidebar, composer, Apply button | Obsidian |
| **`obelisk`** | Four commands: list, comment, reply, resolve | A shell |
| **`obelisk-mcp`** | The same four, as MCP tools | An agent |

Anything that can edit a file can leave a comment the plugin renders.

## What it does

- **Comments on any passage**, by selecting text and choosing *Add comment*.
- **Suggested edits**, written as a fenced `suggestion` block inside the
  comment body and rendered as a diff against the quoted passage, with an
  Apply button.
- **Threaded replies**, markdown all the way down.
- **A sidebar** listing a note's comments in document order.
- **Highlighting in the text**, with a † that opens the comment.
- **A CLI and an MCP server** over the same comments, where an agent's
  comment is the same object as a person's, under the same anchoring rules.

Comments go on markdown notes. Canvas and PDF files hold no frontmatter, so
they are out of scope.

Agents reach comments through the CLI and the MCP server, so a model works
from whichever client is already open. The plugin holds no API key.

## Status

Early. Anchoring, decoration, the sidebar, suggested edits and the agent
integration are implemented. The plugin is in the Obsidian community plugin
directory, and the CLI and the MCP server are on npm as `obelisk-mcp`. None of
it has been exercised against a large vault.
