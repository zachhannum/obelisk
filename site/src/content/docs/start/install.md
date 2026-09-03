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

There is nothing to install and nothing to start. The agent spawns a process
per session over stdio, so all the server needs is a registration that names
the vault. From the vault:

```bash
cd /path/to/vault
claude mcp add obelisk -- npx -y obelisk-mcp --vault "$PWD"
```

The shell expands `$PWD` at registration, so an absolute path is what lands in
the config. That matters: the server is spawned without a shell, so a `~` in a
config file stays a literal tilde, and the process inherits the agent's working
directory rather than the vault's.

`-y` because the agent gives npx no terminal to ask in, so the first run has to
install the package rather than stop to ask whether it may.

### Which scope

`claude mcp add` defaults to `--scope local`, which registers the server for
sessions started in that one directory. Run from the vault, that is the vault.

- `--scope user` registers it in every project on the machine, all of them
  pointed at the one vault `--vault` names. It buys you one thing: reaching
  that vault from sessions that start somewhere else.
- `--scope project` writes a `.mcp.json` in the vault, for a vault that is a
  repo everyone working in it should get the server from.

A vault path that does not exist makes the server exit before it says anything,
which reaches the agent as `CONNECTION_CLOSED` and names nothing. `claude mcp
get obelisk` prints the path it was given.
