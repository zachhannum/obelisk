# Obelisk design notes

The name is the scribal mark: an obelus (†) in the margin of a manuscript meant
*this passage is disputed*.

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
|  | Writing a comment | `src/view/composer.ts`, `src/view/embedded-editor.ts` |

---

## 2. Storage

Everything lives under a single `obelisk` frontmatter key, as a list:

```yaml
---
title: Chapter 3
obelisk_schema: 3
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
through sync, git, export and rename with zero extra machinery, and
`app.fileManager.processFrontMatter` gives us serialized read-modify-write for
free. The costs, accepted knowingly:

- Comments are visible when the frontmatter is expanded in source mode. Noisy
  for a note under heavy review.
- Every comment write dirties the file. Only deliberate actions write (creating,
  editing, replying, resolving, deleting, applying) so editing a note never
  touches its comments, but a burst of review activity is still a burst of sync
  events.
- Frontmatter is a poor fit for long threaded discussions. If replies grow past
  a handful, the escape hatch is to move bodies to a sidecar and keep only
  anchors inline. The `Comment` type is shaped so that split is possible
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
malformed entry must be dropped with a console warning, never thrown, or one
bad comment takes down the sidebar for the whole note.

---

## 3. Anchoring

The hardest part, and the one place where being clever made the plugin feel
broken. It is now one rule.

### 3a. The quote is the anchor

`resolve()` searches the body for `anchor.quote`. Found → the comment attaches
there. Not found → the comment is **detached**: listed in the sidebar, flagged,
decorating nothing. There is no partial match, no fuzzy re-find, no scoring of
prefix or suffix context. If the text a comment was written on is edited or
deleted, the comment says so instead of guessing where it went.

A search that scores near misses is confident and sometimes wrong: it moves a
highlight to whichever other paragraph scored best when you delete a sentence,
and it does that silently. A detached comment is a
correct answer that asks the reader for help, which costs less than a
confident wrong one.

**Detachment is derived, never stored.** It is recomputed on every resolve, so
undoing a deletion reattaches the comment on its own.

**It is only flagged while the comment is open.** A resolved comment that
detaches has usually detached *because* it was resolved: its suggestion was
applied, or the passage was rewritten in answer to it. Warning there is warning
that the comment worked. A resolved comment keeps its card and its quote
without any of the detached treatment, and sorts to the bottom of the list.

### 3b. Positions are a hint, and body-relative

`anchor.from`/`to` record where the passage was when the comment was written.
They are used for exactly two things: ordering the sidebar, and choosing the
nearest candidate when a quote occurs more than once in the note. Nothing keeps
them current. They are written once, at creation, and left alone.

They stay body-relative (counted from the first line after the closing `---`)
so that growing the frontmatter does not shift every hint in the file. The
conversion lives in `store/anchors.ts#toOffset` / `#toBodyPos`; nothing else
should do this arithmetic.

Because the hint is only a tiebreak, an edit anywhere costs nothing, whether it
happens in Obsidian, in an external editor, in a git merge, or on another
device. The quote is still the quote.

### 3c. CodeMirror mapping is presentation, not truth

While a note is open, `commentField` maps its ranges through each transaction
so a highlight does not flicker as you type around it. Nothing there is written
back to disk, and the next `setComments`, built from a fresh resolve, overrules
it.

So typing inside a commented passage looks stable for as long as CodeMirror can
keep up, and then the comment detaches when resolution next runs, because its
quoted text really is gone.

Resolution runs a short debounce (`RESOLVE_DELAY`, 250ms) after the editor goes
quiet, and again on a file switch or a metadata change. The delay is
deliberately short: a resolve is a substring search per comment that writes
nothing, so running one costs about what deciding not to would. Hanging this
off `metadataCache` alone would mean waiting for Obsidian to autosave and
reparse, which is seconds, and a comment that greys out two seconds after you
edit it reads as lag rather than as an answer.

---

## 4. Suggested edits

