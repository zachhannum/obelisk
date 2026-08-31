/**
 * The plugin's view of the model: everything in `core/types.ts`, plus the
 * settings and view ids that only mean something inside Obsidian.
 *
 * Plugin code imports from here and does not need to know which half of the
 * split a name came from.
 */
export * from "./core/types";

export interface ObeliskSettings {
	/** Written into `author` on new comments. Empty = omit the field. */
	authorName: string;
	/** Open the sidebar automatically when a note containing comments is opened. */
	autoOpenSidebar: boolean;
	/** Delete a comment's frontmatter entry when its suggestion is applied. */
	removeCommentOnApply: boolean;
}

export const DEFAULT_SETTINGS: ObeliskSettings = {
	authorName: "",
	autoOpenSidebar: false,
	removeCommentOnApply: false,
};

export const VIEW_TYPE_OBELISK = "obelisk-sidebar";
