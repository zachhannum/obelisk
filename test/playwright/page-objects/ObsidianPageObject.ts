import type { Locator, Page } from "@playwright/test";

/**
 * The slice of Obsidian's `app` the harness drives. Obsidian ships no types for
 * the running instance, so the shape is declared here rather than cast at each
 * call site.
 */
interface ObsidianFile {
	path: string;
}

interface ObsidianLeaf {
	openFile(file: ObsidianFile): Promise<void>;
}

interface ObsidianApp {
	commands: { executeCommandById(id: string): boolean };
	plugins: {
		enabledPlugins: Set<string>;
		plugins: Record<string, unknown>;
		setEnable(enable: boolean): Promise<void>;
	};
	vault: {
		getMarkdownFiles(): ObsidianFile[];
		getFileByPath(path: string): ObsidianFile | null;
		setConfig(key: string, value: unknown): void;
	};
	workspace: {
		getActiveFile(): ObsidianFile | null;
		getLeaf(newLeaf: boolean): ObsidianLeaf;
		leftSplit: { collapse(): void };
		updateOptions(): void;
	};
	changeTheme?(theme: string): void;
}

declare global {
	interface Window {
		app?: ObsidianApp;
	}
}

/** Obsidian's own colour schemes, by the names its settings use. */
export type ColourScheme = "dark" | "light";

/**
 * Plugin-agnostic driver for a running Obsidian: readiness, files, commands,
 * and the appearance knobs the captures set.
 */
export class ObsidianPageObject {
	readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	/** The workspace has painted and the vault has finished indexing. */
	async waitForObsidianReady(): Promise<void> {
		await this.page.locator(".workspace").waitFor({ timeout: 30_000 });
		await this.page.waitForFunction(
			() => (window.app?.vault.getMarkdownFiles().length ?? 0) > 0,
			undefined,
			{ timeout: 30_000 },
		);
	}

	async isPluginEnabled(pluginId: string): Promise<boolean> {
		return this.page.evaluate(
			(id) => window.app?.plugins.enabledPlugins.has(id) ?? false,
			pluginId,
		);
	}

	/**
	 * A fresh vault opens in Restricted Mode, which lists the plugin as enabled
	 * but never starts it. Leaving the mode is what actually loads it.
	 */
	async waitForPluginLoaded(pluginId: string): Promise<void> {
		const loaded = await this.page.evaluate(
			(id) => !!window.app?.plugins.plugins[id],
			pluginId,
		);
		if (!loaded) {
			await this.page.evaluate(() => window.app?.plugins.setEnable(true));
		}
		await this.page.waitForFunction(
			(id) => !!window.app?.plugins.plugins[id],
			pluginId,
			{ timeout: 30_000 },
		);
	}

	async openFile(filePath: string): Promise<void> {
		await this.page.evaluate(async (path) => {
			const app = window.app;
			const file = app?.vault.getFileByPath(path);
			if (app && file) {
				await app.workspace.getLeaf(false).openFile(file);
			}
		}, filePath);
		await this.page.waitForFunction(
			(path) => window.app?.workspace.getActiveFile()?.path === path,
			filePath,
			{ timeout: 15_000 },
		);
	}

	async runCommand(commandId: string): Promise<boolean> {
		return this.page.evaluate(
			(id) => window.app?.commands.executeCommandById(id) ?? false,
			commandId,
		);
	}

	/** An editor setting, applied to the open editors straight away. */
	async setEditorConfig(key: string, value: unknown): Promise<void> {
		await this.page.evaluate(
			({ key, value }) => {
				window.app?.vault.setConfig(key, value);
				window.app?.workspace.updateOptions();
			},
			{ key, value },
		);
	}

	async collapseLeftSidebar(): Promise<void> {
		await this.page.evaluate(() => window.app?.workspace.leftSplit.collapse());
	}

	/**
	 * Obsidian keeps its whole palette under `.theme-dark` / `.theme-light`, so
	 * the class is the scheme. `changeTheme` also writes the setting, which
	 * keeps the two from drifting apart mid-run.
	 */
	async setColourScheme(scheme: ColourScheme): Promise<void> {
		await this.page.evaluate((mode) => {
			window.app?.changeTheme?.(mode === "dark" ? "obsidian" : "moonstone");
			document.body.classList.toggle("theme-dark", mode === "dark");
			document.body.classList.toggle("theme-light", mode === "light");
		}, scheme);
	}

	/** Replaces the contents of a named style element, creating it if needed. */
	async setStyle(id: string, css: string): Promise<void> {
		await this.page.evaluate(
			({ id, css }) => {
				let el = document.getElementById(id);
				if (!el) {
					el = document.createElement("style");
					el.id = id;
					document.head.appendChild(el);
				}
				el.textContent = css;
			},
			{ id, css },
		);
	}

	async dismissMenu(): Promise<void> {
		await this.page.keyboard.press("Escape");
		await this.page
			.locator(".menu")
			.waitFor({ state: "detached", timeout: 1_000 })
			.catch(() => undefined);
	}

	getNotice(): Locator {
		return this.page.locator(".notice");
	}

	async waitForNoticeContaining(text: string, timeout = 5_000): Promise<void> {
		await this.getNotice()
			.filter({ hasText: text })
			.first()
			.waitFor({ state: "visible", timeout });
	}
}
