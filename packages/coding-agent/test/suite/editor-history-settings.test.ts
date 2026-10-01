import { setKeybindings } from "@earendil-works/pi-tui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEditorTheme } from "../../../tui/test/test-themes.ts";
import { VirtualTerminal } from "../../../tui/test/virtual-terminal.ts";
import type { AgentSessionRuntime } from "../../src/core/agent-session-runtime.ts";
import { KeybindingsManager } from "../../src/core/keybindings.ts";
import { CustomEditor } from "../../src/modes/interactive/components/custom-editor.ts";
import type { SettingsSelectorComponent } from "../../src/modes/interactive/components/settings-selector.ts";
import { InteractiveMode } from "../../src/modes/interactive/interactive-mode.ts";
import { initTheme } from "../../src/modes/interactive/theme/theme.ts";
import { createHarness, type Harness } from "./harness.ts";

let harness: Harness;
let mode: InteractiveMode;

beforeEach(async () => {
	harness = await createHarness();
	vi.stubEnv("PI_CODING_AGENT_DIR", harness.tempDir);
	initTheme("dark", false);
	const runtime = {
		session: harness.session,
		setBeforeSessionInvalidate: () => {},
		setRebindSession: () => {},
	} as unknown as AgentSessionRuntime;
	mode = new InteractiveMode(runtime, { terminal: new VirtualTerminal() });
});

afterEach(() => {
	mode?.stop();
	harness?.cleanup();
	vi.unstubAllEnvs();
	setKeybindings(new KeybindingsManager());
});

function defaultEditor(): CustomEditor {
	return Reflect.get(mode, "defaultEditor") as CustomEditor;
}

function setCustomEditor(editor?: CustomEditor): void {
	const setEditor = Reflect.get(mode, "setCustomEditorComponent") as (
		factory: (() => CustomEditor) | undefined,
	) => void;
	setEditor.call(mode, editor ? () => editor : undefined);
}

describe("Interactive history settings", () => {
	it("initializes the main editor with cursor-first navigation", () => {
		expect(defaultEditor().getHistoryCursorFirst()).toBe(true);
		defaultEditor().addToHistory("entry");
		defaultEditor().handleInput("\x1b[A");
		defaultEditor().handleInput("\x1b[B");
		expect(defaultEditor().getText()).toBe("entry");
		defaultEditor().handleInput("\x1b[B");
		expect(defaultEditor().getText()).toBe("");
	});

	it("applies reloaded settings to both the default and extension editor", async () => {
		const custom = new CustomEditor(Reflect.get(mode, "ui"), defaultEditorTheme, new KeybindingsManager());
		setCustomEditor(custom);
		expect(custom.getHistoryCursorFirst()).toBe(true);
		harness.settingsManager.setEditorHistoryCursorFirst(false);
		await harness.settingsManager.reload();
		const applySettings = Reflect.get(mode, "applyRuntimeSettings") as () => void;
		applySettings.call(mode);
		expect(defaultEditor().getHistoryCursorFirst()).toBe(false);
		expect(custom.getHistoryCursorFirst()).toBe(false);
		setCustomEditor();
		expect(defaultEditor().getHistoryCursorFirst()).toBe(false);
	});

	it("applies the setting through the full reload command", async () => {
		harness.settingsManager.setEditorHistoryCursorFirst(false);
		const reload = Reflect.get(mode, "handleReloadCommand") as () => Promise<void>;
		await reload.call(mode);
		expect(defaultEditor().getHistoryCursorFirst()).toBe(false);
		expect(harness.settingsManager.getEditorHistoryCursorFirst()).toBe(false);
	});

	it("changes the live editors and persisted settings from the settings selector", async () => {
		const custom = new CustomEditor(Reflect.get(mode, "ui"), defaultEditorTheme, new KeybindingsManager());
		setCustomEditor(custom);
		const showSettings = Reflect.get(mode, "showSettingsSelector") as () => void;
		showSettings.call(mode);
		const selector = Reflect.get(mode, "editorContainer").children[0] as SettingsSelectorComponent;
		const list = selector.getSettingsList();
		list.selectItem("history-cursor-first");
		list.handleInput("\r");
		expect(defaultEditor().getHistoryCursorFirst()).toBe(false);
		expect(custom.getHistoryCursorFirst()).toBe(false);
		await harness.settingsManager.reload();
		expect(harness.settingsManager.getEditorHistoryCursorFirst()).toBe(false);
		list.handleInput("\r");
		expect(defaultEditor().getHistoryCursorFirst()).toBe(true);
		expect(custom.getHistoryCursorFirst()).toBe(true);
	});
});
