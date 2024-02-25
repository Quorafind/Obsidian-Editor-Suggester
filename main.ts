import {
	App, debounce, Editor, EditorPosition, EditorSuggest, EditorSuggestContext,
	EditorSuggestTriggerInfo, FuzzyMatch, Plugin, PluginSettingTab, prepareFuzzySearch, Setting
} from 'obsidian';

interface TriggerInfo {
	before: string;
	after: string;
	matchRegex: string;
	suggestion: string[];
}

interface CustomSuggesterSettings {
	triggers: TriggerInfo[];
}

const DEFAULT_SETTINGS = {
	triggers: [
		{
			before: '【',
			after: '】',
			matchRegex: '【([^】]*)$',
			suggestion: ["已完成，等待确认",
				"交底制作/沟通中",
				"已移交流程处理",
				"已放弃",
				"已移交代理人",
				"已完成，客户确认"],
		},
	],
};

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
	matchedTrigger: TriggerInfo;

	readonly suggesterType = 'custom-suggester';

	constructor(app: App, plugin: CustomSuggesterPlugin) {
		super(app);
		this.plugin = plugin;
		this.settings = plugin.settings;
	}

	updateSettings(settings: CustomSuggesterSettings) {
		this.settings = settings;
		console.log(this.settings);
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

		for (const trigger of this.settings.triggers) {
			const index = getBracketIndex(textUntilCursor, trigger.after || trigger.before);
			// console.log(index, trigger.after);
			const targetText = textUntilCursor.slice(index);
			// console.log(trigger.matchRegex, targetText);
			const match = targetText.match(new RegExp(trigger.matchRegex));

			// console.log(targetText, match, trigger.matchRegex);

			const nextWhiteSpaceIndex = textAfterCursor.search(/^\s/);
			const cursorOffset = nextWhiteSpaceIndex === -1 ? getNextBracketIndex(textAfterCursor, trigger.after || trigger.before) : nextWhiteSpaceIndex;

			if (match) {
				const matchedText = match[1];
				this.matchedTrigger = trigger;

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
		const data = this.matchedTrigger.suggestion;

		// console.log(data, lowerCaseInputStr);

		if (data.includes(lowerCaseInputStr)) return [];

		return this.fuzzySearchItemsOptimized(lowerCaseInputStr, data).map((match) => match.item);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		this.editor.replaceRange(
			value + (this.hasBracketEnd ? '' : this.matchedTrigger.after),
			{line: this.cursor.line, ch: this.context?.start.ch || this.cursor.ch},
			{
				line: this.cursor.line,
				ch: this.context?.end.ch || this.cursor.ch,
			},
		);
		this.editor.setCursor({
			line: this.cursor.line,
			ch: this.cursor.ch + value.length - (this.cursor.ch - (this.context?.start?.ch || this.cursor.ch)) + (this.hasBracketEnd ? 0 : this.matchedTrigger.after.length),
		});
		this.close();
	}
}

export class CustomSuggesterSettingTab extends PluginSettingTab {
	plugin: CustomSuggesterPlugin;

	constructor(app: App, plugin: CustomSuggesterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	debounceApplySettingsUpdate = debounce(
		async () => {
			await this.plugin.saveSettings();
		},
		1000,
		true,
	);

	applySettingsUpdate() {
		this.debounceApplySettingsUpdate();
	}

	async display() {
		await this.plugin.loadSettings();

		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: '📍 Custom Suggester'});

		new Setting(containerEl)
			.setName('Config trigger method')
			.setDesc('Config the trigger method for the suggester.')
			.addTextArea((text) => {
				text.inputEl.toggleClass('custom-suggester-textarea', true);
				text
					.setPlaceholder('Trigger method')
					.setValue(JSON.stringify(this.plugin.settings.triggers, null, 4))
					.onChange(async (value) => {
						try {
							this.plugin.settings.triggers = JSON.parse(value);
							this.applySettingsUpdate();
						} catch (e) {
							console.error(e);
						}
					});
			});
	}
}

