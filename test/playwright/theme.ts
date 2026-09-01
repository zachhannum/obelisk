import * as fs from "fs";
import * as path from "path";

import type { ColourScheme } from "./page-objects/ObsidianPageObject";

/**
 * The captures sit on the landing page, so Obsidian wears the site's own
 * tokens rather than a second copy of them: this file reads
 * `site/src/styles/tokens.css` and the font files under `site/node_modules`.
 * It is the only place the harness reaches into `site/`.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SITE = path.join(REPO_ROOT, "site");
const TOKENS = path.join(SITE, "src", "styles", "tokens.css");

/**
 * A runner with no system fonts falls back to DejaVu without saying so, and the
 * capture quietly stops matching the page it goes on. The faces travel with the
 * stylesheet instead.
 */
const FACES = [
	{
		family: "Inter Variable",
		weight: "100 900",
		file: "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
	},
	{
		family: "Instrument Serif",
		weight: "400",
		file: "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2",
	},
	{
		family: "JetBrains Mono Variable",
		weight: "100 800",
		file: "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
	},
];

function declarations(css: string, selector: string): Map<string, string> {
	const start = css.indexOf(selector);
	if (start < 0) {
		throw new Error(`${TOKENS} has no ${selector} block`);
	}
	const end = css.indexOf("}", start);
	const body = css.slice(start + selector.length, end);
	const out = new Map<string, string>();
	for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
		out.set(name, value.trim().replace(/\s+/g, " "));
	}
	return out;
}

function readTokens(scheme: ColourScheme): Map<string, string> {
	const css = fs.readFileSync(TOKENS, "utf8");
	const dark = declarations(css, ":root {");
	if (scheme === "dark") {
		return dark;
	}
	return new Map([...dark, ...declarations(css, ':root[data-theme="light"] {')]);
}

function fontFaces(): string {
	return FACES.map((face) => {
		const file = path.join(SITE, "node_modules", face.file);
		const data = fs.readFileSync(file).toString("base64");
		return [
			"@font-face {",
			`\tfont-family: "${face.family}";`,
			"\tfont-style: normal;",
			`\tfont-weight: ${face.weight};`,
			"\tfont-display: block;",
			`\tsrc: url(data:font/woff2;base64,${data}) format("woff2");`,
			"}",
		].join("\n");
	}).join("\n\n");
}

/** The plugin's washes are built with `rgba()`, so it wants channels, not hex. */
function channels(hex: string): string {
	const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) {
		throw new Error(`expected a six-digit hex colour, got ${hex}`);
	}
	const n = parseInt(m[1], 16);
	return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/**
 * Obsidian dressed in the site's palette. Both scheme classes are named so the
 * declarations outrank Obsidian's own `.theme-dark` / `.theme-light` rules.
 */
export function siteTheme(scheme: ColourScheme): string {
	const tokens = readTokens(scheme);
	const t = (name: string): string => {
		const value = tokens.get(name);
		if (value === undefined) {
			throw new Error(`${TOKENS} has no ${name}`);
		}
		return value;
	};

	return `${fontFaces()}

body.theme-dark, body.theme-light {
	--font-text-theme: ${t("--ob-sans")};
	--font-interface-theme: ${t("--ob-sans")};
	--font-monospace-theme: ${t("--ob-mono")};
	--font-text: ${t("--ob-sans")};
	--font-interface: ${t("--ob-sans")};
	--font-monospace: ${t("--ob-mono")};

	--background-primary: ${t("--ob-ink-2")};
	--background-primary-alt: ${t("--ob-raise")};
	--background-secondary: ${t("--ob-ink")};
	--background-secondary-alt: ${t("--ob-raise-2")};
	--background-modifier-border: ${t("--ob-line")};
	--background-modifier-border-hover: ${t("--ob-line")};
	--background-modifier-border-focus: ${t("--ob-amber")};
	--background-modifier-hover: ${t("--ob-raise-2")};
	--background-modifier-active-hover: ${t("--ob-amber-wash")};
	--background-modifier-form-field: ${t("--ob-raise")};
	--background-modifier-error: ${t("--ob-red-wash")};
	--background-modifier-error-hover: ${t("--ob-red-wash")};
	--background-modifier-success: ${t("--ob-green-wash")};
	--divider-color: ${t("--ob-line-soft")};

	--text-normal: ${t("--ob-text")};
	--text-muted: ${t("--ob-text-2")};
	--text-faint: ${t("--ob-text-3")};
	--text-accent: ${t("--ob-amber")};
	--text-accent-hover: ${t("--ob-amber-dim")};
	--text-error: ${t("--ob-red")};
	--text-success: ${t("--ob-green")};
	--text-on-accent: ${t("--ob-ink")};
	--text-selection: ${t("--ob-amber-wash")};
	--text-highlight-bg: ${t("--ob-amber-wash")};

	--color-accent: ${t("--ob-amber")};
	--color-accent-1: ${t("--ob-amber")};
	--color-accent-2: ${t("--ob-amber-dim")};
	--interactive-accent: ${t("--ob-amber")};
	--interactive-accent-hover: ${t("--ob-amber-dim")};
	--interactive-normal: ${t("--ob-raise")};
	--interactive-hover: ${t("--ob-raise-2")};

	--color-yellow-rgb: ${channels(t("--ob-amber"))};
	--color-green-rgb: ${channels(t("--ob-green"))};
	--color-red-rgb: ${channels(t("--ob-red"))};
	--color-green: ${t("--ob-green")};
	--color-red: ${t("--ob-red")};
	--color-purple: ${t("--ob-violet")};

	--titlebar-background: ${t("--ob-ink")};
	--titlebar-background-focused: ${t("--ob-ink")};
	--tab-container-background: ${t("--ob-ink")};
	--ribbon-background: ${t("--ob-ink")};
	--scrollbar-thumb-bg: ${t("--ob-line")};
	--scrollbar-active-thumb-bg: ${t("--ob-line")};
}

/* Obsidian's destructive buttons are white on solid red, which shouts at the
   top of a comment card. On a wash they need the ink back. */
button.mod-warning {
	box-shadow: none;
	color: ${t("--ob-red")};
}

/* Instrument Serif ships one weight, and Obsidian's heading weight would ask
   the renderer to fake the rest. Obsidian sets the title from a longer
   selector, so this one has to shout. */
.inline-title,
.markdown-rendered h1,
.markdown-rendered h2,
.cm-header-1,
.cm-header-2 {
	font-family: ${t("--ob-display")} !important;
	font-weight: 400 !important;
	letter-spacing: 0.01em;
}
`;
}
