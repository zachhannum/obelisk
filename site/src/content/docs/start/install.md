---
title: Install
description: The plugin, the CLI, and the MCP server.
---

Obelisk comes in three pieces that install separately. Most people want only
the plugin. The CLI and the MCP server are what an agent uses to reach the same
comments.

## The plugin

Obelisk is not in the community plugin directory yet, so installing it means
building it and symlinking the repo into a vault.

```bash
git clone https://github.com/zachhannum/obelisk
cd obelisk
npm install
npm run build
```

`npm run build` typechecks the source, then produces three things: `main.js`
for the plugin, and `dist/cli.mjs` and `dist/mcp.mjs` for the two bins.

Symlink the repo into the vault's plugin folder:

```bash
ln -s "$PWD" /path/to/vault/.obsidian/plugins/obelisk
```

Then enable **Obelisk** under *Settings → Community plugins*. After a rebuild,
run *Reload app without saving* to pick up the new `main.js`.

:::caution
Community plugins have to be turned on for the vault before anything appears in
the list. On mobile, the plugin loads but has not been tested there.
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
