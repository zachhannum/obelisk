import { Editor, MarkdownFileInfo, MarkdownView, Menu } from "obsidian";
import type ObeliskPlugin from "../main";

/**
 * Requirement 6: right-clicking a selection offers "Add comment" and
 * "Suggest an edit".
 *
 * Registered against the `editor-menu` workspace event, which fires for both
 * the context menu and the mobile selection toolbar, so this covers both
 * platforms with one code path.
 */
export function registerContextMenu(plugin: ObeliskPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on(
			"editor-menu",
			(menu: Menu, editor: Editor, info: MarkdownFileInfo) => {
				// `editor-menu` also fires for embedded editors, which have no
				// MarkdownView. Those have no sidebar to reveal into, so skip them.
				if (!(info instanceof MarkdownView)) return;
				const view = info;

				const selection = editor.getSelection();
				const commentUnderCursor = plugin.commentAtCursor(editor, view);

				if (selection.length > 0) {
					menu.addItem((item) =>
						item
							.setTitle("Add comment")
							.setIcon("message-square")
							.setSection("selection")
							.onClick(() =>
								plugin.startComment(editor, view, {
									withSuggestion: false,
								}),
							),
					);
					menu.addItem((item) =>
						item
							.setTitle("Suggest an edit")
							.setIcon("replace")
							.setSection("selection")
							.onClick(() =>
								plugin.startComment(editor, view, {
									withSuggestion: true,
								}),
							),
					);
				}

				if (commentUnderCursor) {
					menu.addItem((item) =>
						item
							.setTitle("Show comment in sidebar")
							.setIcon("panel-right")
							.setSection("selection")
							.onClick(() =>
								plugin.revealComment(commentUnderCursor.id),
							),
					);
					// TODO: "Apply suggestion" / "Resolve" / "Delete comment"
					// entries, shown conditionally on the comment's state.
				}
			},
		),
	);
}
