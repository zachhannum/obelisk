/**
 * Core data model for Obelisk.
 *
 * Everything in this file is what ends up serialized into a note's YAML
 * frontmatter under the `obelisk` key. Keep it boring and forward-compatible:
 * unknown keys are preserved on round-trip (see store/frontmatter.ts), so new
 * fields can be added without orphaning comments written by older versions.
 */

/** Bumped when the on-disk shape changes in a way that needs migration. */
export const SCHEMA_VERSION = 2;

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
 * Where a comment attaches.
 *
 * `quote` is the anchor: resolution finds the comment by searching the body
 * for this exact text, and it is never rewritten once the comment is created.
 * `from`/`to` record where the passage was at the time, which is what the
 * sidebar sorts by and what breaks the tie when a quote appears more than once
 * in the note. They are a hint, not a position — nothing keeps them current as
 * the note is edited. See docs/DESIGN.md § Anchoring.
 */
export interface Anchor {
	from: BodyPos;
	to: BodyPos;
	/** The exact text that was selected when the comment was created. */
	quote: string;
}

/** Whether a comment still points at text that exists. */
export type AnchorState =
	/** `quote` was found in the body; the comment is highlighted there. */
	| "attached"
	/**
	 * `quote` is nowhere in the body — the passage was edited or deleted. The
	 * comment is listed in the sidebar, flagged, and decorates nothing. Derived
	 * fresh on every resolve, so restoring the text reattaches it.
	 */
	| "detached";

export interface Reply {
	id: string;
	author?: string;
	created: string;
	/** Markdown, same as a comment body — suggestion blocks and all. */
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
	/**
	 * Markdown, rendered with MarkdownRenderer in the sidebar.
	 *
	 * A ```suggestion fenced block inside it is a proposed replacement for the
	 * anchored text, GitHub-style — there is no separate suggestion field. See
	 * `suggestion/parse.ts`.
	 */
	body: string;
	anchor: Anchor;
	/**
	 * When a suggestion from this thread was applied to the note. Set on the
	 * comment rather than on the block, because applying re-anchors the whole
	 * comment onto its replacement: every other proposal in the thread is
	 * measured against text that no longer exists.
	 */
	appliedAt?: string;
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
	/** Delete a comment's frontmatter entry when its suggestion is applied. */
	removeCommentOnApply: boolean;
}

export const DEFAULT_SETTINGS: ObeliskSettings = {
	authorName: "",
	showResolved: false,
	highlightInReadingView: true,
	autoOpenSidebar: false,
	removeCommentOnApply: false,
};

/** The frontmatter key everything lives under. */
export const FRONTMATTER_KEY = "obelisk";

export const VIEW_TYPE_OBELISK = "obelisk-sidebar";