**A proposal is part of the body.** It is a fenced block tagged `suggestion`
inside the comment, exactly as on GitHub, and its content replaces the anchored
range. Schema 1 kept it in a `suggestion.replacement` key beside the body, and
that shape is folded into the body on read (`store/frontmatter.ts`,
`foldLegacySuggestion`) and dropped on the next write.

A field beside the body makes "a comment" two things: a prose part that is
markdown and a proposal part that is a bare string with its own textarea, its
own storage and its own place in the card. Everything that composes in markdown
(a proposal with a paragraph of reasoning above it, two alternatives to choose
between, a counter-proposal in a *reply*) is then either impossible or needs a
new field. As a fenced block, all of it is just writing, and the plugin's job
shrinks to two things it can do well:

- `suggestion/parse.ts` finds the blocks. A fence scanner rather than a regex,
  because fences nest: a suggestion may contain a code sample, and a
  ` ```suggestion ` mentioned inside some other fenced block is a code sample,
  not a proposal.
- `view/markdown.ts` renders the body with Obsidian's own `MarkdownRenderer`
  and then swaps each rendered `suggestion` code block for a diff and an Apply
  button. Post-processing the output, rather than registering a global code
  block processor, keeps the treatment inside comment bodies, so a
  ` ```suggestion ` block typed into a *note* stays an ordinary code block.

Because the body is the only field, one composer serves the dialog and the
reply box (`view/composer.ts`): a markdown editor with Write/Preview and a
button that inserts a suggestion block prefilled with the quoted text,
selected, ready to be edited in place. "Suggest an edit" is that dialog opened
with the button already pressed, not a second kind of comment.

**The comment box is the editor.** Writing happens in the same embedded editor
Obsidian uses for Canvas cards and property fields
(`view/embedded-editor.ts`), so Cmd+B, list continuation, `[[` autocompletion
and live preview all behave the way they do in a note, rather than in a
textarea where a hand-written keymap would be perpetually a little wrong. The
price is that none of it is public API: the class is only reachable by building
a throwaway editor and walking two steps up its prototype chain, so an Obsidian
release could take it away. Every step of that dig is guarded and the composer
keeps a textarea to fall back to, which costs the shortcuts and nothing else,
since the tabs, the suggestion button and submit are written against a small
`Field` interface that both backends answer. Two consequences fall out of the
borrowed editor: Esc arrives as a callback (`onEscape`) because the editor
takes the key before a modal's own scope sees it, and the Preview tab stays
even though the editor previews live, because it is the only place a
`suggestion` block renders as the diff a reader gets.

Editing a body reuses that composer too, in place of the rendered markdown, so
a proposal can be revised with the same button that inserted it rather than by
hand-typing a fence. An edit rewrites `body` and stamps `edited`; the anchor is
untouched, because changing what you said about a passage is not a claim about
a different passage, and a suggestion block written during the edit is measured
against the same quoted text as before. `edited` is separate from `modified`,
which moves for any write at all, including resolving, so the "edited" marker
on a card means the text in front of you was rewritten, not that something on
the record changed.

`appliedAt` moved to the comment for the same reason there can be several
blocks: applying re-anchors the whole comment onto its replacement, so every
other proposal in the thread is now measured against text that no longer
exists. Applied is a fact about the thread, not about one block.

**Applying resolves the comment.** Taking the edit is the strongest answer a
proposal can get, and once it is taken no other block in the thread can be
applied anyway; a comment left open there would sit in the open count with
nothing to do on it. The card stays, marked *Applied*, and *Reopen* is one
click away if the comment also asked something the edit did not answer.
`removeCommentOnApply` is the same gesture taken further: throw the record
away rather than keep it.

**A suggestion applies only when the quoted text is still intact.** That is the
same condition as being attached, so there is no separate staleness check: if
`resolve` found the quote, the splice lands on exactly the characters the
commenter saw. If it did not, we refuse and say so rather than splicing a
replacement over text the commenter never read. This mirrors GitHub greying out
a stale suggestion, and it is the difference between a useful feature and a
data-loss bug.

