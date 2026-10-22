/**
 * Interprets the options of an `eisenhower` code block. Kept free of Obsidian imports for testing.
 */

export interface BlockScope {
	filePath?: string;
	folder?: string;
	tag?: string;
}

export type BlockResult =
	| { ok: true; scope: BlockScope; completed: boolean | undefined }
	| { ok: false; error: { kind: "invalid" } | { kind: "unknownKey"; key: string } | { kind: "noteMissing"; path: string } };

const KNOWN_KEYS = ["file", "folder", "tag", "vault", "completed"];

/** `tag: #work` is a YAML comment, so the hash is dropped before parsing. */
export function preprocessBlockSource(source: string): string {
	return source.replace(/^(\s*tag\s*:\s*)#/gim, "$1");
}

function asString(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim() !== "") return value.trim();
	if (typeof value === "number") return String(value);
	return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const v = value.trim().toLowerCase();
		if (v === "true" || v === "yes") return true;
		if (v === "false" || v === "no") return false;
	}
	return undefined;
}

/**
 * By default a block shows the tasks of the note it lives in. `vault: true`, `folder` or `tag`
 * widen it to other notes, and `file` points it at one specific note.
 */
export function interpretBlock(raw: unknown, sourcePath: string, resolveNote: (name: string) => string | null): BlockResult {
	if (raw === null || raw === undefined) return { ok: true, scope: { filePath: sourcePath }, completed: undefined };
	if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: { kind: "invalid" } };

	const options = raw as Record<string, unknown>;
	for (const key of Object.keys(options)) {
		if (!KNOWN_KEYS.includes(key)) return { ok: false, error: { kind: "unknownKey", key } };
	}

	const completed = asBoolean(options.completed);
	const folder = asString(options.folder);
	const tag = asString(options.tag);
	const file = asString(options.file);
	const vault = asBoolean(options.vault) === true;

	if (vault || folder || tag) {
		const scope: BlockScope = {};
		if (folder) scope.folder = folder;
		if (tag) scope.tag = tag;
		return { ok: true, scope, completed };
	}

	if (file && file.toLowerCase() !== "current") {
		const name = file.replace(/^\[\[|\]\]$/g, "");
		const path = resolveNote(name);
		if (!path) return { ok: false, error: { kind: "noteMissing", path: name } };
		return { ok: true, scope: { filePath: path }, completed };
	}

	return { ok: true, scope: { filePath: sourcePath }, completed };
}
