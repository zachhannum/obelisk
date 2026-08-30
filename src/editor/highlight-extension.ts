import { Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { ResolvedComment } from "../types";

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
 * keystroke) is what makes the highlight follow the text while typing inside
 * it. Frontmatter is only re-read when it actually changes.
 */

/** Dispatched to hand a new set of resolved comments to the editor. */
export const setComments = StateEffect.define<ResolvedComment[]>();

/** Dispatched when the sidebar wants a comment visually emphasized. */
export const setActiveComment = StateEffect.define<string | null>();

export interface CommentFieldValue {
	comments: ResolvedComment[];
	activeId: string | null;
	decorations: DecorationSet;
}

export const commentField = StateField.define<CommentFieldValue>({
	create() {
		return {
			comments: [],
			activeId: null,
			decorations: Decoration.none,
		};
	},

	update(value, tr) {
		let { comments, activeId, decorations } = value;

		// Keep existing highlights glued to the text as the user types.
		decorations = decorations.map(tr.changes);

		for (const effect of tr.effects) {
			if (effect.is(setComments)) {
				comments = effect.value;
				decorations = buildDecorations(comments, activeId);
			} else if (effect.is(setActiveComment)) {
				activeId = effect.value;
				decorations = buildDecorations(comments, activeId);
			}
		}

		return { comments, activeId, decorations };
	},

	provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
});

/**
 * TODO: build the decoration set.
 *
 *   - One `Decoration.mark` per resolved comment range, class
 *     `obelisk-highlight` (+ `is-active`, `is-resolved`, `has-suggestion`
 *     modifiers). Overlapping comments must nest, so sort by `from` then by
 *     descending length and let CM handle the layering; the CSS uses
 *     progressively darker underlines so a doubly-commented span reads as two.
 *   - One `Decoration.widget` at the *end* of each range holding the marker
 *     (see marker.ts) — side: 1 so it sits after the text, and `block: false`.
 *   - Skip comments with `range === null` (orphaned) entirely.
 *   - Decoration ranges must be added in sorted order or CM throws.
 */
function buildDecorations(
	comments: ResolvedComment[],
	activeId: string | null,
): DecorationSet {
	void comments;
	void activeId;
	return Decoration.none;
}

/**
 * TODO: click handling. A click on `.obelisk-marker` should reveal the comment
 * in the sidebar; a click anywhere inside `.obelisk-highlight` should select
 * it. Implement as an `EditorView.domEventHandlers({ mousedown })` that walks
 * up from `event.target` looking for `[data-obelisk-id]` and dispatches to the
 * app-level bus in main.ts.
 */
export function commentClickHandler(
	onSelect: (id: string) => void,
): Extension {
	void onSelect;
	return [];
}

export function obeliskEditorExtension(
	onSelect: (id: string) => void,
): Extension {
	return [commentField, commentClickHandler(onSelect)];
}
