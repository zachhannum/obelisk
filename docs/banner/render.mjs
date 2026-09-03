/* Rewrites banner.png from banner.html.
   The obelus goes in as a data URI, because Chromium will not load a file://
   URL into a CSS mask. */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const mark = readFileSync(`${here}../../site/src/assets/obelus.svg`, "utf8");
const uri = `url("data:image/svg+xml,${encodeURIComponent(mark)}")`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });

await page.goto(new URL("banner.html", import.meta.url).href);
await page.addStyleTag({ content: `:root { --mark: ${uri}; }` });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${here}banner.png` });

await browser.close();
