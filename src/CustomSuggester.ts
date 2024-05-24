import * as obsidian from "obsidian";
import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	FuzzyMatch,
	Modal,
	prepareFuzzySearch,
	setIcon
} from "obsidian";
import { CustomSuggesterSettings } from "./customSuggesterSettings";
import { getFilesInFolder } from "./utils";
import CustomSuggesterPlugin from "./customSuggesterIndex";

export interface SuggesterInfo {
	name: string;
	enable: boolean;
	trigger: {
		before: string;
		after: string;
		matchRegex: string;
		removeBefore: boolean;
	},
	type: 'link' | 'text' | 'function';
	suggestion: string[] | string | (() => string[]);
}

export class CustomSuggester extends EditorSuggest<string> {
	editor: Editor;
	cursor: EditorPosition;
	plugin: CustomSuggesterPlugin;
	settings: CustomSuggesterSettings;

	hasBracketEnd = false;
	currentSuggester: SuggesterInfo;
	currentIndex = 0;


	private isLineStart = false;
	readonly suggesterType = 'custom-suggester';

	private currentSuggestions: string[] = [];

	public params: {
		app: App;
		obsidian: typeof obsidian;
	};

	constructor(app: App, plugin: CustomSuggesterPlugin) {
		super(app);
		this.plugin = plugin;
		this.settings = plugin.settings;
		this.params = {
			app: this.app,
			obsidian,
		};

		for (let i = 0; i < 10; i++) {
			this.scope.register(['Mod'], (i === 9 ? 0 : (i + 1)).toString(), () => {
				if (!this.currentSuggestions[i]) return;
				this.selectSuggestion(this.currentSuggestions[i], new MouseEvent('click'));
				this.close();
			});
		}

		this.plugin.settings.showInstructions && this.setInstructions([
			{
				command: '⌘+1~0',
				purpose: 'Select suggestion',
			}
		]);

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


	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public async runAndGetOutput(query: {
		trigger: string;
		query: string;
	}, code: string): Promise<any> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const AsyncFunction = Object.getPrototypeOf(
			async function () {
			}
		).constructor;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
		const userCode = new AsyncFunction(code);

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		return await userCode.bind({
			...this.params,
			query,
		}, this).call();
	}

	private containsPunctuation(text: string): boolean {
		const punctuationRegex = /[，；。？！【】（）《》<>“”‘’'"\s.,;?!\[\]\(\)<>]/;
		return punctuationRegex.test(text);
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
			const targetWord = suggester.trigger.before;
			const index = getBracketIndex(textUntilCursor, targetWord);

			if (index === 0 && textUntilCursor === '') continue;
			const targetText = textUntilCursor.slice(index);
			const afterTargetWord = textUntilCursor.slice(index + targetWord.length);

			// Check if the sliced text contains punctuation
			if (this.containsPunctuation(targetText) && !(targetText.startsWith(targetWord))) {
				continue;
			}

			const nextWhiteSpaceIndex = textAfterCursor.search(/^\s/);
			const cursorOffset = nextWhiteSpaceIndex === -1 ? getNextBracketIndex(textAfterCursor, targetWord) : nextWhiteSpaceIndex;


			if (targetText) {
				const matchedText = targetText;
				console.log(targetText, targetWord, afterTargetWord);


				if (!matchedText) return null;
				const removeBefore = suggester.trigger.removeBefore ? suggester.trigger.before.length : 0;
				this.currentSuggester = suggester;
				this.currentIndex = index;

				if ((cursor.ch - matchedText.length - removeBefore) === 0) {
					this.isLineStart = true;
				}

				return {
					start: {
						line: currentLineNum,
						ch: cursor.ch - (afterTargetWord || '').length - removeBefore,
					},
					end: {
						line: currentLineNum,
						ch: cursor.ch + cursorOffset,
					},
					query: afterTargetWord || '',
				};
			}
		}

		return null;
	}

	async getSuggestions(context: EditorSuggestContext): Promise<string[]> {
		const lowerCaseInputStr = context.query.toLocaleLowerCase();

		console.log(context);
		let data: string[] = [];
		switch (this.currentSuggester.type) {
			case "text":
				data = this.currentSuggester.suggestion as string[];
				break;
			case "link":
				const folder = this.app.vault.getFolderByPath(this.currentSuggester.suggestion as string);
				if (folder) {
					const files = getFilesInFolder(folder);
					data = files.map((file) => this.app.metadataCache.fileToLinktext(file, '') as string);
				}
				break;
			case "function":
				// data = (this.currentSuggester.suggestion as () => string[]).call(this);
				// const a = new Function('context', this.currentSuggester.suggestion as string);
				data = await this.runAndGetOutput({
					trigger: this.currentSuggester.trigger.before,
					query: context.query,
				}, this.currentSuggester.suggestion as string) as string[] || [];
				break;
			default:
				data = this.currentSuggester.suggestion as string[];
				break;
		}


		if (data.includes(lowerCaseInputStr)) return [];

		if (context.query.length > this.plugin.settings.maxMatchWordlength) return [];
		if (context.query === this.currentSuggester.trigger.before) return [...data];

		const results = this.fuzzySearchItemsOptimized(lowerCaseInputStr, data).map((match) => match.item);
		const renewResults = this.plugin.settings.showAddNewButton && this.currentSuggester.type === 'text' ? [...results, '++add++' + (context.query.toLocaleLowerCase() || 'Add new')] : results;

		// this.suggestions = renewResults;
		this.currentSuggestions = renewResults;

		console.log(this.currentSuggestions);

		return renewResults;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.toggleClass('custom-suggester-item', true);
		if (value.startsWith('++add++') && this.currentSuggester.type === 'text') {
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
		console.log(this, this.context);

		if (value.startsWith('++add++') && this.currentSuggester.type === 'text') {
			evt.preventDefault();
			new NewSuggestItemModal(this.app, value.replace('++add++', ''), (newValue) => {
				(this.currentSuggester.suggestion as string[]).push(newValue);
				this.plugin.saveSettings();
			}).open();
			return;
		}

		let target = value + (this.hasBracketEnd ? '' : this.currentSuggester.trigger.after);
		if (this.currentSuggester.type === 'link') {
			target = `[[${value}]]`;
		}

		const cursorOffset = this.currentSuggester.type === 'link' ? 4 : 0;
		const startCursor = (this.isLineStart && this.currentSuggester.trigger.removeBefore ? 0 : (this.context?.start?.ch || this.cursor.ch)) + cursorOffset;

		this.editor.replaceRange(
			target,
			{
				line: this.cursor.line,
				ch: this.isLineStart && this.currentSuggester.trigger.removeBefore ? 0 : (this.context?.start.ch || this.cursor.ch)
			},
			{
				line: this.cursor.line,
				ch: this.context?.end.ch || this.cursor.ch,
			},
		);

		this.editor.setCursor({
			line: this.cursor.line,
			ch: this.cursor.ch + value.length - (this.cursor.ch - startCursor) + (this.hasBracketEnd ? 0 : this.currentSuggester.trigger.after.length),
		});
		this.isLineStart = false;

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
