import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";

const banner = `/*
Obelisk — bundled by esbuild. Edit files under src/, not this file.
*/`;

const prod = process.argv[2] === "production";

/**
 * The plugin. Everything Obsidian ships is external, since the app provides it
 * at runtime.
 */
const context = await esbuild.context({
	banner: { js: banner },
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtinModules,
	],
	format: "cjs",
	target: "es2020",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
});

/**
 * The two Node bins, from the same `core/`.
 *
 * Bundled rather than published as loose files with dependencies: a vault tool
 * that an agent invokes through `npx` should be one file that starts, and the
 * plugin half has no business shipping `yaml` or the MCP SDK. They are built
 * only for a production build — `npm run dev` is the plugin's watch loop, and
 * nothing about the CLI benefits from being in it.
 */
async function buildBins() {
	await esbuild.build({
		banner: {
			// A dependency bundled from its CommonJS build still reaches for
			// `require`, which an ESM bundle does not have. This is the
			// documented way to give it one.
			js: [
				"#!/usr/bin/env node",
				banner,
				'import { createRequire as __createRequire } from "node:module";',
				"const require = __createRequire(import.meta.url);",
			].join("\n"),
		},
		entryPoints: { cli: "src/cli/main.ts", mcp: "src/mcp/main.ts" },
		bundle: true,
		platform: "node",
		target: "node18",
		format: "esm",
		outdir: "dist",
		outExtension: { ".js": ".mjs" },
		external: builtinModules
			.map((name) => `node:${name}`)
			.concat(builtinModules),
		logLevel: "info",
		treeShaking: true,
		minify: false,
	});
}

if (prod) {
	await context.rebuild();
	await buildBins();
	process.exit(0);
} else {
	await context.watch();
}
