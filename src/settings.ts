import { App, PluginSettingTab, Setting } from "obsidian";
import type ObeliskPlugin from "./main";

export class ObeliskSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: ObeliskPlugin,
	) {
		super(app, plugin);
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
			.setName("Show resolved comments")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.showResolved)
					.onChange(async (value) => {
						this.plugin.settings.showResolved = value;
						await this.plugin.saveSettings();
						this.plugin.refresh();
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
