/**
 * Pure task logic: parsing checkbox lines, deciding the quadrant, and rewriting lines.
 * Nothing here imports from Obsidian, so it can be unit tested in plain Node.
 */

export type Quadrant = "do" | "schedule" | "delegate" | "eliminate";
export type Bucket = Quadrant | "triage";
export type Priority = "highest" | "high" | "medium" | "low" | "lowest";
export type UnratedImportance = "triage" | "important" | "not-important";

export const QUADRANTS: readonly Quadrant[] = ["do", "schedule", "delegate", "eliminate"];

export interface ClassifyOptions {
	/** Local date, YYYY-MM-DD. */
	today: string;
	/** A task is urgent when it is due in this many days or fewer (or overdue). */
	urgentWithinDays: number;
	urgentTags: string[];
	importantTags: string[];
	mediumIsImportant: boolean;
	unratedImportance: UnratedImportance;
}

export interface TaskInfo {
	status: string;
	done: boolean;
	cancelled: boolean;
	/** Text to show on the card, with plugin and Tasks-style metadata removed. */
	text: string;
	tags: string[];
	due: string | null;
	priority: Priority | null;
	recurring: boolean;
	pinned: Quadrant | null;
}

export interface Task extends TaskInfo {
	path: string;
	line: number;
	/** The exact line as found in the file (without the line ending). */
	raw: string;
}

export interface Placement {
	bucket: Bucket;
	pinned: boolean;
	urgent: boolean;
	urgentBy: "overdue" | "soon" | "tag" | null;
	important: boolean | null;
	importantBy: "tag" | "priority" | "default" | null;
	daysUntilDue: number | null;
}

const LINE_RE = /^(\s*(?:>\s*)*)([-*+]|\d+[.)])\s+\[(.)\]\s+(.*)$/;
const BLOCK_ID_RE = /^(.*?)(\s+\^[A-Za-z0-9-]+)\s*$/s;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PRIORITY_EMOJI: Record<string, Priority> = {
	"🔺": "highest",
	"⏫": "high",
	"🔼": "medium",
	"🔽": "low",
	"⏬": "lowest",
};

