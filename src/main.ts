import { debounce, MarkdownRenderChild, parseYaml, Plugin, type Debouncer } from "obsidian";
import { interpretBlock, preprocessBlockSource } from "./block";
import { MatrixController } from "./controller";
import { strings } from "./i18n";
import { AddTaskModal } from "./modal";
import type { MatrixScope } from "./service";
import { DEFAULT_SETTINGS, EisenhowerSettingTab, type EisenhowerSettings } from "./settings";
import { normalizeRoot } from "./tasks";
import { MatrixView, VIEW_TYPE } from "./view";

const UNRATED_VALUES = ["triage", "important", "not-important"];

function sanitize(raw: unknown): EisenhowerSettings {
	const data = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Record<keyof EisenhowerSettings, unknown>>;
	const d = DEFAULT_SETTINGS;
	const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
	const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
	const days = typeof data.urgentWithinDays === "number" && Number.isFinite(data.urgentWithinDays) ? Math.min(14, Math.max(0, Math.round(data.urgentWithinDays))) : d.urgentWithinDays;
	const unrated = typeof data.unratedImportance === "string" && UNRATED_VALUES.includes(data.unratedImportance) ? (data.unratedImportance as EisenhowerSettings["unratedImportance"]) : d.unratedImportance;
	return {
		urgentWithinDays: days,
		urgentTags: str(data.urgentTags, d.urgentTags),
		importantTags: str(data.importantTags, d.importantTags),
		mediumIsImportant: bool(data.mediumIsImportant, d.mediumIsImportant),
		unratedImportance: unrated,
		pinRoot: normalizeRoot(str(data.pinRoot, d.pinRoot)),
		includeFolders: str(data.includeFolders, d.includeFolders),
		excludeFolders: str(data.excludeFolders, d.excludeFolders),
		showCompleted: bool(data.showCompleted, d.showCompleted),
		appendDoneDate: bool(data.appendDoneDate, d.appendDoneDate),
		inboxPath: str(data.inboxPath, d.inboxPath),
	};
}

class MatrixBlock extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private readonly plugin: EisenhowerPlugin,
		private readonly scope: MatrixScope,
		private readonly completed: boolean | undefined,
	) {
		super(containerEl);
	}

	onload(): void {
		const controller = new MatrixController(this.plugin, this.containerEl, this, { scope: this.scope, showCompleted: this.completed });
		controller.start();
	}
}

export default class EisenhowerPlugin extends Plugin {
	settings: EisenhowerSettings = sanitize(null);
	private readonly listeners = new Set<() => void>();
	private notifySoon: Debouncer<[], void> = debounce(() => this.listeners.forEach((fn) => fn()), 300, true);

	async onload(): Promise<void> {
		this.settings = sanitize(await this.loadData());
		const s = strings();

		this.registerView(VIEW_TYPE, (leaf) => new MatrixView(leaf, this));
		this.addRibbonIcon("layout-grid", s.openMatrix, () => void this.activateView());

		this.addCommand({
			id: "open-matrix",
			name: s.openMatrix,
			callback: () => void this.activateView(),
		});
		this.addCommand({
			id: "add-task",
			name: s.addTask,
			callback: () => new AddTaskModal(this.app, this, "triage", () => this.notifySoon()).open(),
		});

		this.registerMarkdownCodeBlockProcessor("eisenhower", (source, el, ctx) => {
			const t = strings();
			let raw: unknown;
			try {
				raw = parseYaml(preprocessBlockSource(source));
			} catch {
				el.createDiv({ cls: "eq-error", text: t.blockError("YAML") });
				return;
			}
			const result = interpretBlock(raw, ctx.sourcePath, (name) => this.app.metadataCache.getFirstLinkpathDest(name, ctx.sourcePath)?.path ?? null);
			if (!result.ok) {
				const e = result.error;
				const message = e.kind === "unknownKey" ? t.blockUnknownKey(e.key) : e.kind === "noteMissing" ? t.blockNoteMissing(e.path) : "YAML";
				el.createDiv({ cls: "eq-error", text: t.blockError(message) });
				return;
			}
			ctx.addChild(new MatrixBlock(el, this, result.scope, result.completed));
		});

		this.addSettingTab(new EisenhowerSettingTab(this.app, this));
	}

	/** Registers a callback for settings changes. Returns the function that removes it. */
	onSettingsChanged(callback: () => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.notifySoon();
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
	}
}
