import { Modal, Notice, Setting } from "obsidian";
import type EisenhowerPlugin from "./main";
import { strings } from "./i18n";
import { appendToInbox } from "./service";
import { buildTaskLine, isValidDate, QUADRANTS, type Bucket, type Quadrant } from "./tasks";

export class AddTaskModal extends Modal {
	private text = "";
	private due = "";
	private bucket: Bucket;

	constructor(
		app: Modal["app"],
		private readonly plugin: EisenhowerPlugin,
		initial: Bucket,
		private readonly onAdded: () => void,
	) {
		super(app);
		this.bucket = initial;
	}

	onOpen(): void {
		const s = strings();
		const { contentEl } = this;
		this.setTitle(s.addTaskTitle);

		new Setting(contentEl).setName(s.taskLabel).addText((input) => {
			input.setPlaceholder(s.taskPlaceholder).onChange((value) => (this.text = value));
			input.inputEl.addClass("eq-modal-input");
			input.inputEl.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter" && !evt.isComposing) {
					evt.preventDefault();
					void this.submit();
				}
			});
			window.setTimeout(() => input.inputEl.focus(), 0);
		});

		new Setting(contentEl).setName(s.dueLabel).addText((input) => {
			input.inputEl.type = "date";
			input.onChange((value) => (this.due = value));
		});

		new Setting(contentEl).setName(s.quadrantLabel).addDropdown((dropdown) => {
			for (const q of QUADRANTS) dropdown.addOption(q, `${s.quadrantName[q]} (${s.quadrantHint[q].toLowerCase()})`);
			dropdown.addOption("triage", s.triageOption);
			dropdown.setValue(this.bucket).onChange((value) => (this.bucket = value as Bucket));
		});

		new Setting(contentEl)
			.addButton((button) => button.setButtonText(s.add).setCta().onClick(() => void this.submit()))
			.addButton((button) => button.setButtonText(s.cancel).onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const s = strings();
		if (this.text.trim() === "") {
			new Notice(s.needText);
			return;
		}
		const settings = this.plugin.settings;
		const quadrant: Quadrant | null = this.bucket === "triage" ? null : this.bucket;
		const due = isValidDate(this.due) ? this.due : null;
		const line = buildTaskLine(this.text, due, quadrant, settings.pinRoot);
		try {
			const file = await appendToInbox(this.app, settings.inboxPath, line);
			new Notice(s.addedTo(file.path));
			this.close();
			this.onAdded();
		} catch (error) {
			console.error("Eisenhower Quadrants: could not add task", error);
			new Notice(s.updateFailed);
		}
	}
}
