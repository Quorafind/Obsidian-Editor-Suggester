import {
	App,
	debounce,
	ExtraButtonComponent,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	ToggleComponent
} from "obsidian";
import CustomSuggesterPlugin from "./customSuggesterIndex";
import { FolderSuggest } from "./suggest/folderSuggest";
import { SuggesterInfo } from "./CustomSuggester";

export interface CustomSuggesterSettings {
	suggesters: SuggesterInfo[];
	showInstructions: boolean;
	showAddNewButton: boolean;
	maxMatchWordlength: number;
}

const DEFAULT_FOLDER_SETTINGS = 'folder1/folder2';

export const DEFAULT_SETTINGS: CustomSuggesterSettings = {
	suggesters: [
		{
			name: 'Custom suggester #1',
			enable: true,
			trigger: {
				before: '【',
				after: '】',
				matchRegex: "【([^】]*)$",
				removeBefore: false,
			},
			type: 'text',
			suggestion: [
				"已完成，等待确认",
				"已放弃",
				"已完成，客户确认"
			],
		},
	],
	showInstructions: true,
	showAddNewButton: true,
	maxMatchWordlength: 10,
};

export class CustomSuggesterSettingTab extends PluginSettingTab {
	plugin: CustomSuggesterPlugin;

	constructor(app: App, plugin: CustomSuggesterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	debounceApplySettingsUpdate = debounce(
		async () => {
			await this.plugin.saveSettings();
			// await this.display();
		},
		200,
		true,
	);

	debounceDisplay = debounce(
		async () => {
			await this.display();
		},
		400,
		true,
	);

	applySettingsUpdate() {
		this.debounceApplySettingsUpdate();
	}

	async display() {
		await this.plugin.loadSettings();

		const {containerEl} = this;
		const settings = this.plugin.settings;

		containerEl.empty();

		const headerEl = containerEl.createEl('div', {cls: 'custom-setting-header'});
		headerEl.createEl('div', {text: 'Custom Suggester'});
		const importOrExportEl = headerEl.createEl('div', 'custom-setting-import-export');
		const importEl = importOrExportEl.createEl('div', 'custom-setting-import');
		new ExtraButtonComponent(importEl).setTooltip('Import settings').setIcon('file-down').onClick(async () => {
			new ImportModal(this.app, this.plugin, (value, type) => {
				const impotedSettings = JSON.parse(value);
				if (type === 'replace') {
					this.plugin.settings = impotedSettings;
				} else {
					this.plugin.settings.suggesters = [...this.plugin.settings.suggesters, ...impotedSettings.suggesters];
				}
				this.applySettingsUpdate();
				this.debounceDisplay();
			}).open();
		});
		const exportEl = importOrExportEl.createEl('div', 'custom-setting-export');
		new ExtraButtonComponent(exportEl).setTooltip('Export settings').setIcon('file-up').onClick(async () => {
			const settings = JSON.stringify(this.plugin.settings, null, 2);
			await navigator.clipboard.writeText(settings);
			new Notice('Settings copied to clipboard');
		});

		new Setting(containerEl)
			.setName('Show instructions')
			.setDesc('Show instructions in the suggestion list')
			.addToggle((toggle) => toggle
				.setValue(settings.showInstructions)
				.onChange(async (value) => {
					settings.showInstructions = value;
					this.applySettingsUpdate();
					// this.debounceDisplay();
				}));

		new Setting(containerEl)
			.setName('Show add new button')
			.setDesc('Show add new button in the suggestion list')
			.addToggle((toggle) => toggle
				.setValue(settings.showAddNewButton)
				.onChange(async (value) => {
					settings.showAddNewButton = value;
					this.applySettingsUpdate();
					this.debounceDisplay();
				}));

		settings.showAddNewButton && new Setting(containerEl).setName('Max match word length').setDesc('Max match word length').addSlider(
			(slider) => slider.setLimits(4, 20, 1).setDynamicTooltip().setValue(settings.maxMatchWordlength).onChange(async (value) => {
				settings.maxMatchWordlength = value;
				this.applySettingsUpdate();
			})
		);

		new Setting(containerEl)
			.setName('Add new suggester')
			.setDesc('Create a new custom suggester')
			.addButton((button) => button
				.setButtonText('+')
				.onClick(async () => {
					settings.suggesters.push({
						name: `Custom suggester ${settings.suggesters.length + 1}`,
						enable: false,
						trigger: {
							before: '',
							after: '',
							matchRegex: '',
							removeBefore: false,
						},
						type: 'text',
						suggestion: [],
					});
					this.applySettingsUpdate();

					this.debounceDisplay();
				}));

		this.displayMacroSettings();
	}

	displayMacroSettings() {
		const {containerEl} = this;
		const settings = this.plugin.settings;

		settings.suggesters.forEach((suggester: SuggesterInfo, index: number) => {
			const topLevelSetting = new Setting(containerEl).setClass('custom-suggester-setting');
			topLevelSetting.settingEl.empty();

			const headerEl = topLevelSetting.settingEl.createEl('div', 'custom-suggester-setting-header ');

			const nameComponentEl = headerEl.createEl('div', 'custom-suggester-setting-name-component setting-item-info');
			const nameEl = nameComponentEl.createEl('span', {
				cls: "custom-suggester-setting-name",
				text: suggester.name || `Custom suggester #${index}`
			});
			const deleteButtonEl = nameComponentEl.createEl('span');
			new ExtraButtonComponent(deleteButtonEl).setTooltip('Delete suggester').setIcon('trash').onClick(
				() => {
					settings.suggesters.splice(index, 1);
					this.applySettingsUpdate();

					this.debounceDisplay();
				}
			);

			const toggleComponentEl = headerEl.createEl('div', 'custom-suggester-setting-toggle setting-item-control');

			const toggleEl = toggleComponentEl.createEl('div', 'custom-suggester-setting-toggle');
			new ToggleComponent(toggleEl).setValue(settings.suggesters[index].enable).onChange((value) => {
				settings.suggesters[index] = {...settings.suggesters[index], enable: value};
				this.applySettingsUpdate();
			});

			const mainSettingsEl = topLevelSetting.settingEl.createEl('div', 'custom-suggester');

			// Suggester name
			const suggesterNameEl = mainSettingsEl.createEl('div', 'custom-suggester-name');
			suggesterNameEl.createEl('label', {text: 'Name'});
			suggesterNameEl.createEl('input', {
				cls: 'name-input',
				type: 'text',
				value: settings.suggesters[index].name,
			}).on('change', '.name-input', async (evt: Event) => {
				const target = evt.target as HTMLInputElement;
				settings.suggesters[index] = {...settings.suggesters[index], name: target.value};
				this.applySettingsUpdate();

				this.debounceDisplay();
			});

			// Suggester prefix
			const insertPrefixEl = mainSettingsEl.createEl('div', 'custom-suggester-prefix');
			insertPrefixEl.createEl('label', {text: 'Prefix'});
			const inputGroupEl = insertPrefixEl.createEl('div', 'custom-suggester-prefix-input-group');
			const toggleIconEl = inputGroupEl.createEl('div', 'custom-suggester-prefix-toggle');
			const icon = new ExtraButtonComponent(toggleIconEl);
			icon.extraSettingsEl.toggleClass('active', settings.suggesters[index].trigger.removeBefore);
			icon.setTooltip('Remove before').setIcon('x-square').onClick(() => {
				settings.suggesters[index] = {
					...settings.suggesters[index],
					trigger: {
						...settings.suggesters[index].trigger,
						removeBefore: !settings.suggesters[index].trigger.removeBefore
					}
				};
				this.applySettingsUpdate();
				icon.extraSettingsEl.toggleClass('active', settings.suggesters[index].trigger.removeBefore);
				// this.debounceDisplay();
			});
			inputGroupEl.createEl('input', {
				cls: 'prefix-input',
				type: 'text',
				value: suggester.trigger.before,
			}).on('change', '.prefix-input', async (evt: Event) => {
				const target = evt.target as HTMLInputElement;
				settings.suggesters[index] = {
					...settings.suggesters[index],
					trigger: {...settings.suggesters[index].trigger, before: target.value}
				};
				this.applySettingsUpdate();
			});

			// Suggester suffix
			const insertSuffixEl = mainSettingsEl.createEl('div', 'custom-suggester-suffix');
			insertSuffixEl.createEl('label', {text: 'Suffix'});
			insertSuffixEl.createEl('input', {
				cls: 'suffix-input',
				type: 'text',
				value: suggester.trigger.after,
			}).on('change', '.suffix-input', async (evt: Event) => {
				const target = evt.target as HTMLInputElement;
				settings.suggesters[index] = {
					...settings.suggesters[index],
					trigger: {...settings.suggesters[index].trigger, after: target.value}
				};
				this.applySettingsUpdate();
			});

			// Suggester regex
			const regexEl = mainSettingsEl.createEl('div', 'custom-suggester-regex');
			const regexInfoEl = regexEl.createEl('div', 'custom-suggester-regex-info');
			regexInfoEl.createEl('label', {text: 'Regex'});
			const introEl = regexInfoEl.createEl('span', {
				cls: 'custom-suggester-regex-intro',
			});
			new ExtraButtonComponent(introEl).setTooltip('Regex to match the content from last prefix to cursor position.').setIcon('info');

			regexEl.createEl('input', {
				cls: 'regex-input',
				type: 'text',
				value: suggester.trigger.matchRegex,
			}).on('change', '.regex-input', async (evt: Event) => {
				const target = evt.target as HTMLInputElement;
				settings.suggesters[index] = {
					...settings.suggesters[index],
					trigger: {...settings.suggesters[index].trigger, matchRegex: target.value}
				};
				this.applySettingsUpdate();
			});

			// Suggester suggestion list and icons
			const suggestionEl = mainSettingsEl.createEl('div', 'custom-suggester-suggestion');
			suggestionEl.createEl('label', {text: 'Suggestion'});
			const suggestionBtnGorupEl = suggestionEl.createEl('div', 'custom-suggester-suggestion-btn-group');

			const alreadyAddedSuggestionEl = suggestionBtnGorupEl.createEl('div', 'custom-suggester-suggestion-list-group');
			const hoverBtnEl = alreadyAddedSuggestionEl.createEl('div', 'custom-suggester-suggestion-btn');
			new ExtraButtonComponent(hoverBtnEl).setIcon('list');
			suggester.suggestion.length > 0 && this.createSuggestionListEl(alreadyAddedSuggestionEl, suggester);

			const suggestionInputBtn = suggestionBtnGorupEl.createEl('div', 'custom-suggester-suggestion-input');
			new ExtraButtonComponent(suggestionInputBtn).setTooltip('Add suggestion').setIcon('settings-2').onClick(() => {
				new InputModal(this.app, this.plugin, settings.suggesters[index], (value, type) => {
					switch (type) {
						case 'text':
							settings.suggesters[index] = {
								...settings.suggesters[index],
								type: 'text',
								suggestion: value.split('\n').filter(Boolean)
							};
							break;
						case 'link':
							settings.suggesters[index] = {
								...settings.suggesters[index],
								type: 'link',
								suggestion: value
							};
							break;
						case 'function':
							settings.suggesters[index] = {
								...settings.suggesters[index],
								type: 'function',
								suggestion: value
							};
							break;
						default:
							settings.suggesters[index] = {
								...settings.suggesters[index],
								type: 'text',
								suggestion: value.split('\n').filter(Boolean)
							};
							break;
					}


					// const suggestionList = value.split('\n').filter(Boolean);
					// settings.suggesters[index] = {...settings.suggesters[index], suggestion: suggestionList};
					this.applySettingsUpdate();

					this.debounceDisplay();
				}).open();
			});
		});
	}

	createInputEl(parentEl: HTMLElement, value: string, onChange: (value: string) => void) {

	}

	createSuggestionListEl(alreadyAddedSuggestionEl: HTMLDivElement, suggester: SuggesterInfo) {
		const hoverListEl = alreadyAddedSuggestionEl.createEl('div', 'custom-suggester-suggestion-list hide');
		switch (suggester.type) {
			case "text":
				(suggester.suggestion as string[]).forEach((suggestion) => {
					const suggestionEl = hoverListEl.createEl('div', 'custom-suggester-suggestion-item');
					suggestionEl.createEl('span', {text: suggestion});
				});
				break;
			case "link":
				hoverListEl.createEl('div', 'custom-suggester-suggestion-item').createEl('span', {text: 'Link'});
				break;
			case "function":
				hoverListEl.createEl('div', 'custom-suggester-suggestion-item').createEl('span', {text: 'Function'});
				break;
			default:
				(suggester.suggestion as string[]).forEach((suggestion) => {
					const suggestionEl = hoverListEl.createEl('div', 'custom-suggester-suggestion-item');
					suggestionEl.createEl('span', {text: suggestion});
				});
				break;
		}
	}
}

class InputModal extends Modal {
	plugin: CustomSuggesterPlugin;
	type: 'link' | 'text' | 'function' = 'text';

