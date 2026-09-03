---
title: The MCP server
description: Registering obelisk-mcp.
---

`obelisk-mcp` gives an agent the same four verbs as the CLI, as tools.

| Tool | What it does |
|---|---|
| `obelisk_list` | Every comment on a note, plus the line-numbered body. |
| `obelisk_comment` | Comment on one passage, anchored by a verbatim quote. |
| `obelisk_reply` | Reply to a comment. |
| `obelisk_resolve` | Resolve or reopen a comment. |

## Register it

```bash
claude mcp add obelisk --scope user -- npx -y obelisk-mcp
```

One registration covers every vault: the tools work on whichever vault the
agent is running in. To reach a note in a vault the agent is not running in,
pass an absolute path.
