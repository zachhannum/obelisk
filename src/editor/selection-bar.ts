import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { MarkdownView, editorInfoField, setIcon } from "obsidian";

export type SelectionAction = (
	view: MarkdownView,
	opts: { withSuggestion: boolean },
) => void;

/**
 * "Comment" and "Suggest" buttons pinned to the bottom of the editor while
 * text is selected, for mobile.
 *
 * A long press on mobile opens the system's own selection menu, which has no
 * room for a plugin, so `editor-menu` never fires there. The bar sits at the
 * bottom edge rather than beside the selection, where that menu and the
 * selection handles already are.
 *
 * Tapping a button hides the bar until the selection changes, so it does not
 * linger over the composer. `enabled` is read on every selection change, so
 * the setting applies without a reload.
 */
export function selectionBar(
	enabled: () => boolean,
	onAction: SelectionAction,
): Extension {
	return ViewPlugin.fromClass(
		class {
			private bar: HTMLElement;
			private dismissed: { from: number; to: number } | null = null;

			constructor(private view: EditorView) {
				this.bar = view.dom.createDiv({ cls: "obelisk-selection-bar" });
				this.button("message-square", "Comment", false);
				this.button("replace", "Suggest", true);
				this.sync();
			}

			update(update: ViewUpdate): void {
				if (update.selectionSet || update.docChanged) {
					this.dismissed = null;
					this.sync();
				}
			}

			destroy(): void {
				this.bar.remove();
			}

			private button(
				icon: string,
				label: string,
				withSuggestion: boolean,
			): void {
				const el = this.bar.createEl("button", {
					cls: "obelisk-selection-bar-button",
				});
				setIcon(el.createSpan(), icon);
				el.createSpan({ text: label });
				// Keeps focus, and with it the keyboard, in the editor.
				el.addEventListener("mousedown", (e) => e.preventDefault());
				el.addEventListener("click", () => {
					const info = this.view.state.field(editorInfoField, false);
					if (!(info instanceof MarkdownView)) return;
					const { from, to } = this.view.state.selection.main;
					this.dismissed = { from, to };
					this.sync();
					onAction(info, { withSuggestion });
				});
			}

			private sync(): void {
				const { from, to, empty } = this.view.state.selection.main;
				const hidden =
					empty ||
					!enabled() ||
					(this.dismissed?.from === from && this.dismissed.to === to);
				this.bar.toggleClass("is-hidden", hidden);
			}
		},
	);
}
