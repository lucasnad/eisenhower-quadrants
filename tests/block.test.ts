import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretBlock, preprocessBlockSource } from "../src/block";

const resolve = (name: string): string | null => (name === "Plan" ? "Projects/Plan.md" : null);

test("an empty block shows the current note", () => {
	assert.deepEqual(interpretBlock(null, "a/b.md", resolve), { ok: true, scope: { filePath: "a/b.md" }, completed: undefined });
	assert.deepEqual(interpretBlock({}, "a/b.md", resolve), { ok: true, scope: { filePath: "a/b.md" }, completed: undefined });
});

test("vault, folder and tag widen the scope", () => {
	assert.deepEqual(interpretBlock({ vault: true }, "n.md", resolve), { ok: true, scope: {}, completed: undefined });
	assert.deepEqual(interpretBlock({ folder: "Work", completed: true }, "n.md", resolve), { ok: true, scope: { folder: "Work" }, completed: true });
	assert.deepEqual(interpretBlock({ tag: "work" }, "n.md", resolve), { ok: true, scope: { tag: "work" }, completed: undefined });
	assert.deepEqual(interpretBlock({ folder: "Work", tag: "x" }, "n.md", resolve), { ok: true, scope: { folder: "Work", tag: "x" }, completed: undefined });
});

test("file resolves a note name, a wikilink or current", () => {
	assert.deepEqual(interpretBlock({ file: "Plan" }, "n.md", resolve), { ok: true, scope: { filePath: "Projects/Plan.md" }, completed: undefined });
	assert.deepEqual(interpretBlock({ file: "[[Plan]]" }, "n.md", resolve), { ok: true, scope: { filePath: "Projects/Plan.md" }, completed: undefined });
	assert.deepEqual(interpretBlock({ file: "current" }, "n.md", resolve), { ok: true, scope: { filePath: "n.md" }, completed: undefined });
	assert.deepEqual(interpretBlock({ file: "Nope" }, "n.md", resolve), { ok: false, error: { kind: "noteMissing", path: "Nope" } });
});

test("rejects unknown options and non-objects", () => {
	assert.deepEqual(interpretBlock({ foldr: "x" }, "n.md", resolve), { ok: false, error: { kind: "unknownKey", key: "foldr" } });
	assert.deepEqual(interpretBlock("just text", "n.md", resolve), { ok: false, error: { kind: "invalid" } });
	assert.deepEqual(interpretBlock(["a"], "n.md", resolve), { ok: false, error: { kind: "invalid" } });
});

test("booleans accept yes and no, and a false vault does not widen", () => {
	assert.equal((interpretBlock({ completed: "yes" }, "n.md", resolve) as { completed: boolean }).completed, true);
	assert.equal((interpretBlock({ completed: "no" }, "n.md", resolve) as { completed: boolean }).completed, false);
	assert.deepEqual(interpretBlock({ vault: false }, "n.md", resolve), { ok: true, scope: { filePath: "n.md" }, completed: undefined });
});

test("tag: #x survives YAML by dropping the hash first", () => {
	assert.equal(preprocessBlockSource("tag: #work\nfolder: A"), "tag: work\nfolder: A");
	assert.equal(preprocessBlockSource("  TAG:   #work/sub"), "  TAG:   work/sub");
	assert.equal(preprocessBlockSource("tag: 'work'"), "tag: 'work'");
});