	value: string = '';

	constructor(app: App, plugin: CustomSuggesterPlugin, readonly suggestion: SuggesterInfo, readonly cb: (value: string, type: 'link' | 'text' | 'function') => void) {
		super(app);
		this.plugin = plugin;
		this.type = suggestion.type || 'text';
	}

	onOpen() {
		super.onOpen();
		this.setTitle('Add suggestion');
		this.modalEl.toggleClass('custom-suggester-modal', true);

		this.display();
	}


	display() {
		this.contentEl.empty();

		const fragment = document.createDocumentFragment();
		const typeSelectorEl = fragment.createEl('div', {
			cls: 'custom-suggester-type-selector',
		});
		new Setting(typeSelectorEl).setName('Suggester type').addDropdown((dropdown) => {
			// Options is record data type, so we need to cast it to string array
			dropdown.addOption('text', 'Text').addOption('link', 'Link').addOption('function', 'Function');
			dropdown.setValue(this.type).onChange((value: 'text' | 'link' | 'function') => {
				this.type = value;
				this.display();
			});
		});


		switch (this.type) {
			case "text":
				this.createTextInput(fragment);
				break;
			case "link":
				this.createLinkInput(fragment);
				break;
			case "function":
				this.createFunctionInput(fragment);
				break;
			default:
				this.createTextInput(fragment);
				break;
		}
	}

