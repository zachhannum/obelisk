---
title: The MCP server
description: Registering obelisk-mcp.
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

One registration covers every vault: the tools work on whichever vault the
agent is running in. To reach a note in a vault the agent is not running in,
pass an absolute path.
