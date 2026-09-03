---
title: Install
description: The plugin, the CLI, and the MCP server.
---

Obelisk is three pieces that install separately. The plugin is the one a reader
needs; the CLI and the MCP server are how an agent reaches the same comments.

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

That prints the note's comments, then its body with line numbers. An empty note
prints no comments, then its body.

From a clone, `npm link` puts the same two commands on PATH pointing at the
built files in the repo, so a rebuild is picked up without reinstalling.

## The MCP server

There is nothing to install, nothing to start, and nothing to configure. The
agent spawns a process per session over stdio, and the server finds the vault
by walking up from the directory the agent spawned it in, so one registration
covers every vault on the machine:

```bash
claude mcp add obelisk --scope user -- npx -y obelisk-mcp
```

`-y` because the agent gives npx no terminal to ask in, so the first run has to
install the package rather than stop to ask whether it may.

A session started anywhere under a vault gets that vault, subdirectories
included. A session started outside one can still reach a note by absolute
path. To check the registration, `claude mcp list`, or `/mcp` inside a session.