	createTextInput(fragment: DocumentFragment) {
		const inputEl = fragment.createEl('textarea', {
			cls: 'custom-suggester-suggestion-input',
			type: 'text',
		});
		inputEl.value = (this.suggestion.suggestion as string[]).join('\n');
		inputEl && this.createBtn(fragment, inputEl, 'text');
	}

	createLinkInput(fragment: DocumentFragment) {
		const pathEl = fragment.createEl('div', {
			cls: 'custom-suggester-path-input',
		});
		let inputEl;
		new Setting(pathEl).setName('Path').addText((text) => {
			inputEl = text.inputEl;
			new FolderSuggest(inputEl);
			text
				.setPlaceholder(DEFAULT_FOLDER_SETTINGS)
				.setValue(this.suggestion.suggestion as string);
		});

		inputEl && this.createBtn(fragment, inputEl, 'link');

	}


	createFunctionInput(fragment: DocumentFragment) {
		const inputEl = fragment.createEl('textarea', {
			cls: 'custom-suggester-suggestion-input',
			type: 'text',
			placeholder: 'function body',
		});
		inputEl.value = this.suggestion.type === 'function' ? (this.suggestion.suggestion as string) : '';
		inputEl && this.createBtn(fragment, inputEl, 'function');
	}


	createBtn(fragment: DocumentFragment, inputEl: HTMLInputElement | HTMLTextAreaElement, type: 'text' | 'link' | 'function') {
		const btnEl = fragment.createEl('div', {
			cls: 'custom-suggester-btn-group',
		}).createEl('button', {
			cls: 'custom-suggester-confirm-btn',
			text: 'Confirm',
		});
		btnEl.onclick = () => {
			this.cb(inputEl.value, type);
			this.close();
		};
		this.setContent(fragment);
	}

