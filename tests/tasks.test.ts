import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildTaskLine,
	classify,
	compareTasks,
	daysBetween,
	extractTasks,
	isValidDate,
	parseTask,
	replaceTaskLine,
	setPinLine,
	splitList,
	toggleDoneLine,
	todayISO,
	type ClassifyOptions,
	type TaskInfo,
} from "../src/tasks";

const ROOT = "eisenhower";

const OPTS: ClassifyOptions = {
	today: "2026-10-22",
	urgentWithinDays: 2,
	urgentTags: ["urgent", "urgente"],
	importantTags: ["important", "importante"],
	mediumIsImportant: false,
	unratedImportance: "triage",
};

function info(line: string): TaskInfo {
	const parsed = parseTask(line, ROOT);
	assert.ok(parsed, `expected a task: ${line}`);
	return parsed;
}

test("parses open, done, cancelled and custom-status tasks", () => {
	assert.equal(info("- [ ] a").done, false);
	assert.equal(info("- [x] a").done, true);
	assert.equal(info("- [X] a").done, true);
	assert.equal(info("- [-] a").cancelled, true);
	const inProgress = info("- [/] a");
	assert.equal(inProgress.done, false);
	assert.equal(inProgress.cancelled, false);
});

test("accepts indented, numbered, starred and callout tasks", () => {
	assert.ok(parseTask("    - [ ] nested", ROOT));
	assert.ok(parseTask("1. [ ] numbered", ROOT));
	assert.ok(parseTask("2) [ ] numbered paren", ROOT));
	assert.ok(parseTask("* [ ] star", ROOT));
	assert.ok(parseTask("> - [ ] in a callout", ROOT));
	assert.ok(parseTask("> > - [ ] nested callout", ROOT));
});

test("rejects things that are not tasks", () => {
	assert.equal(parseTask("- plain bullet", ROOT), null);
	assert.equal(parseTask("[ ] no bullet", ROOT), null);
	assert.equal(parseTask("-[ ] no space", ROOT), null);
	assert.equal(parseTask("- [ ]", ROOT), null);
	assert.equal(parseTask("## heading", ROOT), null);
});

test("reads Tasks-style and Dataview due dates", () => {
	assert.equal(info("- [ ] a 📅 2026-10-25").due, "2026-10-25");
	assert.equal(info("- [ ] a [due:: 2026-10-25]").due, "2026-10-25");
	assert.equal(info("- [ ] a (due:: 2026-10-25)").due, "2026-10-25");
	assert.equal(info("- [ ] a ⏳ 2026-10-25").due, null);
	assert.equal(info("- [ ] a").due, null);
});

test("reads priority emoji", () => {
	assert.equal(info("- [ ] a 🔺").priority, "highest");
	assert.equal(info("- [ ] a ⏫").priority, "high");
	assert.equal(info("- [ ] a 🔼").priority, "medium");
	assert.equal(info("- [ ] a 🔽").priority, "low");
	assert.equal(info("- [ ] a ⏬").priority, "lowest");
	assert.equal(info("- [ ] a").priority, null);
});

test("cleans metadata out of the display text", () => {
	const t = info("- [ ] Pay rent ⏫ 🔁 every month 📅 2026-10-25 ✅ 2026-10-01 #home #eisenhower/do ^abc123");
	assert.equal(t.text, "Pay rent #home");
	assert.equal(info("- [ ] Ligar para [[Maria Silva|Maria]] e ver [[Plano#Metas]] [site](https://x.y)").text, "Ligar para Maria e ver Plano site");
	assert.equal(info("- [ ] do it [priority:: high]").text, "do it");
});

test("detects the pin tag, case insensitive and with punctuation after it", () => {
	assert.equal(info("- [ ] a #eisenhower/schedule").pinned, "schedule");
	assert.equal(info("- [ ] a #Eisenhower/DO").pinned, "do");
	assert.equal(info("- [ ] a #eisenhower/delegate, tomorrow").pinned, "delegate");
	assert.equal(info("- [ ] a #eisenhower/other").pinned, null);
	assert.equal(info("- [ ] a #eisenhowerx/do").pinned, null);
	assert.equal(parseTask("- [ ] a #q/do", "q")?.pinned, "do");
	assert.equal(parseTask("- [ ] a #q/do", "#q/")?.pinned, "do");
});

