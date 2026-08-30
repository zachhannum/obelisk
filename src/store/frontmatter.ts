import { App, TFile } from "obsidian";
import { Comment, FRONTMATTER_KEY, SCHEMA_VERSION } from "../types";

/**
 * The single place that reads and writes comments to disk.
 *
 * All mutations go through `app.fileManager.processFrontMatter`, which is the
 * only sanctioned way to edit frontmatter: it serializes concurrent writes,
 * preserves the rest of the YAML, and does not disturb the body (so live
 * editor state and anchors survive a write).
 */
export class CommentStore {
	constructor(private app: App) {}

	/**
	 * Read the comments for a file out of the metadata cache. Cheap — safe to
	 * call on every editor change. Returns [] for a file with no comments.
	 */
	read(file: TFile): Comment[] {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const raw = fm?.[FRONTMATTER_KEY];
		if (!raw) return [];

		// TODO: validate/normalize. Hand-edited YAML will show up here, so a
		// malformed entry must be dropped with a console warning rather than
		// throwing and taking the whole sidebar down with it.
		// TODO: migrate entries written under an older SCHEMA_VERSION.
		return normalize(raw);
	}

	/**
	 * Read-modify-write the comment array for a file.
	 *
	 * The mutator receives a mutable copy and either mutates it in place or
	 * returns a replacement.
	 */
	async update(
		file: TFile,
		mutate: (comments: Comment[]) => Comment[] | void,
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const current = normalize(fm[FRONTMATTER_KEY]);
			const next = mutate(current) ?? current;
			if (next.length === 0) {
				delete fm[FRONTMATTER_KEY];
				delete fm[FRONTMATTER_KEY + "_schema"];
			} else {
				fm[FRONTMATTER_KEY] = next.map(serialize);
				fm[FRONTMATTER_KEY + "_schema"] = SCHEMA_VERSION;
			}
		});
	}

	async add(file: TFile, comment: Comment): Promise<void> {
		await this.update(file, (comments) => {
			comments.push(comment);
		});
	}

	async remove(file: TFile, id: string): Promise<void> {
		await this.update(file, (comments) =>
			comments.filter((c) => c.id !== id),
		);
	}

	async patch(
		file: TFile,
		id: string,
		patch: Partial<Comment>,
	): Promise<void> {
		await this.update(file, (comments) => {
			const target = comments.find((c) => c.id === id);
			if (!target) return;
			Object.assign(target, patch, {
				modified: new Date().toISOString(),
			});
		});
	}

	/**
	 * Character offset in the raw file at which the body begins — i.e. just
	 * past the closing `---` of the frontmatter block. Anchors are stored
	 * relative to this point, so callers converting between stored positions
	 * and editor positions need it.
	 *
	 * Returns 0 for a file with no frontmatter.
	 */
	bodyOffset(file: TFile): { line: number; ch: number } {
		const pos = this.app.metadataCache.getFileCache(file)
			?.frontmatterPosition;
		if (!pos) return { line: 0, ch: 0 };
		// `pos.end.line` is the line of the closing `---`; the body starts on
		// the following line.
		return { line: pos.end.line + 1, ch: 0 };
	}
}

/**
 * Coerce whatever came out of YAML into a Comment[].
 *
 * TODO: this is the trust boundary for hand-edited frontmatter. Everything
 * below should be replaced with per-field validation that drops bad entries
 * individually instead of assuming the shape is right.
 */
function normalize(raw: unknown): Comment[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((c): c is Comment => !!c && typeof c === "object");
}

/**
 * Convert a Comment to its on-disk form.
 *
 * TODO: strip runtime-only fields, drop `undefined`/empty values so the
 * frontmatter stays tidy, and round-trip any unknown keys that were present
 * when the comment was read (forward compatibility).
 */
function serialize(comment: Comment): Record<string, unknown> {
	return { ...comment } as Record<string, unknown>;
}
