import * as obsidian from "obsidian";
import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	FuzzyMatch,
	Modal, Notice,
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

export class CustomSuggester extends EditorSuggest<{
	label: string;
	value: string;
}> {
	editor: Editor;
	cursor: EditorPosition;
	plugin: CustomSuggesterPlugin;
	settings: CustomSuggesterSettings;

	hasBracketEnd = false;
	currentSuggester: SuggesterInfo;
	currentIndex = 0;


	private isLineStart = false;
	readonly suggesterType = 'custom-suggester';

	private currentSuggestions: {
		label: string;
		value: string;
	}[] = [];

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
				console.log(this.currentSuggestions[i]);
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

	fuzzySearchItemsOptimized(query: string, items: {
		label: string;
		value: string;
	}[]): FuzzyMatch<{
		label: string;
		value: string;
	}>[] {
		const preparedSearch = prepareFuzzySearch(query);

		return items
			.map((item) => {
				const result = preparedSearch(item.value);
				console.log(result, item, query);
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
			.filter(Boolean) as FuzzyMatch<{
			label: string;
			value: string;
		}>[];
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

		const getBestMatchSuggesters = (text: string) => {
			const matchedSuggesters = this.settings.suggesters.filter((s) => s.enable || !s.trigger.before).filter((s) => text.lastIndexOf(s.trigger.before) !== -1);
			return matchedSuggesters.sort((a, b) => b.trigger.before.length - a.trigger.before.length);
		};

		for (const suggester of getBestMatchSuggesters(textUntilCursor)) {
			const targetWord = suggester.trigger.before;
			const index = getBracketIndex(textUntilCursor, targetWord);

			// Check if has other longer target word and also matched
			// If so skip the current target word


			if (index === 0 && textUntilCursor === '') continue;
			const targetText = textUntilCursor.slice(index);
			const afterTargetWord = textUntilCursor.slice(index + targetWord.length);

			if (afterTargetWord.length > this.plugin.settings.maxMatchWordlength) continue;

			// Check if the sliced text contains punctuation
			if ((this.containsPunctuation(targetText) && !(targetText.startsWith(targetWord))) || (suggester.trigger.after && targetText.contains(suggester.trigger.after))) {
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

				console.log(cursor.ch, matchedText.length, removeBefore);

				if ((cursor.ch - matchedText.length) === 0) {
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

	async getSuggestions(context: EditorSuggestContext): Promise<{ label: string; value: string; }[]> {
		const lowerCaseInputStr = context.query.toLocaleLowerCase();

		console.log(lowerCaseInputStr);

		let data: { label: string; value: string; }[] = [];
		switch (this.currentSuggester.type) {
			case "text":
				data = (this.currentSuggester.suggestion as string[]).map(s => ({label: s, value: s}));
				break;
			case "link":
				const folder = this.app.vault.getFolderByPath(this.currentSuggester.suggestion as string);
				if (folder) {
					const files = getFilesInFolder(folder);
					data = files.map((file) => ({
						label: this.app.metadataCache.fileToLinktext(file, ''),
						value: this.app.metadataCache.fileToLinktext(file, '')
					}));
				}
				break;
			case "function":
				const result = await this.runAndGetOutput({
					trigger: this.currentSuggester.trigger.before,
					query: context.query,
				}, this.currentSuggester.suggestion as string);
				console.log(result);
				data = result ? result.map((s: string | {
					label: string;
					value: string;
				}) => {
					console.log(s);
					if (typeof s === 'string') {
						return {label: s, value: s};
					}
					return s;
				}) : [];
				break;
			default:
				data = (this.currentSuggester.suggestion as string[]).map(s => ({label: s, value: s}));
				break;
		}

		// if (!lowerCaseInputStr) return [];
		if (lowerCaseInputStr && data.some((d) => d.label.toLocaleLowerCase() === lowerCaseInputStr.trim())) return [];

		if (context.query.length > this.plugin.settings.maxMatchWordlength) return [];
		if (context.query === this.currentSuggester.trigger.before) return data;

		const results = this.fuzzySearchItemsOptimized(lowerCaseInputStr, data);
		const renewResults = results.map((match) => ({
			label: match.item.label,
			value: match.item.value
		}));
		if (this.plugin.settings.showAddNewButton && this.currentSuggester.type === 'text') {
			renewResults.push({label: 'Add new', value: '++add++' + (context.query.toLocaleLowerCase() || 'Add new')});
		}

		this.currentSuggestions = renewResults;
		return renewResults;
	}

	renderSuggestion(suggestion: { label: string; value: string }, el: HTMLElement): void {
		el.toggleClass('custom-suggester-item', true);
		if (suggestion.value.startsWith('++add++') && this.currentSuggester.type === 'text') {
			const iconEl = el.createEl("span", {
				cls: "custom-suggester-item-icon",
			});
			const textEl = el.createEl("span");
			setIcon(iconEl, 'plus');
			textEl.setText(suggestion.label.replace('++add++', ''));
			return;
		}
		console.log(suggestion.label, suggestion.value);
		el.setText(suggestion.label);
	}

	selectSuggestion(suggestion: { label: string; value: string }, evt: MouseEvent | KeyboardEvent): void {
		if (suggestion.value.startsWith('++add++') && this.currentSuggester.type === 'text') {
			evt.preventDefault();
			new NewSuggestItemModal(this.app, suggestion.label.replace('++add++', ''), (newValue) => {
				(this.currentSuggester.suggestion as string[]).push(newValue);
				this.plugin.saveSettings();
			}).open();
			return;
		}

		let target = suggestion.value + (this.hasBracketEnd ? '' : this.currentSuggester.trigger.after);
		if (this.currentSuggester.type === 'link') {
			target = `[[${suggestion.label}]]`;
		}

		const cursorOffset = this.currentSuggester.type === 'link' ? 4 : 0;
		const startCursor = (this.isLineStart && this.currentSuggester.trigger.removeBefore ? 0 : (this.context?.start?.ch || this.cursor.ch)) + cursorOffset;

		console.log(target, this.cursor, startCursor, this.context?.start?.ch, this.cursor.ch, this.isLineStart, this.currentSuggester.trigger.removeBefore, this.currentSuggester.trigger.after.length, this.hasBracketEnd);

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
			ch: this.cursor.ch + suggestion.value.length - (this.cursor.ch - startCursor) + (this.hasBracketEnd ? 0 : this.currentSuggester.trigger.after.length),
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
		this.setTitle('Add new item');

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
