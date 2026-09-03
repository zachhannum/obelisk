import { cwd } from "node:process";
import { globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

/**
 * A local copy of the config the community directory's scanner lints with.
 *
 * The scanner passes its own `--config`, so this file is invisible to it. It
 * exists to put the same warnings in front of a pull request that the listing's
 * scorecard would show after a release, where the only way to correct one is to
 * publish another version.
 *
 * Everything above the last block is `buildScannerEslintConfig` from
 * `obsidianmd/obsidian-workflows`, with the three dependency versions pinned in
 * `package.json` to the ones it installs. Keeping the shape makes the next diff
 * against it readable.
 */

const IGNORES = [
	"node_modules",
	"dist",
	"build",
	"pkg",
	"test-vault",
	".obsidian",
	"**/.obsidian/**",
	"esbuild.config.mjs",
	"version-bump.mjs",
	"**/*.test.*",
	"**/*.tests.*",
	"**/*.spec.*",
	"**/*.specs.*",
	"**/test/**",
	"**/tests/**",
	"**/__tests__/**",
	"**/mocks/**",
	"**/__mocks__/**",
	"**/*.cjs",
	"**/*.mjs",
	"**/*.cts",
	"**/*.mts",
	"**/vite*",
	"**/scripts/**",
	"**/docs/**",
	"**/i18n/**",
	"**/i18next/**",
	"**/locale/**",
	"**/locales/**",
	"**/translations/**",
	"**/l10n/**",
	".pnpm-store",
	"**/*.spec.ts",
	"**/testUtils**",
	"automation/**",
	"e2e-tests/**",
];

function toWarns(config) {
	if (!config) return config;
	if (!Array.isArray(config) && typeof config[Symbol.iterator] === "function") {
		return [...config].map(toWarns);
	}
	if (Array.isArray(config)) return config.map(toWarns);
	const result = { ...config };
	if (result.extends) result.extends = toWarns(result.extends);
	if (result.rules) {
		result.rules = Object.fromEntries(
			Object.entries(result.rules).map(([key, value]) => {
				if (key.startsWith("eslint-comments/")) return [key, value];
				if (value === "error" || value === 2) return [key, "warn"];
				if (Array.isArray(value) && (value[0] === "error" || value[0] === 2)) {
					return [key, ["warn", ...value.slice(1)]];
				}
				return [key, value];
			}),
		);
	}
	return result;
}

export default [
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.js",
						"eslint.config.mjs",
						"eslint.config.mts",
					],
				},
				tsconfigRootDir: cwd(),
				extraFileExtensions: [".json"],
			},
		},
	},
	...toWarns(obsidianmd.configs.recommended),
	{
		linterOptions: {
			noInlineConfig: false,
			reportUnusedDisableDirectives: "off",
			reportUnusedInlineConfigs: "off",
		},
	},
	{
		files: ["**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}"],
		rules: {
			"no-eval": "error",
			"no-implied-eval": "error",
			"no-unsanitized/method": "error",
			"no-unsanitized/property": "error",
			"obsidianmd/regex-lookbehind": "error",
			"obsidianmd/no-forbidden-elements": "error",

			"no-undef": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
			"@typescript-eslint/no-base-to-string": "off",
			"import/no-unresolved": "off",

			"obsidianmd/validate-manifest": "off",
			"obsidianmd/validate-license": "off",

			"obsidianmd/commands/no-command-in-command-id": "off",
			"obsidianmd/commands/no-plugin-id-in-command-id": "off",
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
		rules: {
			"obsidianmd/ui/sentence-case": "off",
			"obsidianmd/ui/sentence-case-json": "off",
			"obsidianmd/ui/sentence-case-locale-module": "off",
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
		rules: {
			"eslint-comments/require-description": "error",
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
		plugins: {
			"@typescript-eslint": tseslint.plugin,
			obsidianmd: obsidianmd,
		},
		rules: {
			"@typescript-eslint/no-unsafe-member-access": "warn",
			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/no-unsafe-argument": "warn",
			"@typescript-eslint/no-unsafe-call": "warn",
			"@typescript-eslint/no-unsafe-return": "warn",

			"obsidianmd/commands/no-command-in-command-id": "warn",
			"obsidianmd/commands/no-plugin-id-in-command-id": "warn",

			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
			"obsidianmd/sample-names": "error",
			"obsidianmd/no-sample-code": "error",
			"obsidianmd/platform": "error",
			"obsidianmd/no-plugin-as-component": "error",
			"obsidianmd/detach-leaves": "error",
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/no-view-references-in-plugin": "error",
			"obsidianmd/no-unsupported-api": "error",
		},
	},
	globalIgnores(IGNORES),
	{
		ignores: [
			"eslint.config.scanner.mjs",
			"main.js",
			"styles.css",
			"manifest.json",
		],
	},

	/** The site's build output, which a fresh checkout does not have. */
	globalIgnores(["site/.astro/**", "site/dist/**"]),

	/**
	 * The two rules with nothing to answer them: both fire on the bins, which
	 * run under Node and are never bundled into the plugin, and neither can be
	 * turned off by a comment in the file. The scanner counts them, so the
	 * warnings on the listing never reach zero. Everything else has to.
	 */
	{
		files: ["src/bin/**", "src/cli/**", "src/mcp/**"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/hardcoded-config-path": "off",
		},
	},
];
