import { ItemView, WorkspaceLeaf } from "obsidian";
import { MatrixController } from "./controller";
import { strings } from "./i18n";
import type EisenhowerPlugin from "./main";

export const VIEW_TYPE = "eisenhower-quadrants-matrix";

export class MatrixView extends ItemView {
	private controller: MatrixController | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: EisenhowerPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return strings().viewTitle;
	}

	getIcon(): string {
		return "layout-grid";
	}

	async onOpen(): Promise<void> {
		const s = strings();
		const root = this.contentEl;
		root.empty();
		root.addClass("eq-view");

		const toolbar = root.createDiv({ cls: "eq-toolbar" });
		const search = toolbar.createEl("input", { cls: "eq-search", attr: { type: "search", placeholder: s.filterPlaceholder, "aria-label": s.filterPlaceholder } });
		const host = root.createDiv({ cls: "eq-host" });

		const controller = new MatrixController(this.plugin, host, this, { scope: {} });
		this.controller = controller;
		search.addEventListener("input", () => controller.setFilter(search.value));

		this.addAction("plus", s.addTask, () => controller.openAddModal("triage"));
		const completed = this.addAction("eye", s.showCompleted, () => {
			this.plugin.settings.showCompleted = !this.plugin.settings.showCompleted;
			completed.toggleClass("is-active", this.plugin.settings.showCompleted);
			void this.plugin.saveSettings();
		});
		completed.toggleClass("is-active", this.plugin.settings.showCompleted);
		this.addAction("refresh-cw", s.refresh, () => void controller.refresh());

		controller.start();
		await Promise.resolve();
	}

	async onClose(): Promise<void> {
		this.controller = null;
		await Promise.resolve();
	}
}
