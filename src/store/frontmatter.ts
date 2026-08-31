import { App, TFile } from "obsidian";
import { normalize, serialize } from "../core/schema";
import {
	Comment,
	FRONTMATTER_KEY,
	SCHEMA_KEY,
	SCHEMA_VERSION,
} from "../core/types";

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
		return normalize(raw, file.path, fm?.[SCHEMA_KEY]);
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
			const current = normalize(
				fm[FRONTMATTER_KEY],
				file.path,
				fm[SCHEMA_KEY],
			);
			const next = mutate(current) ?? current;
			if (next.length === 0) {
				delete fm[FRONTMATTER_KEY];
				delete fm[SCHEMA_KEY];
			} else {
				fm[FRONTMATTER_KEY] = next.map(serialize);
				fm[SCHEMA_KEY] = SCHEMA_VERSION;
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

	/** Merge `patch` into one comment, stamping `modified`. */
	async patch(
		file: TFile,
		id: string,
		patch: Partial<Comment>,
	): Promise<void> {
		await this.update(file, (comments) => {
			const target = comments.find((c) => c.id === id);
			if (!target) return;
			Object.assign(target, patch);
			target.modified = new Date().toISOString();
		});
	}
}