test("does not read hashes that are not tags", () => {
	assert.deepEqual(info("- [ ] issue #123 and C# code").tags, []);
	assert.deepEqual(info("- [ ] #ação e #a_b-c/d").tags, ["ação", "a_b-c/d"]);
});

test("flags recurring tasks", () => {
	assert.equal(info("- [ ] a 🔁 every day").recurring, true);
	assert.equal(info("- [ ] a [repeat:: weekly]").recurring, true);
	assert.equal(info("- [ ] a").recurring, false);
});

test("urgency is derived from the due date and the window", () => {
	const at = (due: string) => classify(info(`- [ ] a ⏫ 📅 ${due}`), OPTS);
	assert.equal(at("2026-10-20").urgentBy, "overdue");
	assert.equal(at("2026-10-22").urgentBy, "soon");
	assert.equal(at("2026-10-24").urgentBy, "soon");
	assert.equal(at("2026-10-25").urgentBy, null);
	assert.equal(at("2026-10-20").daysUntilDue, -2);
	assert.equal(classify(info("- [ ] a ⏫ 📅 2026-10-24"), { ...OPTS, urgentWithinDays: 1 }).urgent, false);
	assert.equal(classify(info("- [ ] a ⏫ 📅 2026-10-22"), { ...OPTS, urgentWithinDays: 0 }).urgent, true);
});

test("the four quadrants", () => {
	const b = (line: string, o = OPTS) => classify(info(line), o).bucket;
	assert.equal(b("- [ ] a ⏫ 📅 2026-10-22"), "do");
	assert.equal(b("- [ ] a ⏫ 📅 2026-12-31"), "schedule");
	assert.equal(b("- [ ] a ⏫"), "schedule");
	assert.equal(b("- [ ] a 🔽 📅 2026-10-22"), "delegate");
	assert.equal(b("- [ ] a 🔽 📅 2026-12-31"), "eliminate");
	assert.equal(b("- [ ] a 🔽"), "eliminate");
});

test("tags can mark urgent and important", () => {
	assert.equal(classify(info("- [ ] a #importante #urgente"), OPTS).bucket, "do");
	assert.equal(classify(info("- [ ] a #important"), OPTS).bucket, "schedule");
	assert.equal(classify(info("- [ ] a #urgent 🔽"), OPTS).bucket, "delegate");
	assert.equal(classify(info("- [ ] a #urgent"), OPTS).bucket, "triage");
	assert.equal(classify(info("- [ ] a #IMPORTANTE 🔽"), OPTS).important, true);
});

test("medium priority follows the setting", () => {
	assert.equal(classify(info("- [ ] a 🔼"), OPTS).bucket, "eliminate");
	assert.equal(classify(info("- [ ] a 🔼"), { ...OPTS, mediumIsImportant: true }).bucket, "schedule");
});

test("importance is not guessed: no rating means triage", () => {
	const p = classify(info("- [ ] a 📅 2026-10-22"), OPTS);
	assert.equal(p.bucket, "triage");
	assert.equal(p.urgent, true);
	assert.equal(p.important, null);
	assert.equal(classify(info("- [ ] plain"), OPTS).bucket, "triage");
});

test("unrated tasks can default to important or not important", () => {
	assert.equal(classify(info("- [ ] plain"), { ...OPTS, unratedImportance: "important" }).bucket, "schedule");
	assert.equal(classify(info("- [ ] plain"), { ...OPTS, unratedImportance: "not-important" }).bucket, "eliminate");
	assert.equal(classify(info("- [ ] plain 📅 2026-10-22"), { ...OPTS, unratedImportance: "important" }).bucket, "do");
});

