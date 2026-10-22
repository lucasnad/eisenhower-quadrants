import { App, PluginSettingTab, Setting } from "obsidian";
import type EisenhowerPlugin from "./main";
import { strings } from "./i18n";
import { normalizeRoot, type UnratedImportance } from "./tasks";

export interface EisenhowerSettings {
	urgentWithinDays: number;
	urgentTags: string;
	importantTags: string;
	mediumIsImportant: boolean;
	unratedImportance: UnratedImportance;
	pinRoot: string;
	includeFolders: string;
	excludeFolders: string;
	showCompleted: boolean;
	appendDoneDate: boolean;
	inboxPath: string;
}

export const DEFAULT_SETTINGS: EisenhowerSettings = {
	urgentWithinDays: 2,
	urgentTags: "urgent, urgente",
	importantTags: "important, importante",
	mediumIsImportant: false,
	unratedImportance: "triage",
	pinRoot: "eisenhower",
	includeFolders: "",
	excludeFolders: "",
	showCompleted: false,
	appendDoneDate: true,
	inboxPath: "Eisenhower inbox.md",
};

export class EisenhowerSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: EisenhowerPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = strings().settings;
		const settings = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl).setName(s.classification).setHeading();

		new Setting(containerEl)
			.setName(s.urgentWithin)
			.setDesc(s.urgentWithinDesc)
			.addSlider((slider) =>
				slider
					.setLimits(0, 14, 1)
					.setValue(settings.urgentWithinDays)
					.onChange(async (value) => {
						settings.urgentWithinDays = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(s.urgentTags)
			.setDesc(s.urgentTagsDesc)
			.addText((text) =>
				text.setValue(settings.urgentTags).onChange(async (value) => {
					settings.urgentTags = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(s.importantTags)
			.setDesc(s.importantTagsDesc)
			.addText((text) =>
				text.setValue(settings.importantTags).onChange(async (value) => {
					settings.importantTags = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(s.mediumImportant)
			.setDesc(s.mediumImportantDesc)
			.addToggle((toggle) =>
				toggle.setValue(settings.mediumIsImportant).onChange(async (value) => {
					settings.mediumIsImportant = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(s.unrated)
			.setDesc(s.unratedDesc)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("triage", s.unratedTriage)
					.addOption("important", s.unratedImportant)
					.addOption("not-important", s.unratedNotImportant)
					.setValue(settings.unratedImportance)
					.onChange(async (value) => {
						settings.unratedImportance = value as UnratedImportance;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(s.pinTag)
			.setDesc(s.pinTagDesc(normalizeRoot(settings.pinRoot)))
			.addText((text) =>
				text.setValue(settings.pinRoot).onChange(async (value) => {
					settings.pinRoot = normalizeRoot(value);
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName(s.scope).setHeading();

		new Setting(containerEl)
			.setName(s.includeFolders)
			.setDesc(s.includeFoldersDesc)
			.addText((text) =>
				text.setValue(settings.includeFolders).onChange(async (value) => {
					settings.includeFolders = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(s.excludeFolders)
			.setDesc(s.excludeFoldersDesc)
			.addText((text) =>
				text.setValue(settings.excludeFolders).onChange(async (value) => {
					settings.excludeFolders = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName(s.behavior).setHeading();

		new Setting(containerEl)
			.setName(s.showCompleted)
			.setDesc(s.showCompletedDesc)
			.addToggle((toggle) =>
				toggle.setValue(settings.showCompleted).onChange(async (value) => {
					settings.showCompleted = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(s.doneDate)
			.setDesc(s.doneDateDesc)
			.addToggle((toggle) =>
				toggle.setValue(settings.appendDoneDate).onChange(async (value) => {
					settings.appendDoneDate = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(s.inbox)
			.setDesc(s.inboxDesc)
			.addText((text) =>
				text.setValue(settings.inboxPath).onChange(async (value) => {
					settings.inboxPath = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
