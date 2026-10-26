import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Editor } from "../src/components/editor.ts";
import { KeybindingsManager, setKeybindings, TUI_KEYBINDINGS } from "../src/keybindings.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { defaultEditorTheme } from "./test-themes.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

const up = "\x1b[A";
const down = "\x1b[B";
const right = "\x1b[C";

function createEditor(historyCursorFirst: boolean): Editor {
	return new Editor(new TuiMainScreen(new VirtualTerminal()), defaultEditorTheme, { historyCursorFirst });
}

afterEach(() => setKeybindings(new KeybindingsManager(TUI_KEYBINDINGS)));

describe("Cursor-first prompt history", () => {
	it("keeps the upstream history behavior by default", () => {
		const editor = new Editor(new TuiMainScreen(new VirtualTerminal()), defaultEditorTheme);
		assert.equal(editor.getHistoryCursorFirst(), false);
		editor.addToHistory("older");
		editor.addToHistory("newer");
		editor.handleInput(up);
		editor.handleInput(right);
		editor.handleInput(up);
		assert.equal(editor.getText(), "older");
		editor.handleInput(down);
		assert.equal(editor.getText(), "newer");
	});

	it("reaches the line start before changing an older entry", () => {
		const editor = createEditor(true);
		editor.addToHistory("older");
		editor.addToHistory("newer");
		editor.setText("draft");
		editor.handleInput(up);
		assert.equal(editor.getText(), "draft");
		assert.deepEqual(editor.getCursor(), { line: 0, col: 0 });
		editor.handleInput(up);
		assert.equal(editor.getText(), "newer");
		editor.handleInput(right);
		editor.handleInput(up);
		assert.equal(editor.getText(), "newer");
		assert.deepEqual(editor.getCursor(), { line: 0, col: 0 });
		editor.handleInput(up);
		assert.equal(editor.getText(), "older");
	});

	it("reaches the line end before restoring the draft", () => {
		const editor = createEditor(true);
		editor.addToHistory("entry");
		editor.setText("draft");
		editor.handleInput(up);
		editor.handleInput(up);
		editor.handleInput(down);
		assert.equal(editor.getText(), "entry");
		assert.deepEqual(editor.getCursor(), { line: 0, col: 5 });
		editor.handleInput(down);
		assert.equal(editor.getText(), "draft");
		assert.deepEqual(editor.getCursor(), { line: 0, col: 0 });
	});

	for (const entry of ["first line\nlast line", "abcdefghijklmnop", "\u4f60\u597d\u4e16\u754c\u{1f680}"]) {
		it(`moves through visual lines before leaving history: ${entry}`, () => {
			const editor = createEditor(true);
			editor.addToHistory("older");
			editor.addToHistory(entry);
			editor.handleInput(up);
			editor.render(9);
			const lines = entry.split("\n");
			const end = { line: lines.length - 1, col: lines.at(-1)!.length };
			let moves = 0;
			let cursor = editor.getCursor();
			while ((cursor.line !== end.line || cursor.col !== end.col) && moves < entry.length + 1) {
				editor.handleInput(down);
				assert.equal(editor.getText(), entry);
				cursor = editor.getCursor();
				moves++;
			}
			assert.deepEqual(editor.getCursor(), end);
			editor.handleInput(down);
			assert.equal(editor.getText(), "");
		});
	}

	for (const historyCursorFirst of [false, true]) {
		it(`dedicated history bypasses cursor movement (cursor-first: ${historyCursorFirst})`, () => {
			setKeybindings(
				new KeybindingsManager(TUI_KEYBINDINGS, {
					"tui.editor.historyPrevious": "ctrl+p",
					"tui.editor.historyNext": "ctrl+n",
				}),
			);
			const editor = createEditor(historyCursorFirst);
			editor.addToHistory("older");
			editor.addToHistory("newer\nentry");
			editor.setText("draft");
			editor.handleInput("\x1b[D");
			const draftCursor = editor.getCursor();
			editor.handleInput("\x10");
			assert.equal(editor.getText(), "newer\nentry");
			editor.handleInput(right);
			editor.handleInput("\x10");
			assert.equal(editor.getText(), "older");
			editor.handleInput("\x0e");
			assert.equal(editor.getText(), "newer\nentry");
			editor.handleInput("\x0e");
			assert.equal(editor.getText(), "draft");
			assert.deepEqual(editor.getCursor(), draftCursor);
		});
	}

	it("can change modes while browsing without losing the draft", () => {
		const editor = createEditor(true);
		editor.addToHistory("entry");
		editor.setText("draft");
		editor.handleInput(up);
		editor.handleInput(up);
		editor.handleInput(right);
		editor.setHistoryCursorFirst(false);
		assert.equal(editor.getHistoryCursorFirst(), false);
		assert.equal(editor.getText(), "entry");
		assert.deepEqual(editor.getCursor(), { line: 0, col: 1 });
		editor.handleInput(down);
		assert.equal(editor.getText(), "draft");
		editor.setHistoryCursorFirst(true);
		assert.equal(editor.getHistoryCursorFirst(), true);
	});
});
