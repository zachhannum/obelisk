import type { ChildProcess } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";

import {
	test as base,
	chromium,
	type Browser,
	type CDPSession,
	type Page,
} from "@playwright/test";
import ObsidianLauncher from "obsidian-launcher";

import { ObsidianPageObject } from "./page-objects/ObsidianPageObject";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE_VAULT = path.join(REPO_ROOT, "test", "vaults", "product-shot");
const PLUGIN_ID = "obelisk";
const LAUNCH_TIMEOUT = 120_000;

interface ObsidianSession {
	browser: Browser;
	proc: ChildProcess;
	page: Page;
	vaultPath: string;
}

export interface ObsidianWorkerFixtures {
	session: ObsidianSession;
}

export interface ObsidianFixtures {
	page: Page;
	cdp: CDPSession;
	obsidian: ObsidianPageObject;
	vaultPath: string;
	obsidianTrace: void;
}

async function waitForPort(port: number, timeout: number): Promise<void> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (response.ok) {
				return;
			}
		} catch {
			// Obsidian has not opened the port yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Obsidian never opened a debugging port on ${port}`);
}

/** Obsidian also runs hidden helper targets; the workspace is the one page. */
async function findWorkspacePage(browser: Browser): Promise<Page> {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		for (const context of browser.contexts()) {
			for (const page of context.pages()) {
				if (page.url().includes("index.html")) {
					return page;
				}
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("Obsidian opened no workspace window");
}

async function launchObsidian(): Promise<ObsidianSession> {
	const manifest = path.join(REPO_ROOT, "main.js");
	try {
		await fs.access(manifest);
	} catch {
		throw new Error("main.js is missing; run npm run build before the harness");
	}

	const launcher = new ObsidianLauncher();
	const port = 9222 + Math.floor(Math.random() * 1000);
	const { proc, vault } = await launcher.launch({
		vault: FIXTURE_VAULT,
		copy: true,
		plugins: [REPO_ROOT],
		args: [`--remote-debugging-port=${port}`],
	});

	await waitForPort(port, LAUNCH_TIMEOUT);
	const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
	const page = await findWorkspacePage(browser);
	await page.waitForLoadState("domcontentloaded");

	const obsidian = new ObsidianPageObject(page);
	await obsidian.waitForObsidianReady();
	await obsidian.waitForPluginLoaded(PLUGIN_ID);

	return { browser, proc, page, vaultPath: vault ?? FIXTURE_VAULT };
}

/**
 * One Obsidian for the whole run. Starting it costs a download and a cold boot,
 * and nothing the harness does to it needs a fresh one.
 */
export const test = base.extend<ObsidianFixtures, ObsidianWorkerFixtures>({
	session: [
		async ({}, use) => {
			const session = await launchObsidian();
			await use(session);
			await session.browser.close().catch(() => undefined);
			session.proc.kill();
			await fs
				.rm(session.vaultPath, { recursive: true, force: true })
				.catch(() => undefined);
		},
		{ scope: "worker" },
	],

	page: async ({ session }, use) => {
		await use(session.page);
	},

	vaultPath: async ({ session }, use) => {
		await use(session.vaultPath);
	},

	obsidian: async ({ page }, use) => {
		await use(new ObsidianPageObject(page));
	},

	cdp: async ({ page }, use) => {
		const cdp = await page.context().newCDPSession(page);
		await use(cdp);
		await cdp.detach().catch(() => undefined);
	},

	// Playwright's own tracing rides on the context it creates, and this one
	// comes from an Obsidian that was already running.
	obsidianTrace: [
		async ({ page }, use, testInfo) => {
			const context = page.context();
			await context.tracing.start({ screenshots: true, snapshots: true });
			await use();
			const failed = testInfo.status !== testInfo.expectedStatus;
			await context.tracing.stop(
				failed ? { path: testInfo.outputPath("trace.zip") } : {},
			);
		},
		{ auto: true },
	],
});

export const expect = test.expect;
export { ObsidianPageObject };
