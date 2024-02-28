import { TFile, TFolder, Vault } from "obsidian";

/**
 * getFilesInFolder recursively looks for all files in a given folder.
 */
export function getFilesInFolder(folder: TFolder): TFile[] {
	const result: TFile[] = [];
	Vault.recurseChildren(folder, (file) => {
		if (file instanceof TFile) {
			result.push(file);
		}
	});
	return result;
}