export function normalizeRoot(root: string): string {
	const cleaned = root.trim().replace(/^#+/, "").replace(/\/+$/, "").trim();
	return cleaned.length > 0 ? cleaned : "eisenhower";
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pinTagRegex(root: string, flags: string): RegExp {
	const names = QUADRANTS.join("|");
	return new RegExp(`(\\s+|^)#${escapeRegExp(normalizeRoot(root))}/(?:${names})(?![\\p{L}\\p{N}_/-])`, flags);
}

export function splitList(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim().replace(/^#+/, "").toLowerCase())
		.filter((s) => s.length > 0);
}

export function extractTags(body: string): string[] {
	const tags: string[] = [];
	for (const m of body.matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
		const tag = m[2];
		if (tag && /[^\d/]/.test(tag)) tags.push(tag);
	}
	return tags;
}

function extractDue(body: string): string | null {
	const emoji = body.match(/📅\s*(\d{4}-\d{2}-\d{2})/u);
	if (emoji?.[1]) return emoji[1];
	const field = body.match(/[[(]\s*due\s*::\s*(\d{4}-\d{2}-\d{2})\s*[\])]/i);
	if (field?.[1]) return field[1];
	return null;
}

function extractPriority(body: string): Priority | null {
	for (const [emoji, priority] of Object.entries(PRIORITY_EMOJI)) {
		if (body.includes(emoji)) return priority;
	}
	return null;
}

function displayText(body: string, root: string): string {
	return body
		.replace(pinTagRegex(root, "giu"), "$1")
		.replace(/(?:📅|⏳|🛫|➕|✅|❌)\s*\d{4}-\d{2}-\d{2}/gu, "")
		.replace(/[🔺⏫🔼🔽⏬]/gu, "")
		.replace(/🔁[^\p{Extended_Pictographic}#]*/gu, "")
		.replace(/[[(]\s*[\w-]+\s*::[^\])]*[\])]/g, "")
		.replace(/\s\^[A-Za-z0-9-]+\s*$/, "")
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]#|]+)[^\]]*\]\]/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/\s+/g, " ")
		.trim();
}

export function parseTask(line: string, root: string): TaskInfo | null {
	const m = LINE_RE.exec(line);
	if (!m) return null;
	const status = m[3] ?? " ";
	const body = m[4] ?? "";
	const tags = extractTags(body);

	let pinned: Quadrant | null = null;
	const normalizedRoot = normalizeRoot(root).toLowerCase();
	for (const tag of tags) {
		const lower = tag.toLowerCase();
		for (const q of QUADRANTS) {
			if (lower === `${normalizedRoot}/${q}`) pinned = q;
		}
	}

	return {
		status,
		done: status === "x" || status === "X",
		cancelled: status === "-",
		text: displayText(body, root),
		tags,
		due: extractDue(body),
		priority: extractPriority(body),
		recurring: /🔁|[[(]\s*repeat\s*::/iu.test(body),
		pinned,
	};
}

/** Parses the given 0-based line numbers of a file. Lines that are not tasks are skipped. */
export function extractTasks(path: string, content: string, lineNumbers: number[], root: string): Task[] {
	const lines = content.split(/\r?\n/);
	const tasks: Task[] = [];
	for (const n of lineNumbers) {
		const raw = lines[n];
		if (raw === undefined) continue;
		const info = parseTask(raw, root);
		if (info) tasks.push({ ...info, path, line: n, raw });
	}
	return tasks;
}

export function isValidDate(value: string): boolean {
	if (!DATE_RE.test(value)) return false;
	const [y, m, d] = value.split("-").map(Number) as [number, number, number];
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function todayISO(now: Date = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). Both are YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
	const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
	const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
	return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function classify(info: TaskInfo, o: ClassifyOptions): Placement {
	const lowerTags = info.tags.map((t) => t.toLowerCase());

	let daysUntilDue: number | null = null;
	let urgentBy: Placement["urgentBy"] = null;
	if (info.due && isValidDate(info.due) && isValidDate(o.today)) {
		daysUntilDue = daysBetween(o.today, info.due);
		if (daysUntilDue < 0) urgentBy = "overdue";
		else if (daysUntilDue <= o.urgentWithinDays) urgentBy = "soon";
	}
	if (!urgentBy && o.urgentTags.some((t) => lowerTags.includes(t))) urgentBy = "tag";

	let important: boolean | null = null;
	let importantBy: Placement["importantBy"] = null;
	if (o.importantTags.some((t) => lowerTags.includes(t))) {
		important = true;
		importantBy = "tag";
	} else if (info.priority) {
		importantBy = "priority";
		if (info.priority === "highest" || info.priority === "high") important = true;
		else if (info.priority === "medium") important = o.mediumIsImportant;
		else important = false;
	} else if (o.unratedImportance !== "triage") {
		important = o.unratedImportance === "important";
		importantBy = "default";
	}

	const urgent = urgentBy !== null;
	let bucket: Bucket;
	if (info.pinned) bucket = info.pinned;
	else if (important === null) bucket = "triage";
	else if (urgent) bucket = important ? "do" : "delegate";
	else bucket = important ? "schedule" : "eliminate";

	return { bucket, pinned: info.pinned !== null, urgent, urgentBy, important, importantBy, daysUntilDue };
}

const PRIORITY_RANK: Record<Priority, number> = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };

/** Overdue and soonest first, undated last; then higher priority; then a stable file order. */
export function compareTasks(a: Task, b: Task): number {
	const dueA = a.due ?? "9999-99-99";
	const dueB = b.due ?? "9999-99-99";
	if (dueA !== dueB) return dueA < dueB ? -1 : 1;
	const pa = a.priority ? PRIORITY_RANK[a.priority] : 2.5;
	const pb = b.priority ? PRIORITY_RANK[b.priority] : 2.5;
	if (pa !== pb) return pa - pb;
	if (a.path !== b.path) return a.path < b.path ? -1 : 1;
	return a.line - b.line;
}

function appendToken(body: string, token: string): string {
	const m = BLOCK_ID_RE.exec(body);
	if (m) return `${(m[1] ?? "").replace(/\s+$/, "")} ${token}${m[2] ?? ""}`;
	return `${body.replace(/\s+$/, "")} ${token}`;
}

function rewrite(line: string, fn: (parts: { prefix: string; bullet: string; status: string; body: string }) => string): string {
	const m = LINE_RE.exec(line);
	if (!m) return line;
	return fn({ prefix: m[1] ?? "", bullet: m[2] ?? "-", status: m[3] ?? " ", body: m[4] ?? "" });
}

/**
 * Completes an open task or reopens a completed one.
 * `doneDate` adds a Tasks-style done date when completing; pass null to skip it.
 */
export function toggleDoneLine(line: string, doneDate: string | null): string {
	return rewrite(line, ({ prefix, bullet, status, body }) => {
		const isDone = status === "x" || status === "X";
		if (isDone) {
			const reopened = body.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u, "");
			return `${prefix}${bullet} [ ] ${reopened}`;
		}
		const completed = doneDate && !/✅/u.test(body) ? appendToken(body, `✅ ${doneDate}`) : body;
		return `${prefix}${bullet} [x] ${completed}`;
	});
}

/** Pins the task to a quadrant with `#root/quadrant`, or removes the pin when `quadrant` is null. */
export function setPinLine(line: string, root: string, quadrant: Quadrant | null): string {
	return rewrite(line, ({ prefix, bullet, status, body }) => {
		const stripped = body.replace(pinTagRegex(root, "giu"), "").replace(/^\s+/, "");
		const next = quadrant ? appendToken(stripped, `#${normalizeRoot(root)}/${quadrant}`) : stripped;
		return `${prefix}${bullet} [${status}] ${next}`;
	});
}

/**
 * Replaces the task line `raw` (expected at 0-based `line`) with `transform(raw)`.
 * If the line moved, the closest identical line is used. Returns null when no line matches,
 * so a stale card can never overwrite a different line. Line endings are preserved.
 */
export function replaceTaskLine(data: string, line: number, raw: string, transform: (line: string) => string): string | null {
	// Splitting with a capture group keeps each line ending exactly as it was.
	const parts = data.split(/(\r?\n)/);
	let index = line * 2;
	if (parts[index] !== raw) {
		let best = -1;
		for (let i = 0; i < parts.length; i += 2) {
			if (parts[i] === raw && (best === -1 || Math.abs(i - line * 2) < Math.abs(best - line * 2))) best = i;
		}
		if (best === -1) return null;
		index = best;
	}
	parts[index] = transform(raw);
	return parts.join("");
}

export function buildTaskLine(text: string, due: string | null, quadrant: Quadrant | null, root: string): string {
	const clean = text.replace(/\s+/g, " ").trim();
	let line = `- [ ] ${clean}`;
	if (due && isValidDate(due)) line += ` 📅 ${due}`;
	if (quadrant) line += ` #${normalizeRoot(root)}/${quadrant}`;
	return line;
}
