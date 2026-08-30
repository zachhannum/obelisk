# Obelisk — design notes

The name is the scribal mark: an obelus (†) in the margin of a manuscript meant
*this passage is disputed*. That's the plugin.

This document covers the decisions that are expensive to change later. Code
stubs reference it by section.

---

## 1. Requirements → implementation map

| # | Requirement | Where it lives |
|---|---|---|
| 1 | Metadata in frontmatter | `src/store/frontmatter.ts` |
| 2 | Content, line/col range, applicable suggestion | `src/types.ts`, `src/suggestion/apply.ts` |
| 3 | Rendered in the sidebar | `src/view/sidebar-view.ts`, `src/view/comment-card.ts` |
| 4 | Click a comment → scroll to it | `ObeliskPlugin.scrollToComment` |
| 5 | Highlight + marker icon in the content view | `src/editor/highlight-extension.ts`, `src/editor/marker.ts` |
| 6 | Context menu on selection | `src/editor/context-menu.ts` |

---

## 2. Storage

Everything lives under a single `obelisk` frontmatter key, as a list:

```yaml
---
title: Chapter 3
obelisk_schema: 1
obelisk:
  - id: cq7fk2m9x
    author: zach
    created: 2026-08-29T14:02:11.000Z
    body: This paragraph does two things at once.
    anchor:
      from: { line: 12, col: 0 }
      to: { line: 12, col: 47 }
      quote: The horse, which had been standing there, bolted.
      prefix: "…she opened the gate. "
      suffix: " Nobody moved."
    suggestion:
      replacement: The horse bolted.
---
```

**Why frontmatter and not a sidecar file.** Comments travel with the note
through sync, git, export, and rename with zero extra machinery, and
`app.fileManager.processFrontMatter` gives us serialized read-modify-write for
free. The costs, accepted knowingly:

- Comments are visible when the frontmatter is expanded in source mode. Noisy
  for a note under heavy review.
- Every comment write dirties the file, so a review session produces a lot of
  small commits/sync events.
- Frontmatter is a poor fit for long threaded discussions. If replies grow past
  a handful, the escape hatch is to move bodies to a sidecar and keep only
  anchors inline — the `Comment` type is shaped so that split is possible
  without changing anchoring.

**Forward compatibility.** `obelisk_schema` records the writer's
`SCHEMA_VERSION`. Unknown keys on a comment must survive a round-trip, so a
newer version's fields aren't stripped by an older one.

**Trust boundary.** Frontmatter is hand-editable. `normalize()` in
`frontmatter.ts` is the only place that turns YAML into `Comment[]`, and a
malformed entry must be dropped with a console warning — never thrown — or one
bad comment takes down the sidebar for the whole note.

---

## 3. Anchoring

The hardest part. Three decisions:

### 3a. Positions are body-relative, not file-relative

`anchor.from.line` is counted from the first line *after* the closing `---`.

If lines were file-relative, adding a comment would grow the frontmatter and
invalidate the stored line of every other comment in the note — a write that
corrupts its own neighbours. Body-relative coordinates make frontmatter growth
invisible to anchors.

The conversion lives in `store/frontmatter.ts#bodyOffset` (via
`metadataCache.getFileCache(file).frontmatterPosition`) and
`store/anchors.ts#toOffset` / `#toBodyPos`. Nothing else should do this
arithmetic.

### 3b. Store both coordinates *and* the quoted text

Line/col alone breaks the moment anyone edits above the anchor outside of
Obsidian (git merge, a sync from another device, an external editor). Quote
matching alone is ambiguous for short or repeated selections.

So we store both, plus up to 32 characters of `prefix`/`suffix` — the same
belt-and-braces approach as the W3C Annotation Data Model's
`TextPositionSelector` + `TextQuoteSelector` pair. Resolution order:

1. Line/col points at text equal to `quote` → **exact**.
2. Otherwise search the body for `quote`; score candidates on prefix/suffix
   overlap, break ties by distance from the stored line → **relocated**.
3. `quote` not found → **orphaned**. Still listed in the sidebar, flagged, and
   decorating nothing. Never silently deleted.

### 3c. Live edits are tracked in CodeMirror, flushed on a debounce

While a note is open, highlights must follow the text as it's typed. That's
`commentField` mapping its `DecorationSet` through each transaction's changes —
not re-reading frontmatter, which would write on every keystroke and fight the
undo stack.

The drifted positions get written back to frontmatter on a debounce and on file
close (`anchors.pendingAnchorWrites`). Between those flushes the on-disk line
numbers are stale, which is exactly what step 2 of resolution exists to absorb.

---

## 4. Suggested edits

`suggestion.replacement` replaces exactly the anchored range.

**A suggestion applies only from an `exact` anchor.** If the text has changed
since the suggestion was written, we refuse and say so, rather than splicing a
replacement over text the commenter never saw. This mirrors GitHub greying out
stale suggestions, and it's the difference between a useful feature and a
data-loss bug.

Applying writes through `vault.process` rather than the editor, so it works on
notes that aren't open. The write and the subsequent frontmatter update are two
separate operations against the same file — they must be sequenced, not
interleaved.

Diffing (`suggestion/diff.ts`) is display-only and deliberately dependency-free;
the inputs are sentences, so a word-level LCS is enough.

---

## 5. Rendering

**Live Preview / Source** — a CM6 extension. Mark decorations for the
highlight, a widget decoration for the trailing marker. This is the primary
path and the only one where highlights track edits in real time.

**Reading view** — a `MarkdownPostProcessor`, gated behind
`highlightInReadingView`. It needs a *separate* anchoring path: rendered DOM has
no line numbers, so it matches `anchor.quote` within each rendered block, using
`ctx.getSectionInfo(el)` to recover the line range of the section. Expect this
to be less reliable than the editor path; it is a nice-to-have, not the
contract.

**Sidebar** — an `ItemView` in the right leaf. It renders and delegates; every
mutation goes back through the plugin. Cards sort in document order so the list
mirrors the note, with orphans in a section at the bottom.

---

## 6. Open questions

- **Multi-user attribution.** `author` is a free-text setting today. Fine for
  one person across devices, weak for a shared vault. Worth revisiting only if
  someone actually shares a vault.
- **Overlapping comments.** The data model allows them; the CSS currently
  doesn't distinguish one highlight from two stacked. Needs a visual answer.
- **Comments on frontmatter itself.** Currently impossible by construction
  (negative body lines). Probably correct.
- **Canvas, PDF, and non-markdown files.** Out of scope. The store assumes a
  markdown file with frontmatter.
- **Performance ceiling.** Quote search is O(doc × comments) per resolve. Fine
  at a few dozen comments; needs a cap and a cache before it's fine at a
  thousand.

---

## 7. Build

```bash
npm install
npm run dev     # esbuild watch → main.js
npm run build   # typecheck + minified build
```

To test in a vault, symlink the repo into it:

```bash
ln -s "$PWD" /path/to/vault/.obsidian/plugins/obelisk
```

Then enable **Obelisk** in Settings → Community plugins, and use the *Reload
app without saving* command after each rebuild.
