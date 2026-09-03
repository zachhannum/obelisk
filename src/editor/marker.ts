import { EditorView, WidgetType } from "@codemirror/view";

/**
 * The little † that sits at the end of a commented passage. Clicking it opens
 * (and focuses) that comment in the sidebar — requirement 5.
 *
 * Kept as a WidgetType rather than a CSS `::after` so it can carry the comment
 * id, be individually focusable, and show a hover preview later.
 */
export class MarkerWidget extends WidgetType {
	constructor(
		readonly commentId: string,
		readonly count: number,
		readonly hasSuggestion: boolean,
	) {
		super();
	}

	eq(other: MarkerWidget): boolean {
		return (
			other.commentId === this.commentId &&
			other.count === this.count &&
			other.hasSuggestion === this.hasSuggestion
		);
	}

	toDOM(_view: EditorView): HTMLElement {
		const el = createSpan({ cls: "obelisk-marker" });
		el.dataset.obeliskId = this.commentId;
		el.setAttribute("role", "button");
		el.setAttribute("tabindex", "0");
		el.setAttribute(
			"aria-label",
			this.count > 1 ? `Open ${this.count} comments` : "Open comment",
		);

		// An obelus for a comment, a double obelus when there is something to
		// apply — the same distinction the marks had in the margin.
		const glyph = el.createSpan({ cls: "obelisk-marker-glyph" });
		glyph.setText(this.hasSuggestion ? "‡" : "†");

		if (this.count > 1) {
			el.createSpan({
				cls: "obelisk-marker-count",
				text: String(this.count),
			});
		}

		return el;
	}

	ignoreEvent(): boolean {
		// Let mousedown through to our own handler.
		return false;
	}
}