When the quote occurs more than once, we splice the occurrence `resolve` picked,
the one the sidebar and the editor were highlighting. The user applies what
they were looking at, rather than being refused for an ambiguity that was never
visible to them.

The splice moves every comment after it, and none of them care: they are found
by their quoted text, which the splice did not touch. The applied comment is
the one exception. It is re-anchored onto its replacement, so it stays attached
to the passage it just changed instead of detaching on text that no longer
exists.

Applying writes through `vault.process` rather than the editor, so it works on
notes that aren't open. The body splice and the frontmatter update are two
sequenced operations against the same file, and the frontmatter side is a
single `processFrontMatter` pass.

Diffing (`suggestion/diff.ts`) is display-only and deliberately dependency-free;
the inputs are sentences, so a word-level LCS is enough. It diffs the block
against `anchor.quote`, which is also what the compose preview diffs against:
one renderer, so what you see while writing is what the reader gets.

---

## 5. Rendering

**Live Preview / Source** is a CM6 extension. Mark decorations for the
highlight, a widget decoration for the trailing marker. This is the primary
path and the only one where highlights track edits in real time.

**Reading view** shows nothing. Anchoring against rendered HTML loses to any
quote spanning markup, a baked-in highlight has to be re-rendered rather than
dispatched to whenever a comment changes, and what survives all that is a
hairline underline nobody notices. Comments live in the editor; Reading view is
for reading.

**Sidebar** is an `ItemView` in the right leaf. It renders and delegates; every
mutation goes back through the plugin. Cards sort in document order by default,
so the list mirrors the note, with open detached ones in a section at the
bottom. A button in the header toggles that to newest first, for reading a
review pass in the order it was written rather than in the order the note runs.

Three fixed filter chips sit under the count: *All*, *Open*, and *Suggestions*,
which narrows to comments carrying a suggestion block, applied or not. Agent
runs add one chip each beside them (see
[`AGENT-INTEGRATION.md`](AGENT-INTEGRATION.md) § 3).

Resolved comments are always listed. There is no setting to hide them: they
still highlight their passage in the note, so hiding them from the sidebar only
made the list disagree with the text, and it made resolving a comment feel like
deleting it. The *Open* filter narrows the list to unresolved comments, and it
is a chip in front of the reader rather than a preference two menus away.

---

## 6. Open questions

- **Multi-user attribution.** `author` is a free-text setting today. Fine for
  one person across devices, weak for a shared vault. Worth revisiting only if
  someone actually shares a vault. An agent leaving comments makes this
  concrete rather than hypothetical; see
  [`AGENT-INTEGRATION.md`](AGENT-INTEGRATION.md) § 3.
- **Overlapping comments.** Nested highlights deepen the wash and thicken the
  underline per layer (`.obelisk-highlight .obelisk-highlight`), and comments
  sharing an end position collapse into one marker with a count. Legible to
  three deep; past that it is mush, and the marker only opens the innermost.
- **A quote that is not unique.** Anchoring by quoted text cannot tell two
  identical passages apart. The stored line/col hint picks the nearer one,
  which is right while the anchored copy still exists, since an edit above it
  just shifts both. But *edit the anchored copy itself* and its text is gone,
  so the comment attaches to the surviving twin instead of detaching. Rare for
  a sentence, plausible for a two-word quote. Fixing it means storing which
  occurrence a comment meant and reconciling that count on every resolve, which
  is the kind of bookkeeping this design avoids on purpose. Revisit if it
  actually bites.
- **Comments on frontmatter itself.** Currently impossible by construction
  (negative body lines). Probably correct.
- **Canvas, PDF, and non-markdown files.** Out of scope. The store assumes a
  markdown file with frontmatter.
- **Performance ceiling.** Quote search is O(doc × comments) per resolve, with
  each comment's scan stopping as soon as occurrences start getting further
  from its stored hint. A resolve runs 250ms after typing stops rather than per
  keystroke, and the highlights hold their place in between by mapping ranges
  inside CodeMirror, so the cost is bounded in practice. A note with a thousand
  comments would still want a cache keyed on document version.

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
