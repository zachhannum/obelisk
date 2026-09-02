# CLAUDE.md

Working agreements for implementing Obelisk. These are policies, not
suggestions; when something here conflicts with a quick fix, the policy
wins and the quick fix waits for its own commit.

## Project shape

- One repo, one npm package, three front ends. `src/core/` is the half
  that does not import Obsidian: the model, the anchor arithmetic, the
  YAML, and the four verbs. `src/main.ts` and everything under
  `src/view/`, `src/editor/`, `src/store/`, `src/suggestion/` is the
  plugin; `src/cli/` is `obelisk`; `src/mcp/` is `obelisk-mcp`. The two
  bins are esbuild bundles in `dist/`, one file each, built only by a
  production build.
- `site/` is the documentation site: Astro and Starlight, its own
  `package.json`, its own `node_modules`, built by its own workflow. Nothing
  in it is imported by `src/`, and `npm run build` at the root does not touch
  it. Its *Agents without MCP* page is generated from
  `docs/agents-fragment.md` before every site build, so the fragment a reader
  pastes into a vault has one source; the generated page is gitignored.
- `test/` is the capture harness: Playwright driving a real Obsidian,
  whose only output is the six PNGs under `site/src/assets/shots/`. It is
  the one thing outside `site/` that reads `site/`, for the design tokens
  and the font files.
- The dependency runs one way: front ends import `core/`, `core/`
  imports nothing of theirs and nothing of Obsidian's. A `from
  "obsidian"` under `src/core/` breaks the CLI and the MCP server
  without breaking the plugin build, so it is the one import worth
  checking by eye.
- **The quote is the anchor.** `anchor.quote` is what a comment attaches
  by; the line/column range is a hint used for sidebar order and for
  breaking ties when a quote appears twice, and is never rewritten.
  Nothing fuzzy-matches, re-finds, or scores a near miss. A quote that
  is not found detaches the comment and says so.
- Detachment is derived on every resolve, never stored. Nothing about
  where a comment sits is written back to disk.
- Storage is one frontmatter key, `obelisk`, plus `obelisk_schema`.
  Unknown keys on a comment survive a round-trip. Migration is a
  read-time fold in `core/schema.ts`, never a sweep, so a vault that is
  only read is never dirtied.
- A suggested edit is a fenced ` ```suggestion ` block inside an
  ordinary markdown body, not a field beside it. Anything that wants to
  live next to a proposal is written as markdown.
- `normalize()` is the only place YAML becomes `Comment[]`, and it is
  the trust boundary: a malformed entry is dropped with a console
  warning, never thrown, or one bad comment takes the sidebar down for
  the whole note.
- The decisions that are expensive to change live in
  [`docs/DESIGN.md`](docs/DESIGN.md) and
  [`docs/AGENT-INTEGRATION.md`](docs/AGENT-INTEGRATION.md). A change
  that contradicts one of them updates it in the same commit.
- Work is tracked in GitHub issues. `publishing` covers the two
  official channels, the Obsidian directory and npm; `obsidian` and
  `mcp` mark which of them an issue serves. An issue's acceptance
  checkboxes are its definition of done. An issue with none is a note
  rather than a task, and wants breaking down before it is picked up.

## Testing

Verification today is five things, and a change is not done until the
ones it touches pass:

- `npm run build` runs `tsc --noEmit` over `src/**` and the harness,
  then the bundles. Strict mode is on; a change that only typechecks
  with a cast has not been thought through yet.
- `npm run shots` builds, then launches Obsidian under Playwright,
  opens the vault in `test/vaults/`, and rewrites the landing page's
  captures. The captures are committed, so a change to the sidebar
  shows up as a changed image. `obsidian-launcher` downloads Obsidian
  on the first run, and the theming reads `site/`, so
  `site/node_modules` has to exist.
- The plugin, in a vault, reloaded. Symlink the repo into
  `.obsidian/plugins/obelisk`, rebuild, and run *Reload app without
  saving*. Anchoring, decoration and the composer have no other proof.
- The CLI, against a scratch note: `obelisk list`, then a `comment`
  that lands and one whose `--quote` is off by a character, which must
  write nothing and say why.
- The MCP handshake, with no agent in the way: the `printf | node
  dist/mcp.mjs` smoke test in the README. A server that fails it fails
  the same way for an agent, which sees only `CONNECTION_CLOSED` and no
  cause.

`core/` has no runner. The anchor arithmetic, the fence scanner, the
schema fold and the four verbs are pure functions over strings,
testable without Obsidian, and they are where the data-loss bugs would
be.

