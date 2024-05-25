import {
	App,
	debounce,
	ExtraButtonComponent, Menu,
	Modal,
	Notice,
	PluginSettingTab,
	Setting, setTooltip, TextAreaComponent,
	ToggleComponent
} from "obsidian";
import CustomSuggesterPlugin from "./customSuggesterIndex";
import { FolderSuggest } from "./suggest/folderSuggest";
import { SuggesterInfo } from "./CustomSuggester";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
	bracketMatching,
	defaultHighlightStyle,
	foldGutter,
	foldKeymap,
	indentOnInput,
	syntaxHighlighting,
} from "@codemirror/language";
import { EditorState, Extension } from "@codemirror/state";
import {
	drawSelection,
	dropCursor,
	EditorView, highlightActiveLine, highlightActiveLineGutter,
	highlightSpecialChars,
	keymap,
	lineNumbers,
	rectangularSelection,
} from "@codemirror/view";

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { lintKeymap } from "@codemirror/lint";
import { basicSetup } from "codemirror";

export interface CustomSuggesterSettings {
	suggesters: SuggesterInfo[];
	showInstructions: boolean;
	showAddNewButton: boolean;
	maxMatchWordlength: number;
}

const DEFAULT_FOLDER_SETTINGS = 'folder1/folder2';

