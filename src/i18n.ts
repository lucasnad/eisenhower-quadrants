import { getLanguage } from "obsidian";
import type { Bucket, Priority, Quadrant } from "./tasks";

interface Strings {
	viewTitle: string;
	openMatrix: string;
	addTask: string;
	refresh: string;
	showCompleted: string;
	filterPlaceholder: string;
	quadrantName: Record<Quadrant, string>;
	quadrantHint: Record<Quadrant, string>;
	urgent: string;
	notUrgent: string;
	important: string;
	notImportant: string;
	triageName: string;
	triageHint: string;
	triageOption: string;
	empty: string;
	emptyQuadrant: string;
	showMore: (n: number) => string;
	priorityName: Record<Priority, string>;
	dueToday: string;
	dueTomorrow: string;
	dueIn: (n: number) => string;
	overdue: (n: number) => string;
	moveTo: (quadrant: string) => string;
	returnToAuto: string;
	openInNote: string;
	moreActions: string;
	recurringHint: string;
	pinnedHint: string;
	whyPinned: (quadrant: string) => string;
	whyUrgent: Record<"overdue" | "soon" | "tag", string>;
	whyNotUrgent: string;
	whyImportant: Record<"tag" | "priority" | "default", string>;
	whyNotImportant: Record<"priority" | "default", string>;
	whyUnrated: string;
	moved: (quadrant: string) => string;
	unpinned: string;
	staleTask: string;
	updateFailed: string;
	addedTo: (file: string) => string;
	addTaskTitle: string;
	taskLabel: string;
	taskPlaceholder: string;
	dueLabel: string;
	quadrantLabel: string;
	add: string;
	cancel: string;
	needText: string;
	blockError: (message: string) => string;
	blockUnknownKey: (key: string) => string;
	blockNoteMissing: (path: string) => string;
	settings: {
		classification: string;
		urgentWithin: string;
		urgentWithinDesc: string;
		urgentTags: string;
		urgentTagsDesc: string;
		importantTags: string;
		importantTagsDesc: string;
		mediumImportant: string;
		mediumImportantDesc: string;
		unrated: string;
		unratedDesc: string;
		unratedTriage: string;
		unratedImportant: string;
		unratedNotImportant: string;
		pinTag: string;
		pinTagDesc: (root: string) => string;
		scope: string;
		includeFolders: string;
		includeFoldersDesc: string;
		excludeFolders: string;
		excludeFoldersDesc: string;
		behavior: string;
		showCompleted: string;
		showCompletedDesc: string;
		doneDate: string;
		doneDateDesc: string;
		inbox: string;
		inboxDesc: string;
	};
}

