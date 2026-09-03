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

From the vault:

```bash
cd /path/to/vault
claude mcp add obelisk -- npx -y obelisk-mcp --vault "$PWD"
```

`-y` because the agent gives npx no terminal to ask in, so the first run has to
install the package rather than stop to ask whether it may.

:::caution[Scope is the one that bites silently]
`claude mcp add` defaults to `--scope local`, which registers the server for
sessions started in that one directory: run from the vault, that is the vault.
`--scope user` registers it in every project on the machine, all of them
pointed at the one vault `--vault` names, which buys you nothing unless you
comment on that vault from sessions that start elsewhere. `--scope project`
writes a `.mcp.json` in the vault instead.
:::

The vault path has to be absolute and has to exist. The server is spawned
without a shell, so a `~` in a config file stays a literal tilde, and the
process inherits the agent's working directory rather than the vault's.
Expanding `$PWD` in the shell that registers it is the short way to an absolute
path.

## There is nothing to start

It speaks MCP over stdio. The agent spawns a process when a session opens and
kills it when the session ends, so `obelisk-mcp` is never run by hand: no port,
no daemon.

One process per session is also what gives a session's comments a single run
chip in the sidebar. A session keeps the process it spawned, so a new version
of the package arrives at the next one. Reconnect from `/mcp` to take it
sooner.

## When it will not connect

A vault path that does not exist makes the server exit before it says anything,
which reaches the agent as `CONNECTION_CLOSED` and names nothing. The path in
`claude mcp get obelisk` is the first thing to check.

To test the server with no agent in the way:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npx -y obelisk-mcp --vault /abs/path/to/vault
```

That prints the handshake and then the four tools. If it fails here, the fault
is on this side, and there is no point looking at the agent's end of it.
