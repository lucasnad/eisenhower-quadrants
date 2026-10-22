import { App, normalizePath, parseFrontMatterTags, TFile } from "obsidian";
import type { EisenhowerSettings } from "./settings";
import { extractTasks, replaceTaskLine, splitList, type Task } from "./tasks";

export interface MatrixScope {
	/** Read only this note. */
	filePath?: string;
	/** Read only notes in this folder. */
	folder?: string;
	/** Keep only tasks in notes or on lines carrying this tag. */
	tag?: string;
}

function normalizeFolder(folder: string): string {
	return folder.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function inFolder(path: string, folder: string): boolean {
	return path === folder || path.startsWith(`${folder}/`);
}

export function isInScope(path: string, settings: EisenhowerSettings, scope: MatrixScope): boolean {
	if (scope.filePath) return path === scope.filePath;
	const excluded = settings.excludeFolders.split(",").map(normalizeFolder).filter(Boolean);
	if (excluded.some((f) => inFolder(path, f))) return false;
	if (scope.folder) return inFolder(path, normalizeFolder(scope.folder));
	const included = settings.includeFolders.split(",").map(normalizeFolder).filter(Boolean);
	return included.length === 0 || included.some((f) => inFolder(path, f));
}

function tagMatches(tags: string[], wanted: string): boolean {
	return tags.some((t) => {
		const lower = t.replace(/^#/, "").toLowerCase();
		return lower === wanted || lower.startsWith(`${wanted}/`);
	});
}

export async function scanTasks(app: App, settings: EisenhowerSettings, scope: MatrixScope): Promise<Task[]> {
	const wantedTag = scope.tag ? splitList(scope.tag)[0] : undefined;
	const files = app.vault.getMarkdownFiles().filter((f) => isInScope(f.path, settings, scope));

	const perFile = await Promise.all(
		files.map(async (file): Promise<Task[]> => {
			const cache = app.metadataCache.getFileCache(file);
			const lines = (cache?.listItems ?? []).filter((li) => li.task !== undefined).map((li) => li.position.start.line);
			if (lines.length === 0) return [];
			// A tag in the note's frontmatter tags every task in it; an inline tag only tags its own line.
			const fileHasTag = wantedTag && cache ? tagMatches(parseFrontMatterTags(cache.frontmatter) ?? [], wantedTag) : false;
			const content = await app.vault.cachedRead(file);
			const tasks = extractTasks(file.path, content, lines, settings.pinRoot);
			if (!wantedTag || fileHasTag) return tasks;
			return tasks.filter((t) => tagMatches(t.tags, wantedTag));
		}),
	);
	return perFile.flat();
}

/**
 * Rewrites one task line in place. Returns false when the line is no longer where the matrix
 * saw it, so a stale card can never overwrite a different line.
 */
export async function updateTaskLine(app: App, task: Task, transform: (line: string) => string): Promise<boolean> {
	const file = app.vault.getAbstractFileByPath(task.path);
	if (!(file instanceof TFile)) return false;

	let updated = false;
	await app.vault.process(file, (data) => {
		const next = replaceTaskLine(data, task.line, task.raw, transform);
		if (next === null) return data;
		updated = true;
		return next;
	});
	return updated;
}

export async function appendToInbox(app: App, path: string, line: string): Promise<TFile> {
	let target = normalizePath(path.trim() || "Eisenhower inbox.md");
	if (!target.toLowerCase().endsWith(".md")) target += ".md";

	const folder = target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : "";
	if (folder && !app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);

	let file = app.vault.getFileByPath(target);
	if (!file) {
		try {
			return await app.vault.create(target, `${line}\n`);
		} catch {
			// Created in the meantime (for example by sync); append to it instead.
			file = app.vault.getFileByPath(target);
			if (!file) throw new Error(`Could not create ${target}`);
		}
	}
	await app.vault.process(file, (data) => (data === "" || data.endsWith("\n") ? `${data}${line}\n` : `${data}\n${line}\n`));
	return file;
}
