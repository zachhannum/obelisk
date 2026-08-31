import { Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { hasSuggestion } from "../core/suggestion";
import { ResolvedComment } from "../types";
import { MarkerWidget } from "./marker";

/**
 * The CodeMirror 6 layer: highlights commented passages in Live Preview /
 * Source mode and hangs a marker on them (requirement 5).
 *
 * Shape of the solution:
 *
 *   setComments (StateEffect)  ← dispatched by the plugin when frontmatter
 *                                changes or the active file switches
 *        ↓
 *   commentField (StateField)  ← holds ResolvedComment[] and a DecorationSet,
 *                                and maps the DecorationSet through document
 *                                changes so highlights track edits live
 *        ↓
 *   EditorView.decorations     ← mark decorations for the ranges, plus a
 *                                widget for the click-to-open marker
 *
 * Mapping through changes (rather than recomputing from frontmatter on every
 * keystroke) is what keeps a highlight from flickering while the text around
 * it is being typed. It is presentation only: nothing here is ever written
 * back to disk, and the next `setComments` — driven by a fresh resolve against
 * the document — is the last word on where a comment lives. So editing inside
 * a commented passage looks stable as you type and then detaches when
 * resolution next runs, because its quoted text really is gone.
 */

/** A comment's live position in this editor, mapped through every edit. */
export interface TrackedRange {
	id: string;
	from: number;
	to: number;
}

/** Dispatched to hand a new set of resolved comments to the editor. */
export const setComments = StateEffect.define<ResolvedComment[]>();

/** Dispatched when the sidebar wants a comment visually emphasized. */
export const setActiveComment = StateEffect.define<string | null>();

/** Dispatched to pulse a comment's highlight after jumping to it. */
export const flashComment = StateEffect.define<string | null>();

export interface CommentFieldValue {
	comments: ResolvedComment[];
	/**
	 * Live positions, mapped through every document change. These, not
	 * `comment.range`, are the truth while the note is being edited.
	 */
	ranges: TrackedRange[];
	activeId: string | null;
	flashId: string | null;
	decorations: DecorationSet;
}

export const commentField = StateField.define<CommentFieldValue>({
	create() {
		return {
			comments: [],
			ranges: [],
			activeId: null,
			flashId: null,
			decorations: Decoration.none,
		};
	},

	update(value, tr) {
		let { comments, ranges, activeId, flashId } = value;
		let changed = false;

		// Keep existing highlights glued to the text as the user types.
		// Insertions at either edge land outside the highlight: typing just
		// before a commented word should not silently extend the comment over
		// it, and the same at the end.
		if (tr.docChanged) {
			ranges = ranges.map((r) => ({
				id: r.id,
				from: tr.changes.mapPos(r.from, 1),
				to: tr.changes.mapPos(r.to, -1),
			}));
			changed = true;
		}

		for (const effect of tr.effects) {
			if (effect.is(setComments)) {
				comments = effect.value;
				ranges = comments.flatMap((c) =>
					c.range ? [{ id: c.id, ...c.range }] : [],
				);
				changed = true;
			} else if (effect.is(setActiveComment)) {
				activeId = effect.value;
				changed = true;
			} else if (effect.is(flashComment)) {
				flashId = effect.value;
				changed = true;
			}
		}

		// The emphasis follows the caret out again: a comment stays active only
		// while the selection is still inside its range. Without this, clicking
		// a highlighted passage would leave it washed for good, since nothing
		// else ever clears the flag.
		if (
			activeId !== null &&
			tr.selection &&
			!tr.effects.some((e) => e.is(setActiveComment))
		) {
			const head = tr.newSelection.main.head;
			const range = ranges.find((r) => r.id === activeId);
			if (!range || head < range.from || head > range.to) {
				activeId = null;
				changed = true;
			}
		}

		const decorations = changed
			? buildDecorations(comments, ranges, activeId, flashId)
			: value.decorations;

		return { comments, ranges, activeId, flashId, decorations };
	},

	provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
});

/**
 * Mark decorations for each live range, plus one marker widget per distinct
 * end position (several comments can end at the same spot; they share a marker
 * carrying a count).
 *
 * Empty ranges are skipped: CodeMirror rejects a zero-length mark decoration,
 * and a comment whose text has been deleted has nothing to highlight anyway.
 */
function buildDecorations(
	comments: ResolvedComment[],
	ranges: readonly TrackedRange[],
	activeId: string | null,
	flashId: string | null,
): DecorationSet {
	if (ranges.length === 0) return Decoration.none;

	const byId = new Map(comments.map((c) => [c.id, c]));
	const decorations: Range<Decoration>[] = [];
	const markerEnds = new Map<number, ResolvedComment[]>();

	for (const range of ranges) {
		const comment = byId.get(range.id);
		if (!comment || range.to <= range.from) continue;

		const classes = ["obelisk-highlight"];
		if (comment.id === activeId) classes.push("is-active");
		if (comment.id === flashId) classes.push("is-flashing");
		if (comment.resolved) classes.push("is-resolved");
		if (hasSuggestion(comment)) classes.push("has-suggestion");
		if (comment.appliedAt) classes.push("is-applied");

		decorations.push(
			Decoration.mark({
				class: classes.join(" "),
				attributes: { "data-obelisk-id": comment.id },
			}).range(range.from, range.to),
		);

		const group = markerEnds.get(range.to);
		if (group) group.push(comment);
		else markerEnds.set(range.to, [comment]);
	}

	for (const [end, group] of markerEnds) {
		// The innermost comment — the one that started last — is what a click
		// on the shared marker opens.
		const primary = group[group.length - 1];
		decorations.push(
			Decoration.widget({
				widget: new MarkerWidget(
					primary.id,
					group.length,
					group.some((c) => hasSuggestion(c)),
				),
				side: 1,
			}).range(end),
		);
	}

	// `true` lets CodeMirror sort; it throws on out-of-order ranges otherwise.
	return Decoration.set(decorations, true);
}

export interface EditorHooks {
	/**
	 * A comment was clicked. `reveal` is true for the marker (an explicit
	 * "show me this comment") and false for a click that merely landed inside
	 * a highlighted passage, which should not steal focus into the sidebar.
	 */
	onSelect: (id: string, opts: { reveal: boolean }) => void;
	/**
	 * The document changed, so what the comments resolve to may have changed
	 * with it. Nothing is written; this only asks for a re-resolve.
	 */
	onEdit: () => void;
}

/**
 * Clicks on a marker open the comment; clicks inside a highlight select it
 * without taking over the event, so the caret still lands where the user
 * aimed.
 */
export function commentClickHandler(hooks: EditorHooks): Extension {
	const idAt = (target: EventTarget | null) => {
		const el =
			target instanceof HTMLElement
				? target.closest<HTMLElement>("[data-obelisk-id]")
				: null;
		const id = el?.dataset.obeliskId;
		if (!el || !id) return null;
		return { id, isMarker: el.classList.contains("obelisk-marker") };
	};

	return EditorView.domEventHandlers({
		mousedown(event) {
			const hit = idAt(event.target);
			if (!hit) return false;
			if (!hit.isMarker) {
				// Let the click through to the editor; just follow along.
				hooks.onSelect(hit.id, { reveal: false });
				return false;
			}
			event.preventDefault();
			hooks.onSelect(hit.id, { reveal: true });
			return true;
		},

		keydown(event) {
			if (event.key !== "Enter" && event.key !== " ") return false;
			const hit = idAt(event.target);
			if (!hit?.isMarker) return false;
			event.preventDefault();
			hooks.onSelect(hit.id, { reveal: true });
			return true;
		},
	});
}

export function obeliskEditorExtension(hooks: EditorHooks): Extension {
	return [
		commentField,
		commentClickHandler(hooks),
		EditorView.updateListener.of((update) => {
			const field = update.state.field(commentField, false);
			// `comments`, not `ranges`: a note whose comments have all detached
			// still has to re-resolve, or an undo could never reattach them.
			if (update.docChanged && field?.comments.length) hooks.onEdit();
		}),
	];
}

/**
 * The live range of a comment in this editor, or null if it has none.
 *
 * `field(..., false)` throughout: the extension is not installed in embedded
 * editors, and asking for a missing field throws.
 */
export function trackedRange(
	view: EditorView,
	id: string,
): TrackedRange | null {
	const field = view.state.field(commentField, false);
	return field?.ranges.find((r) => r.id === id) ?? null;
}

/**
 * The comment whose live range contains `pos`, innermost first when several
 * overlap.
 */
export function commentAt(
	view: EditorView,
	pos: number,
): ResolvedComment | null {
	const field = view.state.field(commentField, false);
	if (!field) return null;
	const { comments, ranges } = field;
	let best: TrackedRange | null = null;
	for (const range of ranges) {
		if (pos < range.from || pos > range.to || range.to <= range.from) {
			continue;
		}
		if (!best || range.to - range.from < best.to - best.from) best = range;
	}
	const hit = best;
	return hit ? (comments.find((c) => c.id === hit.id) ?? null) : null;
}