const en: Strings = {
	viewTitle: "Eisenhower matrix",
	openMatrix: "Open matrix",
	addTask: "Add task",
	refresh: "Refresh",
	showCompleted: "Show completed tasks",
	filterPlaceholder: "Filter tasks",
	quadrantName: { do: "Do now", schedule: "Schedule", delegate: "Delegate", eliminate: "Eliminate" },
	quadrantHint: {
		do: "Urgent and important",
		schedule: "Important, not urgent",
		delegate: "Urgent, not important",
		eliminate: "Neither urgent nor important",
	},
	urgent: "Urgent",
	notUrgent: "Not urgent",
	important: "Important",
	notImportant: "Not important",
	triageName: "Needs triage",
	triageHint: "No importance yet. Drag a card into a quadrant, or set a priority in the note.",
	triageOption: "Needs triage (decide later)",
	empty: "No tasks found. Write checkbox tasks in your notes or use the add button.",
	emptyQuadrant: "Nothing here",
	showMore: (n) => `Show ${n} more`,
	priorityName: { highest: "Highest", high: "High", medium: "Medium", low: "Low", lowest: "Lowest" },
	dueToday: "Today",
	dueTomorrow: "Tomorrow",
	dueIn: (n) => `In ${n}d`,
	overdue: (n) => `${n}d overdue`,
	moveTo: (q) => `Move to ${q}`,
	returnToAuto: "Return to automatic placement",
	openInNote: "Open in note",
	moreActions: "More actions",
	recurringHint: "Recurring task: complete it in the note so the next one is scheduled.",
	pinnedHint: "Pinned to this quadrant",
	whyPinned: (q) => `Pinned to ${q}`,
	whyUrgent: { overdue: "urgent: overdue", soon: "urgent: due soon", tag: "urgent: tagged" },
	whyNotUrgent: "not urgent",
	whyImportant: { tag: "important: tagged", priority: "important: priority", default: "important: default" },
	whyNotImportant: { priority: "not important: priority", default: "not important: default" },
	whyUnrated: "no importance set",
	moved: (q) => `Moved to ${q}`,
	unpinned: "Back to automatic placement",
	staleTask: "That task changed in the note. The matrix was refreshed.",
	updateFailed: "Could not update the task.",
	addedTo: (file) => `Added to ${file}`,
	addTaskTitle: "Add task",
	taskLabel: "Task",
	taskPlaceholder: "What needs doing?",
	dueLabel: "Due date",
	quadrantLabel: "Quadrant",
	add: "Add",
	cancel: "Cancel",
	needText: "Write the task first.",
	blockError: (m) => `Eisenhower block: ${m}`,
	blockUnknownKey: (k) => `unknown option "${k}". Use file, folder, tag, vault or completed.`,
	blockNoteMissing: (p) => `note "${p}" was not found.`,
	settings: {
		classification: "Classification",
		urgentWithin: "Urgent when due within (days)",
		urgentWithinDesc: "Tasks due in this many days, or already overdue, count as urgent. Zero means only today and overdue.",
		urgentTags: "Urgent tags",
		urgentTagsDesc: "Comma-separated tags that mark a task as urgent regardless of its date.",
		importantTags: "Important tags",
		importantTagsDesc: "Comma-separated tags that mark a task as important.",
		mediumImportant: "Medium priority counts as important",
		mediumImportantDesc: "High and highest priority are always important. Low and lowest never are.",
		unrated: "Tasks without a priority or tag",
		unratedDesc: "Importance is your call, so by default these wait in the triage tray instead of being guessed.",
		unratedTriage: "Send to triage",
		unratedImportant: "Treat as important",
		unratedNotImportant: "Treat as not important",
		pinTag: "Pin tag",
		pinTagDesc: (root) => `Dragging a card writes a tag like #${root}/do on the task line. Changing this does not rename existing tags.`,
		scope: "Scope",
		includeFolders: "Only these folders",
		includeFoldersDesc: "Comma-separated folder paths. Empty means the whole vault.",
		excludeFolders: "Ignore these folders",
		excludeFoldersDesc: "Comma-separated folder paths, for example templates or archive.",
		behavior: "Behavior",
		showCompleted: "Show completed tasks",
		showCompletedDesc: "Completed tasks appear struck through at the end of each quadrant.",
		doneDate: "Add a done date when completing",
		doneDateDesc: "Appends a completion date in the format used by the Tasks plugin.",
		inbox: "Note for new tasks",
		inboxDesc: "Tasks added from the matrix are appended to this note. It is created if missing.",
	},
};