## Commits, PRs, and CI

- Commit subjects are sentences in the imperative, saying what the
  change does for a reader of the code: "Let a single reply be
  deleted", not "fix(view): reply delete". No conventional-commit
  prefixes, no scopes.
- One issue per branch: `feat/<issue>-slug`, `fix/<issue>-slug`,
  `chore/<issue>-slug`.
- The PR description references the issue with `Closes #N`. Every
  acceptance checkbox is checked before review is requested.
- PR and issue bodies are unwrapped: one line per paragraph and per
  list item, blank lines between them. GitHub renders a single newline
  as a line break, so prose wrapped to the width used for code comes
  out as a ragged column.
- Before pushing, run `npm run build` and make it green. CI runs the
  same command and nothing else, so a red push is a wasted cycle that
  tells you what you already could have known.
- After opening the PR, watch it to green (`gh run watch`) before
  handing it to review.
- **Claude does not merge.** CI green is the floor, not the finish
  line; a human reviews and merges every PR, including Claude's.
- Never force-push `main`. History rewrites on feature branches are
  fine while the PR is open.
- No Co-Authored-By trailers on commits.
- Keep a PR scoped, but a small fix noticed on the way may ride along
  rather than wait for a branch of its own.
- Never commit `main.js`, `dist/`, or `data.json`. They are build
  output and local state, and `.gitignore` covers them for that reason.
- `npm version` runs `version-bump.mjs`, which keeps `manifest.json`
  and `versions.json` in step. Editing either by hand is how they
  drift.

## CI scaffolding

`.github/workflows/build.yml` runs on every PR and on push to main:
`npm install`, then `npm run build` on Node 22, covering the typecheck,
the plugin bundle, and both bins. That is the whole gate. Anything that
should block a merge has to be reachable from `npm run build` or it
blocks nothing.

`.github/workflows/docs.yml` builds `site/` on any change under it, and
deploys to GitHub Pages on push to main. It needs Pages enabled for the
repo with GitHub Actions as the source, or the deploy step has nowhere
to land.

`.github/workflows/shots.yml` runs the capture harness on
ubuntu-latest and macos-latest for any change to the plugin or the
harness, and uploads Playwright traces when it fails. It is not a merge
gate; only `npm run build` is.

`.github/workflows/refresh-shots.yml` recaptures on push to main and
opens a pull request with the result. It never pushes to main, and it
merges nothing.

## Documentation rules

Applies to code comments and all documentation, internal (CLAUDE.md,
docs/) and external (README).

**DO**

- Keep them short.
- Only write documentation when the WHY is non-obvious.
- Write docs as statements of how things are.
- Run the `humanizer` skill over prose before it lands: comments, doc
  comments, docs/, README, PR and issue bodies.

**DO NOT**

- Document what the code or doc already says.
- Document deletions.
- Document changes over time; history lives in git.
- Include links (code references, PRs, issues, error URLs).
- Explain why a rejected or unchosen alternative wasn't taken.

Run it against its own rules. Nothing in this repo is a writing sample
to match, so nothing overrides them, the em dash rule included.

## Conventions

- TypeScript strict, ES2020, `moduleResolution: bundler`. Tabs, four
  wide, per `.editorconfig`; two spaces in JSON, YAML and markdown.
- Errors in `core/` are returned, not thrown: `Outcome<T>` with a
  `FailureCode`, so a front end can render a refusal rather than a
  stack. `throw` is for the front ends (`UsageError` in the CLI) and
  for `NoteError`, which means the file is not something we can read.
- Zod validates what crosses the MCP boundary. `core/schema.ts`
  validates what crosses the YAML one, and is the only thing that does.
- Everything Obsidian ships (the `obsidian` module, Electron, every
  `@codemirror/*` and `@lezer/*` package) is external to the plugin
  bundle, because the app provides it at runtime. Bundling a second
  copy of `@codemirror/state` gives you two `StateField` identities and
  a plugin that loads without doing anything.
- The bins bundle everything instead: a vault tool an agent invokes
  should be one file that starts.
- Writes from outside Obsidian are frontmatter-only and leave the note
  body byte-identical, and re-read the file first and refuse if it
  changed underneath. That is why they are safe while the note is open
  in the app. Applying a suggestion is the exception: it splices the
  body, and goes through `vault.process`.
- Public surface gets a doc comment: the `core/` exports are the
  contract three front ends are written against.
