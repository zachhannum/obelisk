import * as fs from "fs/promises";
import * as path from "path";

import { expect, test } from "./obsidian-fixture";
import type { ColourScheme } from "./page-objects/ObsidianPageObject";
import { siteTheme } from "./theme";

/** Where the landing page imports its product shot from. */
const OUT_DIR = path.resolve(
	__dirname,
	"..",
	"..",
	"site",
	"src",
	"assets",
	"shots",
);

const NOTE = "Chapter 3.md";
const SIDEBAR_COMMAND = "obelisk:open-comments-sidebar";

/**
 * Obsidian desktop has no narrow layout: under about a thousand pixels it
 * squeezes rather than reflows, and the note pane ends up a letter wide. The
 * narrowest width only works because the file explorer is out of the way.
 */
const WIDTHS = [1440, 1100, 760];
const HEIGHT = 780;

const SCHEMES: ColourScheme[] = ["dark", "light"];

/** Desktop furniture the landing page has no use for, alike at every width. */
const CHROME = [
	".status-bar { display: none !important; }",
	".workspace-ribbon.mod-left { display: none !important; }",
	// The caret blinks, so leaving it lit makes every capture a coin toss.
	".cm-editor, .cm-scroller, .cm-content { caret-color: transparent !important; }",
	// The run filter chip wants a little more than the default width.
	".workspace-split.mod-right-split { width: 340px !important; }",
].join("\n");

test("captures the product shot at every width and scheme", async ({
	page,
	cdp,
	obsidian,
}) => {
	test.slow();
	await fs.mkdir(OUT_DIR, { recursive: true });

	// The obelisk key renders in the Properties panel as a wall of raw JSON,
	// immediately under the title.
	await obsidian.setEditorConfig("propertiesInDocument", "hidden");
	await obsidian.openFile(NOTE);
	expect(await obsidian.runCommand(SIDEBAR_COMMAND)).toBe(true);
	await expect(page.locator(".obelisk-sidebar .obelisk-card")).toHaveCount(3);
	await expect(page.locator(".obelisk-suggestion")).toHaveCount(1);
	await expect(page.locator(".obelisk-reply")).toHaveCount(1);
	await obsidian.setStyle("obelisk-shot-chrome", CHROME);
	await obsidian.collapseLeftSidebar();
	await obsidian.dismissMenu();
	await expect(page.locator(".modal-container")).toHaveCount(0);

	for (const scheme of SCHEMES) {
		await obsidian.setColourScheme(scheme);
		await obsidian.setStyle("obelisk-shot-theme", siteTheme(scheme));

		// A runner with no system fonts falls back silently, so the faces are
		// checked rather than assumed.
		const missing = await page.evaluate(async () => {
			const families = [
				"Inter Variable",
				"Instrument Serif",
				"JetBrains Mono Variable",
			];
			await Promise.all(families.map((f) => document.fonts.load(`16px "${f}"`)));
			await document.fonts.ready;
			return families.filter((f) => !document.fonts.check(`16px "${f}"`));
		});
		expect(missing).toEqual([]);

		for (const width of WIDTHS) {
			await cdp.send("Emulation.setDeviceMetricsOverride", {
				width,
				height: HEIGHT,
				deviceScaleFactor: 2,
				mobile: false,
			});
			// A pointer left over the sidebar surfaces a card's hover controls.
			await page.mouse.move(2, HEIGHT - 2);
			await page.waitForTimeout(1500);

			const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(
				path.join(OUT_DIR, `obsidian-${width}-${scheme}.png`),
				Buffer.from(shot.data, "base64"),
			);
		}
	}

	await cdp.send("Emulation.clearDeviceMetricsOverride");
});