	onClose() {
		super.onClose();
	}
}

class ImportModal extends Modal {
	plugin: CustomSuggesterPlugin;

	constructor(app: App, plugin: CustomSuggesterPlugin, readonly cb: (value: string, type: 'replace' | 'merge') => void) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		super.onOpen();
		this.setTitle('Import settings');

		this.modalEl.toggleClass('custom-suggester-modal', true);

		const documentFragment = document.createDocumentFragment();
		const inputEl = documentFragment.createEl('textarea', {
			cls: 'custom-suggester-suggestion-input',
			type: 'text',
		});
		const btnGroupEl = documentFragment.createEl('div', {
			cls: 'custom-suggester-btn-group',
		});
		const replaceEl = btnGroupEl.createEl('button', {
			cls: 'custom-suggester-confirm-btn mod-warning',
			text: 'Replace',
		});
		const mergeEl = btnGroupEl.createEl('button', {
			cls: 'custom-suggester-confirm-btn',
			text: 'Merge',
		});

		replaceEl.onclick = () => {
			this.cb(inputEl.value, 'replace');
			this.close();
		};
		mergeEl.onclick = () => {
			this.cb(inputEl.value, 'merge');
			this.close();
		};
		this.setContent(documentFragment);
	}

	onClose() {
		super.onClose();
	}
}
