// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

/**
 * The custom domain is served from the root, so there is no base path. It is
 * also why `public/CNAME` exists: GitHub Pages drops the domain on every
 * deploy without it.
 */
export default defineConfig({
	site: "https://obelisk.typeworks.dev",
	trailingSlash: "always",
	integrations: [
		starlight({
			title: "Obelisk",
			description:
				"Inline comments and GitHub-style suggested edits for Obsidian, stored in note frontmatter.",
			favicon: "/favicon.svg",
			logo: { src: "./src/assets/obelus.svg", replacesTitle: false },
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/zachhannum/obelisk",
				},
			],
			components: {
				Head: "./src/components/Head.astro",
				Footer: "./src/components/Footer.astro",
			},
			customCss: [
				"@fontsource-variable/bricolage-grotesque",
				"@fontsource-variable/space-grotesk",
				"@fontsource-variable/jetbrains-mono",
				"./src/styles/tokens.css",
				"./src/styles/starlight.css",
			],
			expressiveCode: {
				themes: ["gruvbox-dark-medium", "gruvbox-light-medium"],
				styleOverrides: {
					borderRadius: "0.5rem",
					borderColor: "var(--ob-line)",
					codeFontFamily: "var(--ob-mono)",
					codeFontSize: "0.8125rem",
					frames: {
						editorTabBarBackground: "var(--ob-raise)",
						terminalTitlebarBackground: "var(--ob-raise)",
					},
				},
			},
			editLink: {
				baseUrl: "https://github.com/zachhannum/obelisk/edit/main/site/",
			},
			lastUpdated: false,
			sidebar: [
				{
					label: "Start here",
					items: [
						{ label: "What Obelisk is", slug: "start/what-it-is" },
						{ label: "Install", slug: "start/install" },
						{ label: "Your first comment", slug: "start/first-comment" },
					],
				},
				{
					label: "Using it",
					items: [
						{ label: "Comments and replies", slug: "using/comments" },
						{ label: "Suggested edits", slug: "using/suggestions" },
						{ label: "Anchoring", slug: "using/anchoring" },
						{ label: "The sidebar", slug: "using/sidebar" },
					],
				},
				{
					label: "Agents",
					items: [
						{ label: "Overview", slug: "agents/overview" },
						{ label: "The CLI", slug: "agents/cli" },
						{ label: "The MCP server", slug: "agents/mcp" },
						{ label: "Agents without MCP", slug: "agents/fragment" },
					],
				},
				{
					label: "Reference",
					items: [
						{ label: "Data format", slug: "reference/format" },
						{ label: "Refusals", slug: "reference/refusals" },
						{ label: "Design notes", slug: "reference/design" },
					],
				},
			],
		}),
	],
});