export const customSetup: Extension[] = [
	basicSetup,
	lineNumbers(),
	highlightActiveLineGutter(),
	highlightSpecialChars(),
	history(),
	javascript(),
	foldGutter(),
	drawSelection(),
	dropCursor(),
	EditorState.allowMultipleSelections.of(true),
	indentOnInput(),
	syntaxHighlighting(defaultHighlightStyle, {fallback: true}),
	EditorView.lineWrapping,
	bracketMatching(),
	closeBrackets(),
	autocompletion(),
	rectangularSelection(),
	highlightActiveLine(),
	highlightSelectionMatches(),
	keymap.of([
		...closeBracketsKeymap,
		...defaultKeymap,
		...searchKeymap,
		...historyKeymap,
		indentWithTab,
		...foldKeymap,
		...completionKeymap,
		...lintKeymap,
	]),
].filter(ext => ext);

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

		const addNewSuggester = new Setting(containerEl)
			.setName('Add new suggester')
			.setDesc('Create a new custom suggester')
			.addButton((button) => button
				.setButtonText('+')
				.onClick(async () => {
					const menu = new Menu();
					const types: ('text' | 'link' | 'function')[] = ['text', 'link', 'function'];

					for (const type of types) {
						menu.addItem((item) => {
							item.setTitle(type).setIcon({
								'text': 'pencil',
								'link': 'link',
								'function': 'code',
							}[type]).onClick(() => {
								settings.suggesters.push({
									name: `Custom suggester ${settings.suggesters.length + 1}`,
									enable: false,
									trigger: {
										before: '',
										after: '',
										matchRegex: '',
										removeBefore: false,
									},
									type: type,
									suggestion: [],
								});
								this.applySettingsUpdate();

								this.debounceDisplay();
								// Scroll to the bottom of the settings container to view the newly added suggester
								setTimeout(() => {
									this.containerEl.scrollTop = this.containerEl.scrollHeight;
								}, 10);
							});
						});
					}


					const rect = button.buttonEl.getBoundingClientRect();
					menu.showAtPosition({
						x: rect.left,
						y: rect.bottom
					});


					// settings.suggesters.push({
					// 	name: `Custom suggester ${settings.suggesters.length + 1}`,
					// 	enable: false,
					// 	trigger: {
					// 		before: '',
					// 		after: '',
					// 		matchRegex: '',
					// 		removeBefore: false,
					// 	},
					// 	type: 'text',
					// 	suggestion: [],
					// });
					// this.applySettingsUpdate();
					//
					// this.debounceDisplay();
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
			nameEl.contentEditable = 'true';
			nameEl.onclick = (e: MouseEvent) => {
				const keyDownEvent = (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						nameEl.contentEditable = 'false';
						nameEl.blur();
					}
				};

				const blurEvent = () => {
					settings.suggesters[index] = {...settings.suggesters[index], name: nameEl.innerText};
					this.applySettingsUpdate();

					nameEl.removeEventListener('keydown', keyDownEvent);
					nameEl.removeEventListener('blur', blurEvent);
				};

				nameEl.addEventListener('keydown', keyDownEvent);
				nameEl.addEventListener('blur', blurEvent);

				// Capture the current selection range
			};


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
			// const suggesterNameEl = mainSettingsEl.createEl('div', 'custom-suggester-name');
			// suggesterNameEl.createEl('label', {text: 'Name'});
			// suggesterNameEl.createEl('input', {
			// 	cls: 'name-input',
			// 	type: 'text',
			// 	value: settings.suggesters[index].name,
			// }).on('change', '.name-input', async (evt: Event) => {
			// 	const target = evt.target as HTMLInputElement;
			// 	settings.suggesters[index] = {...settings.suggesters[index], name: target.value};
			// 	this.applySettingsUpdate();
			//
			// 	this.debounceDisplay();
			// });

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
			// const regexEl = mainSettingsEl.createEl('div', 'custom-suggester-regex');
			// const regexInfoEl = regexEl.createEl('div', 'custom-suggester-regex-info');
			// regexInfoEl.createEl('label', {text: 'Regex'});
			// const introEl = regexInfoEl.createEl('span', {
			// 	cls: 'custom-suggester-regex-intro',
			// });
			// new ExtraButtonComponent(introEl).setTooltip('Regex to match the content from last prefix to cursor position.').setIcon('info');
			//
			// regexEl.createEl('input', {
			// 	cls: 'regex-input',
			// 	type: 'text',
			// 	value: suggester.trigger.matchRegex,
			// }).on('change', '.regex-input', async (evt: Event) => {
			// 	const target = evt.target as HTMLInputElement;
			// 	settings.suggesters[index] = {
			// 		...settings.suggesters[index],
			// 		trigger: {...settings.suggesters[index].trigger, matchRegex: target.value}
			// 	};
			// 	this.applySettingsUpdate();
			// });

			// Suggester suggestion list and icons
			const suggestionEl = mainSettingsEl.createEl('div', 'custom-suggester-suggestion');
			suggestionEl.createEl('label', {text: 'Suggestion'});
			const suggestionBtnGorupEl = suggestionEl.createEl('div', 'custom-suggester-suggestion-btn-group');

			const alreadyAddedSuggestionEl = suggestionBtnGorupEl.createEl('div', 'custom-suggester-suggestion-list-group');
			const hoverBtnEl = alreadyAddedSuggestionEl.createEl('div', 'custom-suggester-suggestion-btn');
			new ExtraButtonComponent(hoverBtnEl).setIcon('list').onClick(() => {
				const menu = this.createMenu(suggester);
				const rect = hoverBtnEl.getBoundingClientRect();
				menu.showAtPosition({
					x: rect.left,
					y: rect.bottom
				});
			});


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

	createMenu(suggester: SuggesterInfo) {
		const menu = new Menu();

		// const hoverListEl = alreadyAddedSuggestionEl.createEl('div', 'custom-suggester-suggestion-list hide');
		switch (suggester.type) {
			case "text":
				(suggester.suggestion as string[]).forEach(
					(suggestion) => {
						menu.addItem((item) => {
							item.setTitle(suggestion).setIsLabel(true);
						});
					}
				);
				break;
			case "link":
				menu.addItem((item) => {
					item.setTitle('Link').setIsLabel(true);
				});
				break;
			case "function":
				menu.addItem((item) => {
					item.setTitle('Function').setIsLabel(true);
				});
				break;
			default:
				(suggester.suggestion as string[]).forEach(
					(suggestion) => {
						menu.addItem((item) => {
							item.setTitle(suggestion).setIsLabel(true);
						});
					}
				);
				break;
		}

		return menu;
	}
}

class InputModal extends Modal {
	plugin: CustomSuggesterPlugin;
	type: 'link' | 'text' | 'function' = 'text';

	value: string = '';
	editor: EditorView;

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
		// new Setting(typeSelectorEl).setName('Suggester type').addDropdown((dropdown) => {
		// 	// Options is record data type, so we need to cast it to string array
		// 	dropdown.addOption('text', 'Text').addOption('link', 'Link').addOption('function', 'Function');
		// 	dropdown.setValue(this.type).onChange((value: 'text' | 'link' | 'function') => {
		// 		this.type = value;
		// 		this.display();
		// 	});
		// });


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
		const inputEl = fragment.createEl('div', {
			cls: 'custom-suggester-suggestion-input',
			type: 'text',
			placeholder: 'function body',
		});
		const customCSSEl = new TextAreaComponent(inputEl).setValue(this.suggestion.type === 'function' ? (this.suggestion.suggestion as string) : '');
		this.editor = editorFromTextArea(customCSSEl.inputEl, customSetup);
		this.editor.contentDOM.toggleClass('function-inputer', true);
		// inputEl.value = this.suggestion.type === 'function' ? (this.suggestion.suggestion as string) : '';
		inputEl && this.createBtn(fragment, this.editor, 'function');
	}


	createBtn(fragment: DocumentFragment, inputEl: HTMLInputElement | HTMLTextAreaElement | EditorView, type: 'text' | 'link' | 'function') {
		const btnEl = fragment.createEl('div', {
			cls: 'custom-suggester-btn-group',
		}).createEl('button', {
			cls: 'custom-suggester-confirm-btn',
			text: 'Confirm',
		});
		btnEl.onclick = () => {
			if (inputEl instanceof EditorView) {
				this.cb(inputEl.state.doc.toString(), type);
			} else {
				this.cb(inputEl.value, type);
			}
			this.close();
		};
		this.setContent(fragment);
	}

	onClose() {
		super.onClose();
		this.editor && this.editor.destroy();
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

function editorFromTextArea(textarea: HTMLTextAreaElement, extensions: Extension) {
	let view = new EditorView({
		state: EditorState.create({doc: textarea.value, extensions}),
	});

	textarea.parentNode!.insertBefore(view.dom, textarea);
	textarea.style.display = "none";
	if (textarea.form)
		textarea.form.addEventListener("submit", () => {
			textarea.value = view.state.doc.toString();
		});
	return view;
}
