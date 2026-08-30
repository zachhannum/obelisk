/**
 * Display-only formatting helpers.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * "just now" / "4h ago" / a date once it stops being recent.
 *
 * Returns the input unchanged if it isn't a parseable timestamp — frontmatter
 * is hand-editable, and a date we can't read is better shown than swallowed.
 */
export function relativeTime(iso: string, now = Date.now()): string {
	if (!iso) return "";
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return iso;

	const elapsed = now - then;
	if (elapsed < 0) return absoluteTime(iso);
	if (elapsed < MINUTE) return "just now";
	if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
	if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
	if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;
	return absoluteTime(iso);
}

/** Full timestamp, for the `title` attribute behind a relative one. */
export function absoluteTime(iso: string): string {
	const parsed = Date.parse(iso);
	if (Number.isNaN(parsed)) return iso;
	return new Date(parsed).toLocaleString();
}

/** Flatten a passage to a single line for previews. */
export function oneLine(text: string, max = 240): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}
