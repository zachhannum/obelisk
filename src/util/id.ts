/**
 * Short, collision-resistant, URL-safe ids.
 *
 * These end up in YAML and in DOM ids, so: no leading digits (keeps them valid
 * CSS selectors), no characters YAML would want to quote.
 */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newCommentId(existing: ReadonlySet<string> = new Set()): string {
	for (let attempt = 0; attempt < 100; attempt++) {
		const id = generate(8);
		if (!existing.has(id)) return id;
	}
	// Astronomically unlikely; fall back to something guaranteed unique.
	return generate(8) + "-" + Date.now().toString(36);
}

function generate(length: number): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let out = "c"; // leading letter, so the id is a valid CSS identifier
	for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
	return out;
}
