import { Editor, MarkdownFileInfo, MarkdownView, Menu } from "obsidian";
import type ObeliskPlugin from "../main";
import { threadSuggestions } from "../suggestion/parse";

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
				const file = view.file;
				if (!file) return;

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

				if (!commentUnderCursor) return;
				const comment = commentUnderCursor;

				menu.addItem((item) =>
					item
						.setTitle("Show comment in sidebar")
						.setIcon("panel-right")
						.setSection("selection")
						.onClick(() => void plugin.revealComment(comment.id)),
				);

				// A thread can propose more than one thing; the menu offers the
				// first, and sends anyone who wants the others to the sidebar,
				// where each block has its own Apply button next to its diff.
				const proposals = threadSuggestions(comment);
				if (proposals.length > 0 && !comment.appliedAt) {
					menu.addItem((item) =>
						item
							.setTitle(
								proposals.length > 1
									? "Apply first suggestion"
									: "Apply suggestion",
							)
							.setIcon("check")
							.setSection("selection")
							.onClick(() =>
								void plugin.applySuggestion(
									file,
									comment.id,
									proposals[0],
								),
							),
					);
				}

				menu.addItem((item) =>
					item
						.setTitle(
							comment.resolved
								? "Reopen comment"
								: "Resolve comment",
						)
						.setIcon(comment.resolved ? "rotate-ccw" : "check-check")
						.setSection("selection")
						.onClick(() =>
							void plugin.toggleResolved(file, comment.id),
						),
				);

				menu.addItem((item) =>
					item
						.setTitle("Delete comment")
						.setIcon("trash")
						.setSection("danger")
						.setWarning(true)
						.onClick(() =>
							void plugin.deleteComment(file, comment.id),
						),
				);
			},
		),
	);
}
