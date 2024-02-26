import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	FuzzyMatch, Modal,
	Plugin,
	prepareFuzzySearch, setIcon
} from 'obsidian';
import { CustomSuggesterSettings, CustomSuggesterSettingTab, DEFAULT_SETTINGS } from "./settings";

export interface SuggesterInfo {
	name: string;
	enable: boolean;
	trigger: {
		before: string;
		after: string;
		matchRegex: string;
	},
	suggestion: string[];
}

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

	}

	onunload() {

	}

	public async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.suggester.updateSettings(this.settings);
	}

}


export class CustomSuggester extends EditorSuggest<string> {
	editor: Editor;
	cursor: EditorPosition;
	plugin: CustomSuggesterPlugin;
	settings: CustomSuggesterSettings;

	hasBracketEnd = false;
	currentSuggester: SuggesterInfo;
	currentIndex = 0;

	readonly suggesterType = 'custom-suggester';

	constructor(app: App, plugin: CustomSuggesterPlugin) {
		super(app);
		this.plugin = plugin;
		this.settings = plugin.settings;
	}

	updateSettings(settings: CustomSuggesterSettings) {
		this.settings = settings;
	}

	// readonly CUSTOM_BRACKET_REGEX = /【([^】]*)$/;

	fuzzySearchItemsOptimized(query: string, items: string[]): FuzzyMatch<string>[] {
		const preparedSearch = prepareFuzzySearch(query);

		return items
			.map((item) => {
				const result = preparedSearch(item);
				if (result) {
					return {
						item: item,
						match: result,
						score: result.score,
					};
				}
				return null;
			})
			.sort((a, b) => (b?.score || 0) - (a?.score || 0))
			.filter(Boolean) as FuzzyMatch<string>[];
	}


	onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {

		this.cursor = cursor;
		this.editor = editor;
		const currentLineNum = cursor.line;
		const currentLineText = editor.getLine(currentLineNum);
		const textUntilCursor = currentLineText.slice(0, cursor.ch);
		const textAfterCursor = currentLineText.slice(cursor.ch);

		const getBracketIndex = (text: string, target: string) => {

			const lastDoubleBracketIndex = text.lastIndexOf(target);
			return lastDoubleBracketIndex === -1 ? 0 : !target ? 0 : lastDoubleBracketIndex;
		};

		const getNextBracketIndex = (text: string, target: string) => {
			if (!target) {
				this.hasBracketEnd = false;
				return 0;
			}
			const nextBracketIndex = text.indexOf(target);
			this.hasBracketEnd = nextBracketIndex !== -1;
			return nextBracketIndex === -1 ? 0 : nextBracketIndex;
		};

		for (const suggester of this.settings.suggesters.filter((s) => s.enable || !s.trigger.before)) {
			const index = getBracketIndex(textUntilCursor, suggester.trigger.after || suggester.trigger.before);
			// console.log(index, trigger.after);
			const targetText = textUntilCursor.slice(index);
			// console.log(trigger.matchRegex, targetText);
			const match = targetText.match(new RegExp(suggester.trigger.matchRegex));

			// console.log(targetText, match, suggester.trigger.matchRegex);

			const nextWhiteSpaceIndex = textAfterCursor.search(/^\s/);
			const cursorOffset = nextWhiteSpaceIndex === -1 ? getNextBracketIndex(textAfterCursor, suggester.trigger.after || suggester.trigger.before) : nextWhiteSpaceIndex;

			if (match) {
				const matchedText = match[1];
				this.currentSuggester = suggester;
				this.currentIndex = index;
				// console.log(matchedText);

				return {
					start: {
						line: currentLineNum,
						ch: cursor.ch - matchedText.length,
					},
					end: {
						line: currentLineNum,
						ch: cursor.ch + cursorOffset,
					},
					query: matchedText,
				};
			}
		}

		return null;
	}

	getSuggestions(context: EditorSuggestContext): string[] {
		const lowerCaseInputStr = context.query.toLocaleLowerCase();
		const data = this.currentSuggester.suggestion;

		if (data.includes(lowerCaseInputStr)) return [];

		if (context.query.length > this.plugin.settings.maxMatchWordlength) return [];

		const results = this.fuzzySearchItemsOptimized(lowerCaseInputStr, data).map((match) => match.item);

		const renewResults = this.plugin.settings.showAddNewButton ? [...results, '++add++' + (context.query.toLocaleLowerCase() || 'Add new')] : results;

		return renewResults;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.toggleClass('custom-suggester-item', true);
		if (value.startsWith('++add++')) {
			const iconEl = el.createEl("span", {
				cls: "custom-suggester-item-icon",
			});
			const textEl = el.createEl("span");
			setIcon(iconEl, 'plus');
			textEl.setText(value.replace('++add++', ''));
			return;
		}
		el.setText(value);
	}

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		if (value.startsWith('++add++')) {
			evt.preventDefault();
			new NewSuggestItemModal(this.app, value.replace('++add++', ''), (newValue) => {
				// const currentSuggester = this.currentSuggester;
				this.currentSuggester.suggestion.push(newValue);
				// this.plugin.settings.suggesters.splice(this.currentIndex, 1, {
				// 	...this.currentSuggester,
				// 	suggestion: [...this.currentSuggester.suggestion, newValue],
				// });
				this.plugin.saveSettings();
			}).open();
			return;
		}

		this.editor.replaceRange(
			value + (this.hasBracketEnd ? '' : this.currentSuggester.trigger.after),
			{line: this.cursor.line, ch: this.context?.start.ch || this.cursor.ch},
			{
				line: this.cursor.line,
				ch: this.context?.end.ch || this.cursor.ch,
			},
		);
		this.editor.setCursor({
			line: this.cursor.line,
			ch: this.cursor.ch + value.length - (this.cursor.ch - (this.context?.start?.ch || this.cursor.ch)) + (this.hasBracketEnd ? 0 : this.currentSuggester.trigger.after.length),
		});
		this.close();
	}
}

class NewSuggestItemModal extends Modal {

	constructor(app: App, readonly defaultValue: string, readonly cb: (value: string) => void) {
		super(app);
	}

	onOpen() {
		this.modalEl.toggleClass('custom-suggester-add-new-modal', true);
		this.setTitle('Add new suggestion');

		const documentFragment = document.createDocumentFragment();
		const inputEl = documentFragment.createEl('input');
		inputEl.value = this.defaultValue === 'Add new' ? '' : this.defaultValue;
		const buttonEl = documentFragment.createEl('button', {text: 'Add'});
		buttonEl.addEventListener('click', () => {
			this.cb(inputEl.value);
			this.close();
		});
		this.setContent(documentFragment);
	}

	onClose() {
		this.contentEl.empty();
	}
}

