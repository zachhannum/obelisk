/**
 * Minimal diffing, used only to render a suggestion nicely in the sidebar.
 *
 * Deliberately not a dependency: the inputs here are a sentence or a paragraph,
 * not a file, so a simple LCS over words is plenty and keeps the bundle small.
 */

export type DiffOp = { type: "equal" | "insert" | "delete"; text: string };

/**
 * Above this many tokens on either side we stop diffing and show the whole
 * block as a replacement. The LCS table is O(n·m) cells; a suggestion long
 * enough to hit this is not something anyone reads word-by-word anyway.
 */
const MAX_TOKENS = 1000;

/**
 * Tokens are "word plus the whitespace that follows it", with a separate case
 * for leading whitespace, so concatenating the tokens reproduces the input
 * exactly — the diff can then be rendered by pasting spans together.
 */
const TOKEN = /\S+\s*|\s+/g;

export function diffWords(before: string, after: string): DiffOp[] {
	if (before === after) return [{ type: "equal", text: before }];
	if (!before) return [{ type: "insert", text: after }];
	if (!after) return [{ type: "delete", text: before }];

	const a = tokenize(before);
	const b = tokenize(after);

	if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
		return [
			{ type: "delete", text: before },
			{ type: "insert", text: after },
		];
	}

	return collapse(backtrack(a, b, lcsTable(a, b)));
}

function tokenize(text: string): string[] {
	return text.match(TOKEN) ?? [];
}

/**
 * Classic LCS length table. `table[i * (b.length + 1) + j]` is the length of
 * the longest common subsequence of `a[i..]` and `b[j..]`.
 */
function lcsTable(a: string[], b: string[]): Uint32Array {
	const width = b.length + 1;
	const table = new Uint32Array((a.length + 1) * width);

	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			table[i * width + j] =
				a[i] === b[j]
					? table[(i + 1) * width + j + 1] + 1
					: Math.max(
							table[(i + 1) * width + j],
							table[i * width + j + 1],
						);
		}
	}

	return table;
}

function backtrack(a: string[], b: string[], table: Uint32Array): DiffOp[] {
	const width = b.length + 1;
	const ops: DiffOp[] = [];
	let i = 0;
	let j = 0;

	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			ops.push({ type: "equal", text: a[i] });
			i++;
			j++;
		} else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
			ops.push({ type: "delete", text: a[i] });
			i++;
		} else {
			ops.push({ type: "insert", text: b[j] });
			j++;
		}
	}

	for (; i < a.length; i++) ops.push({ type: "delete", text: a[i] });
	for (; j < b.length; j++) ops.push({ type: "insert", text: b[j] });

	return ops;
}

/** Merge neighbouring ops of the same type so the DOM stays small. */
function collapse(ops: DiffOp[]): DiffOp[] {
	const out: DiffOp[] = [];
	for (const op of ops) {
		const last = out[out.length - 1];
		if (last && last.type === op.type) last.text += op.text;
		else out.push({ ...op });
	}
	return out;
}

/**
 * Render into two rows — what the text says now and what it would say — with
 * the changed words picked out inside each. Rows with no changes at all are
 * omitted, so a pure insertion shows only the "after" row.
 */
export function renderDiff(container: HTMLElement, ops: DiffOp[]): void {
	const hasDeletes = ops.some((op) => op.type === "delete");
	const hasInserts = ops.some((op) => op.type === "insert");

	if (hasDeletes || !hasInserts) {
		const row = container.createDiv({ cls: "obelisk-diff-del" });
		for (const op of ops) {
			if (op.type === "insert") continue;
			row.createSpan({
				cls:
					op.type === "delete"
						? "obelisk-diff-word-del"
						: "obelisk-diff-equal",
				text: op.text,
			});
		}
	}

	if (hasInserts || !hasDeletes) {
		const row = container.createDiv({ cls: "obelisk-diff-add" });
		for (const op of ops) {
			if (op.type === "delete") continue;
			row.createSpan({
				cls:
					op.type === "insert"
						? "obelisk-diff-word-add"
						: "obelisk-diff-equal",
				text: op.text,
			});
		}
	}
}
