/**
 * Minimal diffing, used only to render a suggestion nicely in the sidebar.
 *
 * Deliberately not a dependency: the inputs here are a sentence or a paragraph,
 * not a file, so a simple LCS over words is plenty and keeps the bundle small.
 */

export type DiffOp = { type: "equal" | "insert" | "delete"; text: string };

/**
 * TODO: implement word-level LCS.
 *
 *   - Tokenize on word boundaries but keep whitespace attached, so
 *     reassembling the tokens reproduces the input exactly.
 *   - Standard LCS DP table; inputs are short enough that O(n·m) is fine, but
 *     cap it (say 2000 tokens a side) and fall back to a whole-block
 *     delete+insert past that.
 *   - Collapse adjacent ops of the same type before returning.
 */
export function diffWords(before: string, after: string): DiffOp[] {
	if (before === after) return [{ type: "equal", text: before }];
	return [
		{ type: "delete", text: before },
		{ type: "insert", text: after },
	];
}

/**
 * TODO: render DiffOps into a container with `.obelisk-diff-add` /
 * `.obelisk-diff-del` spans.
 */
export function renderDiff(container: HTMLElement, ops: DiffOp[]): void {
	for (const op of ops) {
		container.createSpan({
			cls: `obelisk-diff-${op.type}`,
			text: op.text,
		});
	}
}
