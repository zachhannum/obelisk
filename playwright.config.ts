import { defineConfig } from "@playwright/test";

/**
 * One Obsidian, driven in order. Nothing here launches a browser of its own, so
 * `playwright install` is not part of the setup.
 */
export default defineConfig({
	testDir: "test/playwright",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 10 * 60 * 1000,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI
		? [["list"], ["html", { open: "never" }]]
		: [["list"]],
});
