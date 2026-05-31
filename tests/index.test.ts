import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted runs before vi.mock factory
const { vol, memfs } = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { Volume, createFsFromVolume } = require("memfs");
	const v = new Volume();
	const fs = createFsFromVolume(v);
	return { vol: v, memfs: fs };
});

vi.mock("node:fs", () => memfs);

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import planModeExtension from "../extensions/plan-mode/index.ts";
import { createMockPi } from "./helpers/pi-mock.ts";

beforeEach(() => {
	vol.reset();
	memfs.mkdirSync("/tmp", { recursive: true });
});

describe("planModeExtension", () => {
	it("registers message renderer", () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		planModeExtension(pi);
		const calls = (pi as unknown as ReturnType<typeof createMockPi>)
			.registerMessageRenderer.mock.calls;
		expect(calls.some((c: [string]) => c[0] === "plan-content")).toBe(true);
	});

	it("registers --plan flag", () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		planModeExtension(pi);
		const calls = (pi as unknown as ReturnType<typeof createMockPi>)
			.registerFlag.mock.calls;
		expect(calls.some((c: [string]) => c[0] === "plan")).toBe(true);
	});

	it("registers /plan, /plans, and /execute_plan commands", () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		planModeExtension(pi);
		const calls = (pi as unknown as ReturnType<typeof createMockPi>)
			.registerCommand.mock.calls;
		const names = calls.map((c: [string]) => c[0]);
		expect(names).toContain("plan");
		expect(names).toContain("plans");
		expect(names).toContain("execute_plan");
	});

	it("registers plan_write, plan_read, plan_list, and plan_question tools", () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		planModeExtension(pi);
		const calls = (pi as unknown as ReturnType<typeof createMockPi>)
			.registerTool.mock.calls;
		const names = calls.map((c: [{ name: string }]) => c[0].name);
		expect(names).toContain("plan_write");
		expect(names).toContain("plan_read");
		expect(names).toContain("plan_list");
		expect(names).toContain("plan_question");
	});

	it("registers 6 event hooks", () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		planModeExtension(pi);
		const calls = (pi as unknown as ReturnType<typeof createMockPi>).on.mock
			.calls;
		const eventNames = calls.map((c: [string]) => c[0]);
		expect(eventNames).toContain("tool_call");
		expect(eventNames).toContain("before_agent_start");
		expect(eventNames).toContain("turn_end");
		expect(eventNames).toContain("agent_end");
		expect(eventNames).toContain("session_start");
		expect(eventNames).toContain("context");
	});

	it("registers Ctrl+Alt+P shortcut", () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		planModeExtension(pi);
		const calls = (pi as unknown as ReturnType<typeof createMockPi>)
			.registerShortcut.mock.calls;
		expect(calls).toHaveLength(1);
		const shortcut = calls[0];
		expect(shortcut[1].description).toContain("Toggle plan mode");
	});
});
