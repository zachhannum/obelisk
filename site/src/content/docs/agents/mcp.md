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
claude mcp add obelisk --scope user -- npx -y obelisk-mcp
```

`-y` because the agent gives npx no terminal to ask in, so the first run has to
install the package rather than stop to ask whether it may.

There is no vault to name. The server walks up from the directory the agent
spawned it in until it finds the `.obsidian/` that marks a vault root, so one
registration serves every vault on the machine, and a session started deep in
the note tree resolves a vault-relative path the same as one started at the
root. A session that is not inside a vault at all can still reach a note by
absolute path.

## There is nothing to start

It speaks MCP over stdio. The agent spawns a process when a session opens and
kills it when the session ends, so `obelisk-mcp` is never run by hand: no port,
no daemon.

One process per session is also what gives a session's comments a single run
chip in the sidebar. A session keeps the process it spawned, so a new version
of the package arrives at the next one. Reconnect from `/mcp` to take it
sooner.

## When it will not connect

A server that cannot start reaches the agent as `CONNECTION_CLOSED`, which
names nothing. Run it yourself to find out why, with no agent in the way:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npx -y obelisk-mcp
```

That prints the handshake and then the four tools. If it fails here, the fault
is on this side, and there is no point looking at the agent's end of it.

A note the tools cannot find is the other half of it. The server resolves a
relative path from its own working directory and then from the vault root, and
says which path it looked at, so an agent spawned outside any vault gets a
refusal naming a path rather than silence.
