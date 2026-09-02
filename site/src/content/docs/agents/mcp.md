---
title: The MCP server
description: Registering obelisk-mcp, and what to check when it does not connect.
---

`obelisk-mcp` is a thin wrapper over the same core as the CLI: one tool per
verb, no logic of its own.

| Tool | What it does |
|---|---|
| `obelisk_list` | Every comment on a note, plus the line-numbered body. |
| `obelisk_comment` | Comment on one passage, anchored by a verbatim quote. |
| `obelisk_reply` | Reply to a comment. |
| `obelisk_resolve` | Resolve or reopen a comment. |

The tool descriptions carry the anchor rules, and every refusal comes back as a
tool error with the message that fixes the call. Between them, that is how an
agent learns what a usable quote looks like.

## Register it

```bash
npm run build          # from the root of the repo

claude mcp add obelisk --scope user -- \
  node "$PWD/dist/mcp.mjs" --vault /path/to/your/vault
```

`$PWD` fills in the repo's path, so the vault is the only one you supply, and
it has to be a real one.

:::caution[Two things bite here, both silently]
**Scope.** `claude mcp add` defaults to `local`, which files the server under
the directory you happened to run it in. Run it in the repo and you get a
server registered for the repo rather than for the vault you want to comment
on. `--scope user` registers it everywhere; `--scope project` writes a
`.mcp.json` in the vault instead.

**`npx obelisk-mcp` only works inside the repo.** The package is not on npm
yet, and inside the repo npx resolves the bin out of the local
`package.json`. Anywhere else it goes to the registry and 404s. Use the
absolute path, or `npm link` first and register `obelisk-mcp`.
:::

Both paths have to be absolute. The server is spawned without a shell, so a `~`
in a config file stays a literal tilde, and the process inherits the agent's
working directory rather than the vault's.

## There is nothing to start

It speaks MCP over stdio. The agent spawns a process when a session opens and
kills it when the session ends, so `obelisk-mcp` is never run by hand: no port,
no daemon.

One process per session is also what gives a session's comments a single run
chip in the sidebar. Rebuild while a session is open and it keeps the old
process. Reconnect it from `/mcp`, or start a new session.

## When it will not connect

A vault path that does not exist makes `node` exit before it says anything,
which reaches the agent as `CONNECTION_CLOSED` and names nothing. The path in
`claude mcp get obelisk` is the first thing to check.

To test the server with no agent in the way:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node dist/mcp.mjs --vault /abs/path/to/vault
```

That prints the handshake and then the four tools. If it fails here, the fault
is on this side, and there is no point looking at the agent's end of it.
