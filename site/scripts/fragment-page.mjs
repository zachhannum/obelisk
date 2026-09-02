/**
 * Generates the "Agents without MCP" page from `docs/agents-fragment.md`.
 *
 * The fragment is a block a reader pastes into a vault, so it has to survive
 * being quoted on this site without its own fences closing the page's. Keeping
 * one copy in `docs/` and generating the page is what stops the two drifting.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../docs/agents-fragment.md");
const target = resolve(here, "../src/content/docs/agents/fragment.md");

const preamble = `---
title: Agents without MCP
description: A block to paste into a vault's AGENTS.md or CLAUDE.md.
---

An agent that does not speak MCP can use the CLI, given the rules. The repo
ships this block as \`docs/agents-fragment.md\` and this page is generated from
it; paste it into the \`AGENTS.md\` or \`CLAUDE.md\` at the root of the vault.

It documents the CLI rather than the YAML on purpose. An agent told to write
frontmatter directly will get the anchor wrong in exactly the way the anchor
contract exists to prevent.

It assumes \`obelisk\` is on the reader's PATH: \`npm run build\` and \`npm link\`
in the repo, until the package is published.

`;

const file = await readFile(source, "utf8");
const marker = file.search(/^---$/m);
if (marker < 0) throw new Error(`no fragment marker in ${source}`);
const fragment = file.slice(marker).replace(/^---$/m, "");

const longest = [...fragment.matchAll(/^`{3,}/gm)].reduce(
	(most, [run]) => Math.max(most, run.length),
	0,
);
const fence = "`".repeat(Math.max(longest + 1, 4));

await mkdir(dirname(target), { recursive: true });
await writeFile(
	target,
	`${preamble}${fence}markdown\n${fragment.trim()}\n${fence}\n`,
);
