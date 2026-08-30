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
| 2 | Content, line/col range, applicable suggestion | `src/types.ts`, `src/store/anchors.ts`, `src/suggestion/parse.ts`, `src/suggestion/apply.ts` |
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
obelisk_schema: 2
obelisk:
  - id: cq7fk2m9x
    author: zach
    created: 2026-08-29T14:02:11.000Z
    body: |-
      This paragraph does two things at once.

      ```suggestion
      The horse bolted.
      ```
    anchor:
      from: { line: 12, col: 0 }
      to: { line: 12, col: 47 }
      quote: The horse, which had been standing there, bolted.
---
```

**Why frontmatter and not a sidecar file.** Comments travel with the note
through sync, git, export, and rename with zero extra machinery, and
`app.fileManager.processFrontMatter` gives us serialized read-modify-write for
free. The costs, accepted knowingly:

- Comments are visible when the frontmatter is expanded in source mode. Noisy
  for a note under heavy review.
- Every comment write dirties the file. Only deliberate actions write —
  creating, editing, replying, resolving, deleting, applying — so editing a
  note never touches its comments, but a burst of review activity is still a burst of
  sync events.
- Frontmatter is a poor fit for long threaded discussions. If replies grow past
  a handful, the escape hatch is to move bodies to a sidecar and keep only
  anchors inline — the `Comment` type is shaped so that split is possible
  without changing anchoring.

**Forward compatibility.** `obelisk_schema` records the writer's
`SCHEMA_VERSION`. Unknown keys on a comment must survive a round-trip, so a
newer version's fields aren't stripped by an older one.

**Migration is a read-time fold, never a sweep.** Schema 1's `suggestion` key
is understood on read and re-expressed in the new shape; the note on disk is
left alone until something writes to it anyway. A vault that is only ever read
is never dirtied, and there is no upgrade pass that can half-finish.

**Trust boundary.** Frontmatter is hand-editable. `normalize()` in
`frontmatter.ts` is the only place that turns YAML into `Comment[]`, and a
malformed entry must be dropped with a console warning — never thrown — or one
bad comment takes down the sidebar for the whole note.

---

## 3. Anchoring

The hardest part, and the one place where being clever made the plugin feel
broken. It is now one rule.

### 3a. The quote is the anchor

`resolve()` searches the body for `anchor.quote`. Found → the comment attaches
there. Not found → the comment is **detached**: listed in the sidebar, flagged,
decorating nothing.

That is the whole model. There is no partial match, no fuzzy re-find, no
scoring of prefix/suffix context. If the text a comment was written on is
edited or deleted, the comment says so instead of guessing where it went.

An earlier design tried to follow edited text — quote search scored on
surrounding context, ranked by distance from the recorded line. It did work, in
the sense that it usually found *something*. What it felt like was a highlight
that jumped to another paragraph when you deleted a sentence, because some
other occurrence of the quote scored best. Guessing produces a wrong answer
confidently; detaching produces a right answer that asks for help.

**Detachment is derived, never stored.** It is recomputed on every resolve, so
undoing a deletion reattaches the comment on its own.

### 3b. Positions are a hint, and body-relative

`anchor.from`/`to` record where the passage was when the comment was written.
They are used for exactly two things: ordering the sidebar, and choosing the
nearest candidate when a quote occurs more than once in the note. Nothing keeps
them current — they are written once, at creation, and left alone.

They stay body-relative (counted from the first line after the closing `---`)
so that growing the frontmatter does not shift every hint in the file. The
conversion lives in `store/anchors.ts#toOffset` / `#toBodyPos`; nothing else
should do this arithmetic.

Because the hint is only a tiebreak, an edit anywhere — in Obsidian, in an
external editor, from a git merge, from another device — costs nothing. The
quote is still the quote.

### 3c. CodeMirror mapping is presentation, not truth

While a note is open, `commentField` maps its ranges through each transaction
so a highlight does not flicker as you type around it. That is the entire
purpose. Nothing there is written back to disk, and the next `setComments` —
built from a fresh resolve — overrules it.

So typing inside a commented passage looks stable for as long as CodeMirror can
keep up, and then the comment detaches when resolution next runs, because its
quoted text really is gone.

Resolution runs a short debounce (`RESOLVE_DELAY`, 250ms) after the editor goes
quiet. It is deliberately short: a resolve is a substring search per comment
that writes nothing, so running one costs about what deciding not to would.
Hanging this off `metadataCache` instead — the only other signal available —
would mean waiting for Obsidian to autosave and reparse, which is seconds, and
a comment that greys out two seconds after you edit it reads as lag rather than
as an answer.

The debounce that is *gone* is the one that wrote: no flush on file close, no
`pendingAnchorWrites`, no window during which the on-disk anchors are stale —
because they are never rewritten. That subsystem, and the class of bugs where
it raced the resolver for control of the same highlight, is deleted.

---

## 4. Suggested edits

**A suggestion is markdown, not a field.** A proposal is a fenced block tagged
`suggestion` inside the comment body, exactly as on GitHub; its content
replaces the anchored range. Schema 1 kept it in a `suggestion.replacement`
key beside the body, and that shape is folded into the body on read
(`store/frontmatter.ts`, `foldLegacySuggestion`) and dropped on the next write.

The reason to move it is that the old shape made "a comment" two things: a
prose part that was markdown and a proposal part that was a bare string with
its own textarea, its own storage and its own place in the card. Everything
that composes in markdown — a proposal with a paragraph of reasoning above it,
two alternatives to choose between, a counter-proposal in a *reply* — was
either impossible or needed a new field. As a fenced block, all of it is just
writing, and the plugin's job shrinks to two things it can do well:

