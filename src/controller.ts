import { Component, debounce, Keymap, Menu, MarkdownView, Notice, setIcon, TFile, type Debouncer } from "obsidian";
import type EisenhowerPlugin from "./main";
import { AddTaskModal } from "./modal";
import { bucketName, strings, type Strings } from "./i18n";
import { isInScope, scanTasks, updateTaskLine, type MatrixScope } from "./service";
import {
	classify,
	compareTasks,
	QUADRANTS,
	setPinLine,
	splitList,
	todayISO,
	toggleDoneLine,
	type Bucket,
	type ClassifyOptions,
	type Placement,
	type Quadrant,
	type Task,
} from "./tasks";

export interface ControllerOptions {
	scope: MatrixScope;
	/** Overrides the "show completed" setting, used by code blocks. */
	showCompleted?: boolean;
}

interface Placed {
	task: Task;
	placement: Placement;
}

const PAGE_SIZE = 60;
const TAG_SPLIT = /(#[\p{L}\p{N}_/-]+)/u;

export function classifyOptions(plugin: EisenhowerPlugin): ClassifyOptions {
	const s = plugin.settings;
	return {
		today: todayISO(),
		urgentWithinDays: s.urgentWithinDays,
		urgentTags: splitList(s.urgentTags),
		importantTags: splitList(s.importantTags),
		mediumIsImportant: s.mediumIsImportant,
		unratedImportance: s.unratedImportance,
	};
}

function dueLabel(s: Strings, days: number, due: string): string {
	if (days < 0) return s.overdue(-days);
	if (days === 0) return s.dueToday;
	if (days === 1) return s.dueTomorrow;
	if (days <= 14) return s.dueIn(days);
	return due;
}

function describeWhy(s: Strings, p: Placement): string {
	const parts: string[] = [];
	if (p.pinned && p.bucket !== "triage") parts.push(s.whyPinned(s.quadrantName[p.bucket]));
	parts.push(p.urgentBy ? s.whyUrgent[p.urgentBy] : s.whyNotUrgent);
	if (p.important === null) parts.push(s.whyUnrated);
	else if (p.important) parts.push(s.whyImportant[p.importantBy ?? "default"]);
	else parts.push(s.whyNotImportant[p.importantBy === "priority" ? "priority" : "default"]);
	return parts.join(" · ");
}

function renderText(parent: HTMLElement, text: string): void {
	text.split(TAG_SPLIT).forEach((part, i) => {
		if (!part) return;
		if (i % 2 === 1) parent.createSpan({ cls: "eq-tag", text: part });
		else parent.appendText(part);
	});
}

/**
 * Loads tasks, draws the matrix into `host` and writes changes back to the notes.
 * Used by both the matrix view and the `eisenhower` code block.
 */
export class MatrixController {
	private tasks: Task[] = [];
	private loaded = false;
	private filter = "";
	private dragged: Placed | null = null;
	private readonly expanded = new Set<Bucket>();
	private readonly body: HTMLElement;
	private readonly refreshSoon: Debouncer<[], void>;
	private loadId = 0;
	private destroyed = false;
	private day = todayISO();

	constructor(
		private readonly plugin: EisenhowerPlugin,
		host: HTMLElement,
		private readonly component: Component,
		private readonly options: ControllerOptions,
	) {
		this.body = host.createDiv({ cls: "eq-root" });
		this.refreshSoon = debounce(() => void this.refresh(), 400, true);
	}

	start(): void {
		const { app } = this.plugin;
		const c = this.component;
		const touches = (path: string): boolean => !!this.options.scope.tag || isInScope(path, this.plugin.settings, this.options.scope);

		c.registerEvent(app.metadataCache.on("changed", (file) => touches(file.path) && this.refreshSoon()));
		c.registerEvent(app.metadataCache.on("deleted", (file) => touches(file.path) && this.refreshSoon()));
		c.registerEvent(app.metadataCache.on("resolved", () => this.refreshSoon()));
		c.registerEvent(app.vault.on("rename", () => this.refreshSoon()));
		c.register(this.plugin.onSettingsChanged(() => this.refreshSoon()));
		// Urgency depends on today's date, so a matrix left open overnight must recompute.
		c.registerInterval(
			window.setInterval(() => {
				if (todayISO() !== this.day) this.refreshSoon();
			}, 60_000),
		);
		c.register(() => {
			this.destroyed = true;
			this.refreshSoon.cancel();
		});

		app.workspace.onLayoutReady(() => void this.refresh());
	}

	setFilter(text: string): void {
		this.filter = text;
		if (this.loaded) this.render();
	}

	openAddModal(bucket: Bucket): void {
		new AddTaskModal(this.plugin.app, this.plugin, bucket, () => this.refreshSoon()).open();
	}

	async refresh(): Promise<void> {
		const id = ++this.loadId;
		const tasks = await scanTasks(this.plugin.app, this.plugin.settings, this.options.scope);
		if (this.destroyed || id !== this.loadId) return;
		this.tasks = tasks;
		this.loaded = true;
		this.day = todayISO();
		this.render();
	}

	private showCompleted(): boolean {
		return this.options.showCompleted ?? this.plugin.settings.showCompleted;
	}

	private render(): void {
		const s = strings();
		const body = this.body;
		const previousScroll = new Map<string, number>();
		body.querySelectorAll<HTMLElement>(".eq-list[data-bucket]").forEach((el) => previousScroll.set(el.dataset.bucket ?? "", el.scrollTop));
		body.empty();

		if (this.tasks.length === 0) {
			body.createDiv({ cls: "eq-empty", text: s.empty });
			return;
		}

		const options = classifyOptions(this.plugin);
		const query = this.filter.trim().toLowerCase();
		const showCompleted = this.showCompleted();
		const placed: Record<Bucket, Placed[]> = { do: [], schedule: [], delegate: [], eliminate: [], triage: [] };

		for (const task of this.tasks) {
			const finished = task.done || task.cancelled;
			if (finished && !showCompleted) continue;
			if (query && !`${task.text} ${task.path}`.toLowerCase().includes(query)) continue;
			const placement = classify(task, options);
			placed[placement.bucket].push({ task, placement });
		}
		for (const list of Object.values(placed)) {
			list.sort((a, b) => {
				const fa = a.task.done || a.task.cancelled ? 1 : 0;
				const fb = b.task.done || b.task.cancelled ? 1 : 0;
				return fa !== fb ? fa - fb : compareTasks(a.task, b.task);
			});
		}

		const grid = body.createDiv({ cls: "eq-matrix" });
		grid.createDiv({ cls: "eq-corner" });
		grid.createDiv({ cls: "eq-axis eq-axis-col", text: s.urgent });
		grid.createDiv({ cls: "eq-axis eq-axis-col", text: s.notUrgent });
		grid.createDiv({ cls: "eq-axis eq-axis-row", text: s.important });
		this.renderQuadrant(grid, "do", placed.do);
		this.renderQuadrant(grid, "schedule", placed.schedule);
		grid.createDiv({ cls: "eq-axis eq-axis-row", text: s.notImportant });
		this.renderQuadrant(grid, "delegate", placed.delegate);
		this.renderQuadrant(grid, "eliminate", placed.eliminate);

		if (placed.triage.length > 0) this.renderTriage(body, placed.triage);

		body.querySelectorAll<HTMLElement>(".eq-list[data-bucket]").forEach((el) => {
			const top = previousScroll.get(el.dataset.bucket ?? "");
			if (top) el.scrollTop = top;
		});
	}

	private renderQuadrant(parent: HTMLElement, quadrant: Quadrant, items: Placed[]): void {
		const s = strings();
		const box = parent.createDiv({ cls: `eq-quadrant eq-q-${quadrant}` });
		const head = box.createDiv({ cls: "eq-q-head" });
		const titles = head.createDiv({ cls: "eq-q-titles" });
		const title = titles.createDiv({ cls: "eq-q-title" });
		title.createSpan({ text: s.quadrantName[quadrant] });
		title.createSpan({ cls: "eq-count", text: String(items.filter((i) => !i.task.done && !i.task.cancelled).length) });
		titles.createDiv({ cls: "eq-q-hint", text: s.quadrantHint[quadrant] });

		const add = head.createEl("button", { cls: "eq-icon-btn clickable-icon", attr: { "aria-label": s.addTask, type: "button" } });
		setIcon(add, "plus");
		add.addEventListener("click", () => this.openAddModal(quadrant));

		const list = box.createDiv({ cls: "eq-list", attr: { "data-bucket": quadrant } });
		this.enableDrop(list, box, quadrant);
		this.renderCards(list, quadrant, items);
		if (items.length === 0) list.createDiv({ cls: "eq-q-empty", text: s.emptyQuadrant });
	}

	private renderTriage(parent: HTMLElement, items: Placed[]): void {
		const s = strings();
		const box = parent.createDiv({ cls: "eq-triage" });
		const head = box.createDiv({ cls: "eq-q-head" });
		const titles = head.createDiv({ cls: "eq-q-titles" });
		const title = titles.createDiv({ cls: "eq-q-title" });
		title.createSpan({ text: s.triageName });
		title.createSpan({ cls: "eq-count", text: String(items.filter((i) => !i.task.done && !i.task.cancelled).length) });
		titles.createDiv({ cls: "eq-q-hint", text: s.triageHint });
		const list = box.createDiv({ cls: "eq-list eq-triage-list", attr: { "data-bucket": "triage" } });
		this.renderCards(list, "triage", items);
	}

	private renderCards(list: HTMLElement, bucket: Bucket, items: Placed[]): void {
		const s = strings();
		const limit = this.expanded.has(bucket) ? items.length : PAGE_SIZE;
		for (const item of items.slice(0, limit)) this.renderCard(list, item);
		if (items.length > limit) {
			const more = list.createEl("button", { cls: "eq-more", text: s.showMore(items.length - limit), attr: { type: "button" } });
			more.addEventListener("click", () => {
				this.expanded.add(bucket);
				this.render();
			});
		}
	}

	private renderCard(list: HTMLElement, item: Placed): void {
		const s = strings();
		const { task, placement } = item;
		const finished = task.done || task.cancelled;
		const card = list.createDiv({ cls: "eq-card", attr: { draggable: "true", title: describeWhy(s, placement) } });
		if (finished) card.addClass("is-done");
		if (placement.urgentBy === "overdue") card.addClass("is-overdue");

		const check = card.createEl("input", { cls: "eq-check task-list-item-checkbox", attr: { type: "checkbox" } });
		check.checked = finished;
		if (task.cancelled || task.recurring) {
			check.disabled = true;
			if (task.recurring) check.title = s.recurringHint;
		}
		check.addEventListener("click", (evt) => {
			evt.preventDefault();
			void this.toggle(task);
		});

		const main = card.createDiv({ cls: "eq-card-main" });
		const text = main.createDiv({ cls: "eq-card-text" });
		renderText(text, task.text || task.raw);
		text.addEventListener("click", (evt) => void this.openInNote(task, evt));

		const meta = main.createDiv({ cls: "eq-card-meta" });
		if (task.due && placement.daysUntilDue !== null) {
			const chip = meta.createSpan({ cls: "eq-chip eq-due", text: dueLabel(s, placement.daysUntilDue, task.due) });
			if (placement.daysUntilDue < 0) chip.addClass("is-overdue");
			else if (placement.urgentBy === "soon") chip.addClass("is-soon");
		}
		if (task.priority) meta.createSpan({ cls: `eq-chip eq-priority eq-p-${task.priority}`, text: s.priorityName[task.priority] });
		if (placement.pinned) {
			const pin = meta.createSpan({ cls: "eq-chip eq-pin", attr: { "aria-label": s.pinnedHint, title: s.pinnedHint } });
			setIcon(pin, "pin");
		}
		const base = task.path.split("/").pop() ?? task.path;
		meta.createSpan({ cls: "eq-chip eq-source", text: base.replace(/\.md$/i, ""), attr: { title: task.path } });

		const menuBtn = card.createEl("button", { cls: "eq-icon-btn eq-card-menu clickable-icon", attr: { "aria-label": s.moreActions, type: "button" } });
		setIcon(menuBtn, "more-vertical");
		menuBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.showMenu(item, evt);
		});
		card.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			this.showMenu(item, evt);
		});

		card.addEventListener("dragstart", (evt) => {
			this.dragged = item;
			card.addClass("is-dragging");
			if (evt.dataTransfer) {
				evt.dataTransfer.effectAllowed = "move";
				evt.dataTransfer.setData("text/plain", task.text);
			}
		});
		card.addEventListener("dragend", () => {
			this.dragged = null;
			card.removeClass("is-dragging");
			this.body.querySelectorAll(".is-drop-target").forEach((el) => el.removeClass("is-drop-target"));
		});
	}

	private enableDrop(list: HTMLElement, box: HTMLElement, quadrant: Quadrant): void {
		let depth = 0;
		list.addEventListener("dragenter", (evt) => {
			if (!this.dragged) return;
			evt.preventDefault();
			depth++;
			box.addClass("is-drop-target");
		});
		list.addEventListener("dragover", (evt) => {
			if (!this.dragged) return;
			evt.preventDefault();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
		});
		list.addEventListener("dragleave", () => {
			if (!this.dragged) return;
			depth = Math.max(0, depth - 1);
			if (depth === 0) box.removeClass("is-drop-target");
		});
		list.addEventListener("drop", (evt) => {
			evt.preventDefault();
			depth = 0;
			box.removeClass("is-drop-target");
			const item = this.dragged;
			this.dragged = null;
			if (item && item.placement.bucket !== quadrant) void this.moveTo(item.task, quadrant);
		});
	}

	private showMenu(item: Placed, evt: MouseEvent): void {
		const s = strings();
		const menu = new Menu();
		menu.addItem((i) => i.setTitle(s.openInNote).setIcon("file-text").onClick(() => void this.openInNote(item.task, evt)));
		menu.addSeparator();
		for (const q of QUADRANTS) {
			if (q === item.placement.bucket) continue;
			menu.addItem((i) =>
				i
					.setTitle(s.moveTo(s.quadrantName[q]))
					.setIcon("arrow-right")
					.onClick(() => void this.moveTo(item.task, q)),
			);
		}
		if (item.task.pinned) {
			menu.addSeparator();
			menu.addItem((i) => i.setTitle(s.returnToAuto).setIcon("undo-2").onClick(() => void this.unpin(item.task)));
		}
		menu.showAtMouseEvent(evt);
	}

	private async openInNote(task: Task, evt: MouseEvent): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
		if (!(file instanceof TFile)) return;
		const { workspace } = this.plugin.app;
		// getLeaf(false) would reuse the matrix's own tab and replace it with the note.
		const modifier = Keymap.isModEvent(evt);
		const open = workspace.getLeavesOfType("markdown").find((l) => l.view instanceof MarkdownView && l.view.file?.path === task.path);
		const leaf = open && !modifier ? open : workspace.getLeaf(modifier || "tab");
		await leaf.openFile(file, { eState: { line: task.line } });
		await workspace.revealLeaf(leaf);
		const view = leaf.view;
		if (view instanceof MarkdownView && view.getMode() === "source") {
			const position = { line: task.line, ch: 0 };
			view.editor.setCursor(position);
			view.editor.scrollIntoView({ from: position, to: position }, true);
		}
	}

	private async edit(task: Task, transform: (line: string) => string): Promise<boolean> {
		const s = strings();
		try {
			const ok = await updateTaskLine(this.plugin.app, task, transform);
			if (!ok) new Notice(s.staleTask);
			return ok;
		} catch (error) {
			console.error("Eisenhower Quadrants: could not update task", error);
			new Notice(s.updateFailed);
			return false;
		} finally {
			void this.refresh();
		}
	}

	private async toggle(task: Task): Promise<void> {
		const doneDate = this.plugin.settings.appendDoneDate ? todayISO() : null;
		await this.edit(task, (line) => toggleDoneLine(line, doneDate));
	}

	private async moveTo(task: Task, target: Quadrant): Promise<void> {
		const s = strings();
		const automatic = classify({ ...task, pinned: null }, classifyOptions(this.plugin)).bucket;
		// Landing where the plugin would have put the task anyway needs no pin.
		const pin: Quadrant | null = automatic === target ? null : target;
		if ((task.pinned ?? null) === pin) return;
		const root = this.plugin.settings.pinRoot;
		if (await this.edit(task, (line) => setPinLine(line, root, pin))) new Notice(s.moved(bucketName(s, target)));
	}

	private async unpin(task: Task): Promise<void> {
		const root = this.plugin.settings.pinRoot;
		if (await this.edit(task, (line) => setPinLine(line, root, null))) new Notice(strings().unpinned);
	}
}