test("a pin wins over everything", () => {
	const p = classify(info("- [ ] a ⏫ 📅 2026-10-22 #eisenhower/eliminate"), OPTS);
	assert.equal(p.bucket, "eliminate");
	assert.equal(p.pinned, true);
	assert.equal(p.urgent, true);
	assert.equal(classify(info("- [ ] plain #eisenhower/do"), OPTS).bucket, "do");
});

test("daysBetween and date validation", () => {
	assert.equal(daysBetween("2026-10-22", "2026-10-23"), 1);
	assert.equal(daysBetween("2026-10-22", "2026-10-21"), -1);
	assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1);
	assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
	assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
	assert.equal(isValidDate("2026-02-29"), false);
	assert.equal(isValidDate("2028-02-29"), true);
	assert.equal(isValidDate("2026-13-01"), false);
	assert.equal(isValidDate("26-1-1"), false);
	assert.equal(todayISO(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
	assert.equal(todayISO(new Date(2026, 11, 31, 0, 0)), "2026-12-31");
});

test("an invalid due date never makes a task urgent", () => {
	assert.equal(classify(info("- [ ] a ⏫ 📅 2026-02-31"), OPTS).urgent, false);
});

test("sorting: due date, then priority, then file and line", () => {
	const mk = (path: string, line: number, text: string): ReturnType<typeof extractTasks>[number] => {
		const [t] = extractTasks(path, text, [0], ROOT);
		assert.ok(t);
		return { ...t, line };
	};
	const list = [
		mk("b.md", 1, "- [ ] undated"),
		mk("a.md", 1, "- [ ] later 📅 2026-11-01"),
		mk("a.md", 2, "- [ ] soon low 📅 2026-10-23 🔽"),
		mk("a.md", 3, "- [ ] soon high 📅 2026-10-23 ⏫"),
		mk("a.md", 0, "- [ ] overdue 📅 2026-10-01"),
	].sort(compareTasks);
	assert.deepEqual(
		list.map((t) => t.text),
		["overdue", "soon high", "soon low", "later", "undated"],
	);
});

test("extractTasks only reads the requested lines and keeps raw text", () => {
	const md = ["# Title", "- [ ] one", "```", "- [ ] in code", "```", "- [x] two ✅ 2026-10-01", "text"].join("\r\n");
	const tasks = extractTasks("n.md", md, [1, 5, 6, 99], ROOT);
	assert.deepEqual(
		tasks.map((t) => [t.line, t.raw, t.done]),
		[
			[1, "- [ ] one", false],
			[5, "- [x] two ✅ 2026-10-01", true],
		],
	);
});

test("toggleDoneLine completes with a done date and reopens cleanly", () => {
	assert.equal(toggleDoneLine("- [ ] a", "2026-10-22"), "- [x] a ✅ 2026-10-22");
	assert.equal(toggleDoneLine("- [ ] a", null), "- [x] a");
	assert.equal(toggleDoneLine("- [x] a ✅ 2026-10-22", "2026-10-23"), "- [ ] a");
	assert.equal(toggleDoneLine("- [X] a", null), "- [ ] a");
	assert.equal(toggleDoneLine("  - [ ] a 📅 2026-10-25 ^id1", "2026-10-22"), "  - [x] a 📅 2026-10-25 ✅ 2026-10-22 ^id1");
	assert.equal(toggleDoneLine("> - [ ] a", "2026-10-22"), "> - [x] a ✅ 2026-10-22");
	assert.equal(toggleDoneLine("1. [/] a", "2026-10-22"), "1. [x] a ✅ 2026-10-22");
	assert.equal(toggleDoneLine("- [ ] a ✅ 2026-01-01", "2026-10-22"), "- [x] a ✅ 2026-01-01");
	assert.equal(toggleDoneLine("not a task", "2026-10-22"), "not a task");
});

test("setPinLine adds, replaces and removes the pin", () => {
	assert.equal(setPinLine("- [ ] a", ROOT, "do"), "- [ ] a #eisenhower/do");
	assert.equal(setPinLine("- [ ] a #eisenhower/do", ROOT, "schedule"), "- [ ] a #eisenhower/schedule");
	assert.equal(setPinLine("- [ ] a #eisenhower/do", ROOT, null), "- [ ] a");
	assert.equal(setPinLine("- [ ] #eisenhower/do a", ROOT, null), "- [ ] a");
	assert.equal(setPinLine("- [ ] a #x #eisenhower/do #y", ROOT, "delegate"), "- [ ] a #x #y #eisenhower/delegate");
	assert.equal(setPinLine("- [ ] a ^blk", ROOT, "do"), "- [ ] a #eisenhower/do ^blk");
	assert.equal(setPinLine("- [x] a ✅ 2026-10-01", ROOT, "do"), "- [x] a ✅ 2026-10-01 #eisenhower/do");
	assert.equal(setPinLine("- [ ] a #eisenhower/do,", ROOT, null), "- [ ] a,");
	assert.equal(setPinLine("- [ ] a", "#mine/", "eliminate"), "- [ ] a #mine/eliminate");
	assert.equal(setPinLine("- [ ] a #eisenhower/do   ", ROOT, "do"), "- [ ] a #eisenhower/do");
	const round = setPinLine(setPinLine("- [ ] a 📅 2026-10-25 ⏫", ROOT, "do"), ROOT, null);
	assert.equal(round, "- [ ] a 📅 2026-10-25 ⏫");
});

test("setPinLine escapes regex characters in a custom root", () => {
	assert.equal(setPinLine("- [ ] a #m.e/do", "m.e", "schedule"), "- [ ] a #m.e/schedule");
	assert.equal(setPinLine("- [ ] a #mxe/do", "m.e", "schedule"), "- [ ] a #mxe/do #m.e/schedule");
});

test("replaceTaskLine edits only the expected line and keeps line endings", () => {
	const upper = (l: string) => l.toUpperCase();
	assert.equal(replaceTaskLine("a\n- [ ] t\nc", 1, "- [ ] t", upper), "a\n- [ ] T\nc");
	assert.equal(replaceTaskLine("a\r\n- [ ] t\r\nc\n", 1, "- [ ] t", upper), "a\r\n- [ ] T\r\nc\n");
	assert.equal(replaceTaskLine("a\r\n- [ ] t\nc", 1, "- [ ] t", upper), "a\r\n- [ ] T\nc");
	// The line moved down by two: the identical line is still found.
	assert.equal(replaceTaskLine("x\ny\na\n- [ ] t\nc", 1, "- [ ] t", upper), "x\ny\na\n- [ ] T\nc");
	// Two identical lines: the one closest to the expected position wins.
	assert.equal(replaceTaskLine("- [ ] t\nb\nc\n- [ ] t", 3, "- [ ] t", upper), "- [ ] t\nb\nc\n- [ ] T");
	// The line was edited in the meantime: refuse instead of touching something else.
	assert.equal(replaceTaskLine("a\n- [ ] edited\nc", 1, "- [ ] t", upper), null);
	assert.equal(replaceTaskLine("", 0, "- [ ] t", upper), null);
	assert.equal(replaceTaskLine("- [ ] t", 0, "- [ ] t", upper), "- [ ] T");
});

test("buildTaskLine", () => {
	assert.equal(buildTaskLine("  Buy   milk \n now ", "2026-10-25", "do", ROOT), "- [ ] Buy milk now 📅 2026-10-25 #eisenhower/do");
	assert.equal(buildTaskLine("Buy milk", null, null, ROOT), "- [ ] Buy milk");
	assert.equal(buildTaskLine("Buy milk", "garbage", "schedule", ROOT), "- [ ] Buy milk #eisenhower/schedule");
});

test("splitList normalises settings input", () => {
	assert.deepEqual(splitList(" #Urgent , urgente,, "), ["urgent", "urgente"]);
	assert.deepEqual(splitList(""), []);
});
