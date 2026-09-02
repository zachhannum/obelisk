---
title: Install
description: Build Obelisk from source and load it into a vault.
---

Obelisk is not in the community plugin directory yet, so installing it means
building it and symlinking the repo into a vault.

## Build it

```bash
git clone https://github.com/zachhannum/obelisk
cd obelisk
npm install
npm run build
```

`npm run build` typechecks the source, then produces three things: `main.js`
for the plugin, and `dist/cli.mjs` and `dist/mcp.mjs` for the two bins.

## Load the plugin

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

## Put the CLI on your PATH

```bash
npm link
```

That puts `obelisk` and `obelisk-mcp` on your PATH, pointing at the built files
in the repo. Rebuild and the linked commands follow.

For the commands without the source, `npm install -g obelisk-mcp` is the
published package, and `npx -y obelisk-mcp` runs it without installing
anything.

## Check it

```bash
obelisk list /path/to/vault/some-note.md
```

That prints the note's comments, then its body with line numbers. An empty note
prints no comments, then its body.
