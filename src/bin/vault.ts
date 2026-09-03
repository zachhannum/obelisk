import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";

/**
 * The vault is found, never configured.
 *
 * Both bins are spawned with a working directory they did not choose: an
 * agent's session directory, or wherever a person's shell happened to be. An
 * `.obsidian/` directory marks a vault root, so walking up from the working
 * directory finds the vault from a subdirectory of the note tree as well as
 * from the root. Nothing to pass, and no path in a config file to fall out of
 * step when the vault moves.
 *
 * Node only, which is why this sits beside the bins rather than in `core/`:
 * the plugin bundles `core/` and cannot import `node:fs`.
 */

/** The vault containing `from`, or nothing if it is not inside one. */
export function findVault(from: string = process.cwd()): string | undefined {
	let dir = resolvePath(from);
	for (;;) {
		if (isDirectory(join(dir, ".obsidian"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

/**
 * Where a note argument points.
 *
 * An absolute path is taken as given. A relative one is tried against the
 * working directory and then against the vault root, so `three.md` from inside
 * `chapters/` and `chapters/three.md` from the vault root reach the same file.
 * Neither hitting leaves the path the caller typed, so a refusal prints what
 * they wrote rather than something they have never seen.
 *
 * `.md` is added when it was left off: an agent told a note's title should not
 * have to know how it is stored.
 */
export function notePath(arg: string): string {
	const named = arg.endsWith(".md") ? arg : `${arg}.md`;
	if (isAbsolute(named)) return resolvePath(named);

	const fromCwd = resolvePath(named);
	if (existsSync(fromCwd)) return fromCwd;

	const vault = findVault();
	if (!vault) return fromCwd;

	const fromVault = resolvePath(join(vault, named));
	return existsSync(fromVault) ? fromVault : fromCwd;
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