- `suggestion/parse.ts` finds the blocks. A fence scanner rather than a regex,
  because fences nest: a suggestion may contain a code sample, and a
  ` ```suggestion ` mentioned inside some other fenced block is a code sample,
  not a proposal.
- `view/markdown.ts` renders the body with Obsidian's own `MarkdownRenderer`
  and then swaps each rendered `suggestion` code block for a diff and an Apply
  button. Post-processing the output, rather than registering a global code
  block processor, keeps the treatment inside comment bodies — a
  ` ```suggestion ` block typed into a *note* stays an ordinary code block.

Because the body is the only field, one composer serves the dialog and the
reply box (`view/composer.ts`): a textarea with Write/Preview and a button that
inserts a suggestion block prefilled with the quoted text, selected, ready to
be edited in place. "Suggest an edit" is that dialog opened with the button
already pressed, not a second kind of comment.

Editing a body reuses that composer too, in place of the rendered markdown —
so a proposal can be revised with the same button that inserted it rather than
by hand-typing a fence. An edit rewrites `body` and stamps `edited`; the anchor
is untouched, because changing what you said about a passage is not a claim
about a different passage, and a suggestion block written during the edit is
measured against the same quoted text as before. `edited` is separate from
`modified` — the latter moves for any write at all, including resolving — so
the "edited" marker on a card means the text in front of you was rewritten,
not that something on the record changed.

`appliedAt` moved to the comment for the same reason there can be several
blocks: applying re-anchors the whole comment onto its replacement, so every
other proposal in the thread is now measured against text that no longer
exists. Applied is a fact about the thread, not about one block.

**A suggestion applies only when the quoted text is still intact.** That is the
same condition as being attached, so there is no separate staleness check: if
`resolve` found the quote, the splice lands on exactly the characters the
commenter saw. If it did not, we refuse and say so rather than splicing a
replacement over text the commenter never read. This mirrors GitHub greying out
a stale suggestion, and it is the difference between a useful feature and a
data-loss bug.

When the quote occurs more than once, we splice the occurrence `resolve` picked
— the one the sidebar and the editor were highlighting. The user applies what
they were looking at, rather than being refused for an ambiguity that was never
visible to them.

The splice moves every comment after it, and none of them care: they are found
by their quoted text, which the splice did not touch. The applied comment is
the one exception — it is re-anchored onto its replacement, so it stays
attached to the passage it just changed instead of detaching on text that no
longer exists.

Applying writes through `vault.process` rather than the editor, so it works on
notes that aren't open. The body splice and the frontmatter update are two
sequenced operations against the same file, and the frontmatter side is a
single `processFrontMatter` pass.

Diffing (`suggestion/diff.ts`) is display-only and deliberately dependency-free;
the inputs are sentences, so a word-level LCS is enough. It diffs the block
against `anchor.quote`, which is also what the compose preview diffs against —
one renderer, so what you see while writing is what the reader gets.

---

## 5. Rendering

**Live Preview / Source** — a CM6 extension. Mark decorations for the
highlight, a widget decoration for the trailing marker. This is the primary
path and the only one where highlights track edits in real time.

**Reading view** — a `MarkdownPostProcessor`, gated behind
`highlightInReadingView`. Same rule, different haystack: `ctx.getSectionInfo`
hands over the file's source text, so comments resolve exactly as they do for
the editor and the plugin then asks which section each resolved offset falls
in — a quote appearing twice is highlighted in the block it resolves to, not
both. Only finding it *within* the rendered block is DOM work, and a quote
spanning markup will not be found there. Expect this to be less reliable than
the editor path; it is a nice-to-have, not the contract. One render pass calls
the post-processor once per section, so the pass shares a single resolution.

**Sidebar** — an `ItemView` in the right leaf. It renders and delegates; every
mutation goes back through the plugin. Cards sort in document order so the list
mirrors the note, with detached ones in a section at the bottom.

---

## 6. Open questions

- **Multi-user attribution.** `author` is a free-text setting today. Fine for
  one person across devices, weak for a shared vault. Worth revisiting only if
  someone actually shares a vault.
- **Overlapping comments.** Nested highlights deepen the wash and thicken the
  underline per layer (`.obelisk-highlight .obelisk-highlight`), and comments
  sharing an end position collapse into one marker with a count. Legible to
  three deep; past that it is mush, and the marker only opens the innermost.
- **A quote that is not unique.** Anchoring by quoted text cannot tell two
  identical passages apart. The stored line/col hint picks the nearer one,
  which is right while the anchored copy still exists — an edit above it just
  shifts both. But *edit the anchored copy itself* and its text is gone, so the
  comment attaches to the surviving twin instead of detaching. Rare for a
  sentence, plausible for a two-word quote. Fixing it means storing which
  occurrence a comment meant and reconciling that count on every resolve, which
  is the kind of bookkeeping this design deleted on purpose. Revisit if it
  actually bites.

- **Comments on frontmatter itself.** Currently impossible by construction
  (negative body lines). Probably correct.
- **Canvas, PDF, and non-markdown files.** Out of scope. The store assumes a
  markdown file with frontmatter.
- **Performance ceiling.** Quote search is O(doc × comments) per resolve, with
  each comment's scan stopping as soon as occurrences start getting further
  from its stored hint. Resolution runs on file switches and frontmatter
  changes rather than on keystrokes — typing is handled by mapping ranges
  inside CodeMirror — so the cost is bounded in practice. A note with a
  thousand comments would still want a cache keyed on document version.

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
