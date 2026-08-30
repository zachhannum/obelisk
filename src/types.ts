/**
 * Core data model for Obelisk.
 *
 * Everything in this file is what ends up serialized into a note's YAML
 * frontmatter under the `obelisk` key. Keep it boring and forward-compatible:
 * unknown keys are preserved on round-trip (see store/frontmatter.ts), so new
 * fields can be added without orphaning comments written by older versions.
 */

/** Bumped when the on-disk shape changes in a way that needs migration. */
export const SCHEMA_VERSION = 1;

/**
 * A position inside the *body* of the note.
 *
 * IMPORTANT: `line` is 0-indexed and counted from the first line *after* the
 * closing `---` of the frontmatter block. Storing body-relative lines means
 * adding or editing a comment (which grows the frontmatter) does not
 * invalidate every anchor in the file. See docs/DESIGN.md § Anchoring.
 */
export interface BodyPos {
	/** 0-indexed line, relative to the start of the body. */
	line: number;
	/** 0-indexed UTF-16 code unit offset within the line. */
	col: number;
}

/**
 * Where a comment attaches. We deliberately store redundant information:
 * the line/col range is fast and exact for an unedited file, and the
 * quote/prefix/suffix triple lets us re-find the passage after the text has
 * drifted (the same trick the W3C Annotation "TextQuoteSelector" uses).
 */
export interface Anchor {
	from: BodyPos;
	to: BodyPos;
	/** The exact text that was selected when the comment was created. */
	quote: string;
	/** Up to ANCHOR_CONTEXT_CHARS of text immediately before `quote`. */
	prefix?: string;
	/** Up to ANCHOR_CONTEXT_CHARS of text immediately after `quote`. */
	suffix?: string;
}

/** How confident we are that a comment is still pointing at the right text. */
export type AnchorState =
	/** line/col matched `quote` exactly. */
	| "exact"
	/** line/col was stale; relocated via quote + prefix/suffix search. */
	| "relocated"
	/** The quoted text is gone. Comment is shown in the sidebar but not highlighted. */
	| "orphaned";

/**
 * A GitHub-style suggested edit attached to a comment.
 *
 * `replacement` replaces exactly the anchored range. A multi-line suggestion
 * is stored as a plain string with `\n` separators; the YAML serializer will
 * emit it as a block scalar so it stays readable in the frontmatter.
 */
export interface Suggestion {
	replacement: string;
	/** Set once applied so the UI can show it as accepted rather than pending. */
	appliedAt?: string;
}

export interface Reply {
	id: string;
	author?: string;
	created: string;
	body: string;
}

export interface Comment {
	/** Stable, URL-safe, unique within the note. Never reused. */
	id: string;
	author?: string;
	/** ISO-8601. */
	created: string;
	modified?: string;
	resolved?: boolean;
	/** Markdown. Rendered with MarkdownRenderer in the sidebar. */
	body: string;
	anchor: Anchor;
	suggestion?: Suggestion;
	replies?: Reply[];
	/** Free-form labels, surfaced as filter chips in the sidebar. */
	tags?: string[];
}

/**
 * A comment plus everything derived at runtime. Never serialized.
 */
export interface ResolvedComment extends Comment {
	/** Absolute character offsets into the full editor document. */
	range: { from: number; to: number } | null;
	state: AnchorState;
}

export interface ObeliskSettings {
	/** Written into `author` on new comments. Empty = omit the field. */
	authorName: string;
	/** Show resolved comments in the sidebar. */
	showResolved: boolean;
	/** Highlight commented text in Reading view as well as Live Preview. */
	highlightInReadingView: boolean;
	/** Open the sidebar automatically when a note containing comments is opened. */
	autoOpenSidebar: boolean;
	/** Attempt quote-based relocation when line/col no longer matches. */
	enableReanchoring: boolean;
	/** Delete a comment's frontmatter entry when its suggestion is applied. */
	removeCommentOnApply: boolean;
}

export const DEFAULT_SETTINGS: ObeliskSettings = {
	authorName: "",
	showResolved: false,
	highlightInReadingView: true,
	autoOpenSidebar: false,
	enableReanchoring: true,
	removeCommentOnApply: false,
};

/** The frontmatter key everything lives under. */
export const FRONTMATTER_KEY = "obelisk";

/** How much surrounding text to keep for re-anchoring. */
export const ANCHOR_CONTEXT_CHARS = 32;

export const VIEW_TYPE_OBELISK = "obelisk-sidebar";