const pt: Strings = {
	viewTitle: "Matriz de Eisenhower",
	openMatrix: "Abrir matriz",
	addTask: "Adicionar tarefa",
	refresh: "Atualizar",
	showCompleted: "Mostrar tarefas concluídas",
	filterPlaceholder: "Filtrar tarefas",
	quadrantName: { do: "Fazer agora", schedule: "Agendar", delegate: "Delegar", eliminate: "Eliminar" },
	quadrantHint: {
		do: "Urgente e importante",
		schedule: "Importante, não urgente",
		delegate: "Urgente, não importante",
		eliminate: "Nem urgente nem importante",
	},
	urgent: "Urgente",
	notUrgent: "Não urgente",
	important: "Importante",
	notImportant: "Não importante",
	triageName: "Para triar",
	triageHint: "Sem importância definida. Arraste para um quadrante ou defina uma prioridade na nota.",
	triageOption: "Para triar (decidir depois)",
	empty: "Nenhuma tarefa encontrada. Escreva tarefas com checkbox nas notas ou use o botão de adicionar.",
	emptyQuadrant: "Nada aqui",
	showMore: (n) => `Mostrar mais ${n}`,
	priorityName: { highest: "Máxima", high: "Alta", medium: "Média", low: "Baixa", lowest: "Mínima" },
	dueToday: "Hoje",
	dueTomorrow: "Amanhã",
	dueIn: (n) => `Em ${n}d`,
	overdue: (n) => `Atrasada ${n}d`,
	moveTo: (q) => `Mover para ${q}`,
	returnToAuto: "Voltar ao posicionamento automático",
	openInNote: "Abrir na nota",
	moreActions: "Mais ações",
	recurringHint: "Tarefa recorrente: conclua na nota para que a próxima seja agendada.",
	pinnedHint: "Fixada neste quadrante",
	whyPinned: (q) => `Fixada em ${q}`,
	whyUrgent: { overdue: "urgente: atrasada", soon: "urgente: prazo próximo", tag: "urgente: por tag" },
	whyNotUrgent: "não urgente",
	whyImportant: { tag: "importante: por tag", priority: "importante: pela prioridade", default: "importante: padrão" },
	whyNotImportant: { priority: "não importante: pela prioridade", default: "não importante: padrão" },
	whyUnrated: "sem importância definida",
	moved: (q) => `Movida para ${q}`,
	unpinned: "Voltou ao posicionamento automático",
	staleTask: "A tarefa mudou na nota. A matriz foi atualizada.",
	updateFailed: "Não foi possível atualizar a tarefa.",
	addedTo: (file) => `Adicionada em ${file}`,
	addTaskTitle: "Adicionar tarefa",
	taskLabel: "Tarefa",
	taskPlaceholder: "O que precisa ser feito?",
	dueLabel: "Prazo",
	quadrantLabel: "Quadrante",
	add: "Adicionar",
	cancel: "Cancelar",
	needText: "Escreva a tarefa primeiro.",
	blockError: (m) => `Bloco eisenhower: ${m}`,
	blockUnknownKey: (k) => `opção desconhecida "${k}". Use file, folder, tag, vault ou completed.`,
	blockNoteMissing: (p) => `a nota "${p}" não foi encontrada.`,
	settings: {
		classification: "Classificação",
		urgentWithin: "Urgente quando vence em (dias)",
		urgentWithinDesc: "Tarefas que vencem dentro desse número de dias, ou já atrasadas, contam como urgentes. Zero significa só hoje e atrasadas.",
		urgentTags: "Tags de urgente",
		urgentTagsDesc: "Tags separadas por vírgula que marcam a tarefa como urgente, independentemente da data.",
		importantTags: "Tags de importante",
		importantTagsDesc: "Tags separadas por vírgula que marcam a tarefa como importante.",
		mediumImportant: "Prioridade média conta como importante",
		mediumImportantDesc: "Prioridade alta e máxima sempre são importantes. Baixa e mínima nunca são.",
		unrated: "Tarefas sem prioridade nem tag",
		unratedDesc: "Importância é decisão sua, então por padrão elas esperam na bandeja de triagem em vez de serem adivinhadas.",
		unratedTriage: "Enviar para triagem",
		unratedImportant: "Tratar como importante",
		unratedNotImportant: "Tratar como não importante",
		pinTag: "Tag de fixação",
		pinTagDesc: (root) => `Arrastar um cartão grava uma tag como #${root}/do na linha da tarefa. Mudar isso não renomeia as tags existentes.`,
		scope: "Escopo",
		includeFolders: "Somente estas pastas",
		includeFoldersDesc: "Caminhos de pastas separados por vírgula. Vazio significa o cofre inteiro.",
		excludeFolders: "Ignorar estas pastas",
		excludeFoldersDesc: "Caminhos de pastas separados por vírgula, por exemplo templates ou arquivo.",
		behavior: "Comportamento",
		showCompleted: "Mostrar tarefas concluídas",
		showCompletedDesc: "Tarefas concluídas aparecem riscadas no fim de cada quadrante.",
		doneDate: "Registrar a data ao concluir",
		doneDateDesc: "Acrescenta a data de conclusão no formato usado pelo plugin Tasks.",
		inbox: "Nota para novas tarefas",
		inboxDesc: "Tarefas adicionadas pela matriz são anexadas a esta nota. Ela é criada se não existir.",
	},
};

export function strings(): Strings {
	let lang = "en";
	try {
		lang = getLanguage();
	} catch {
		// getLanguage is missing outside Obsidian; fall back to English.
	}
	return lang.toLowerCase().startsWith("pt") ? pt : en;
}

export function bucketName(s: Strings, bucket: Bucket): string {
	return bucket === "triage" ? s.triageName : s.quadrantName[bucket];
}

export type { Strings };
