import { Plugin, setTooltip } from 'obsidian';
import { CustomSuggesterSettings, CustomSuggesterSettingTab, DEFAULT_SETTINGS } from "./customSuggesterSettings";
import { CustomSuggester } from "./CustomSuggester";
import { around } from "monkey-around";

export default class CustomSuggesterPlugin extends Plugin {
	private settingTab: CustomSuggesterSettingTab;
	settings: CustomSuggesterSettings;

	suggester: CustomSuggester;

	async onload() {
		await this.loadSettings();

		this.settingTab = new CustomSuggesterSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.suggester = new CustomSuggester(this.app, this);
		this.registerEditorSuggest(
			this.suggester
		);

		this.patchToolTip();

	}

	onunload() {

	}

	patchToolTip() {
		const uninstaller = around(setTooltip, (next: any) => {
			return (el: HTMLElement, tooltip: string, options: any) => {
				console.log('tooltip', el, tooltip, options);
				return next.call(this, el, tooltip, options);
			};
		});
	}

	public async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.suggester.updateSettings(this.settings);
	}
}


