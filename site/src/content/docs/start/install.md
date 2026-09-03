---
title: Install
description: The plugin, the CLI, and the MCP server.
---

Obelisk comes in three pieces that install separately. Most people want only
the plugin. The CLI and the MCP server are what an agent uses to reach the same
comments.

## The plugin

Obelisk is in the community plugin directory.

1. In *Settings → Community plugins → Browse*, search for **Obelisk**.
2. Install it.
3. Enable **Obelisk** under *Settings → Community plugins*.

Updates come from *Check for updates* in the same panel.

The plugin can also be added via the *Add to Obsidian* button in its
[directory listing](https://community.obsidian.md/plugins/obelisk).

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
