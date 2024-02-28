// Credits go to Liam's Periodic Notes Plugin: https://github.com/liamcain/obsidian-periodic-notes

import { FuzzyMatch, prepareFuzzySearch, TFolder } from 'obsidian';
import { TextInputSuggest } from './suggest';

export class FolderSuggest extends TextInputSuggest<TFolder> {
	fuzzySearchItemsOptimized(query: string, items: TFolder[]): FuzzyMatch<TFolder>[] {
		const preparedSearch = prepareFuzzySearch(query);

		return items
			.map((item) => {
				const result = preparedSearch(item.path);
				if (result) {
					return {
						item: item,
						match: result,
						score: result.score,
					};
				}
				return null;
			})
			.sort((a, b) => b?.score - a?.score)
			.filter(Boolean) as FuzzyMatch<TFolder>[];
	}

	getSuggestions(inputStr: string): TFolder[] {
		const abstractFiles = app.vault.getAllLoadedFiles();
		const folderFiles = abstractFiles.filter((file) => file instanceof TFolder) as TFolder[];
		const lowerCaseInputStr = inputStr.toLowerCase();

		return this.fuzzySearchItemsOptimized(lowerCaseInputStr, folderFiles).map((match) => match.item);
	}

	renderSuggestion(file: TFolder, el: HTMLElement): void {
		const basename = file.name;
		el.setText(basename === '' ? '/' : basename);
	}

	selectSuggestion(file: TFolder): void {
		this.inputEl.value = file.path === '' ? '/' : file.path;
		this.inputEl.trigger('change');
		this.close();
	}
}
