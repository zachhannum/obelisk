---
title: Install
description: The plugin, the CLI, and the MCP server.
---

Obelisk comes in three pieces that install separately. Most people want only
the plugin. The CLI and the MCP server are what an agent uses to reach the same
comments.

## The plugin

The plugin installs with BRAT, from this repository's releases. It is not in
the community plugin directory yet.

1. In *Settings → Community plugins → Browse*, find **BRAT**, install it, and
   enable it.
2. Open *Settings → BRAT* and choose *Add beta plugin*.
3. Paste `zachhannum/obelisk`, leave the version on the latest release, and add
   it.
4. Enable **Obelisk** under *Settings → Community plugins*.

BRAT checks for a newer release each time Obsidian starts. To take one sooner,
use *Check for updates to all beta plugins* in its settings.

:::caution
Community plugins have to be turned on for the vault before any of this
appears. On mobile, the plugin loads but has not been tested there.
:::

## The CLI

```bash
npm install -g obelisk-mcp
```

One package, two commands: `obelisk` is the CLI, `obelisk-mcp` is the MCP
server. Check the install against a note:

```bash
obelisk list /path/to/vault/some-note.md
```

That prints the note's comments, then its body with line numbers.

## The MCP server

```bash
claude mcp add obelisk --scope user -- npx -y obelisk-mcp
```

One registration covers every vault: the tools work on whichever vault the
agent is running in.
