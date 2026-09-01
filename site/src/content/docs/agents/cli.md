---
title: The CLI
description: obelisk, four verbs over a note's comments.
---

```
obelisk list <note> [--open] [--json] [--no-body]
obelisk comment <note> --quote "…" --body "…" [--near-line N] [--run ID]
obelisk reply <note> <id> --body "…"
obelisk resolve <note> <id> [--reopen]
```

There is no verb for applying a suggestion. An agent that wants the edit made
can make it; Apply exists in the plugin because a *reader* needs one click to
take a proposal they did not write.

## Options

| Flag | What it does |
|---|---|
| `--vault DIR` | Resolve `<note>` inside this vault, or `$OBELISK_VAULT`. |
| `--body -` | Read the body from stdin, fences and all. |
| `--quote "…"` | The passage to anchor to. Verbatim. |
| `--near-line N` | Which occurrence of an ambiguous quote to take. |
| `--run ID` | Groups every comment from one review pass. |
| `--model NAME` | Recorded on the comment as the model that wrote it. |
| `--author NAME` | Written into `author`. Defaults to the model, or `agent`. |
| `--human` | Write as a person rather than as an agent. |
| `--open` | `list`: only unresolved comments. |
| `--json` | `list`: machine-readable output. |
| `--no-body` | `list`: skip the line-numbered note body. |
| `--reopen` | `resolve`: mark the comment open again. |

## Read first

```bash
obelisk list chapter-3.md
```

`list` prints every comment on the note, then the note's body with line
numbers. Both halves matter: the quote passed to `comment` is copied out of
that body, and the line numbers are what `--near-line` refers to.

## Comment

```bash
obelisk comment chapter-3.md \
  --quote "The horse, which had been standing there, bolted." \
  --body  "The relative clause is doing no work here." \
  --run   r7k2mq
```

A quote that is off by a character writes nothing and says why. A quote that
appears twice is refused until `--near-line` says which one.

For a body with a suggestion block in it, read from stdin so the fences survive
the shell:

````bash
obelisk comment chapter-3.md --quote "The horse, which had been standing there, bolted." --body - <<'END'
Two clauses fighting over one sentence.

```suggestion
The horse bolted.
```
END
````

## Reply and resolve

```bash
obelisk reply chapter-3.md cq7fk2m9x --body "Taken, thanks."
obelisk resolve chapter-3.md cq7fk2m9x
obelisk resolve chapter-3.md cq7fk2m9x --reopen
```

Resolving says the thing the comment asked for has been done. It is a verb an
agent can call on a comment a person wrote, which is the point of asking it to
address one.

## Attribution defaults to agent

`obelisk` writes agent comments unless `--human` says otherwise, because
attribution must not depend on a model remembering to declare itself. A person
driving the CLI by hand is an agent until they say they are not.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Done. |
| `1` | Obelisk refused. See [Refusals](../../reference/refusals/). |
| `2` | The command was wrong. Usage is printed. |
