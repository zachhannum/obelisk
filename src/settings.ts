import {
	App,
	PluginSettingTab,
	Setting,
	SettingDefinitionControl,
} from "obsidian";
import type ObeliskPlugin from "./main";
import { ObeliskSettings } from "./types";

/**
 * Declared rather than drawn, so the settings turn up in Obsidian's settings
 * search. `display()` is the fallback for versions before 1.13.0, and is
 * unused on anything newer.
 */
export class ObeliskSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: ObeliskPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionControl<keyof ObeliskSettings>[] {
		return [
			{
				name: "Author name",
				desc: "Attached to comments you create. Leave blank to omit.",
				control: { type: "text", key: "authorName" },
			},
			{
				name: "Open sidebar automatically",
				desc: "When opening a note that already has comments.",
				control: { type: "toggle", key: "autoOpenSidebar" },
			},
			{
				name: "Remove comment after applying its suggestion",
				control: { type: "toggle", key: "removeCommentOnApply" },
			},
		];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Author name")
			.setDesc("Attached to comments you create. Leave blank to omit.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.authorName)
					.onChange(async (value) => {
						this.plugin.settings.authorName = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Open sidebar automatically")
			.setDesc("When opening a note that already has comments.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.autoOpenSidebar)
					.onChange(async (value) => {
						this.plugin.settings.autoOpenSidebar = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Remove comment after applying its suggestion")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.removeCommentOnApply)
					.onChange(async (value) => {
						this.plugin.settings.removeCommentOnApply = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
