import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted runs before vi.mock factory — safe for creating memfs volume
const { vol, memfs } = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { Volume, createFsFromVolume } = require("memfs");
	const v = new Volume();
	const fs = createFsFromVolume(v);
	return { vol: v, memfs: fs };
});

vi.mock("node:fs", () => memfs);

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "../extensions/plan-mode/commands.ts";
import {
	createInitialState,
	NORMAL_MODE_TOOLS,
} from "../extensions/plan-mode/state.ts";
import {
	createCallbacks,
	createMockCtx,
	createMockPi,
} from "./helpers/pi-mock.ts";

const CWD = "/test";

beforeEach(() => {
	vol.reset();
	memfs.mkdirSync(CWD, { recursive: true });
});

function findCommand(pi: ReturnType<typeof createMockPi>, name: string) {
	return pi.registerCommand.mock.calls.find(
		(c: [string]) => c[0] === name,
	)?.[1];
}

describe("/plan command", () => {
	it("registers a 'plan' command", () => {
		const pi = createMockPi();
		const state = createInitialState();
		const callbacks = createCallbacks();
		registerCommands(pi as unknown as ExtensionAPI, state, callbacks);

		const cmd = findCommand(pi, "plan");
		expect(cmd).toBeDefined();
		expect(cmd.description).toContain("Toggle plan mode");
	});

	it("calls togglePlanMode when handler is invoked", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		const state = createInitialState();
		const callbacks = createCallbacks();
		registerCommands(pi, state, callbacks);

		const cmd = findCommand(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan",
		);
		await cmd.handler("", createMockCtx());
		expect(callbacks.togglePlanMode).toHaveBeenCalled();
	});
});

describe("/plans command", () => {
	it("registers a 'plans' command", () => {
		const pi = createMockPi();
		const state = createInitialState();
		const callbacks = createCallbacks();
		registerCommands(pi as unknown as ExtensionAPI, state, callbacks);

		const cmd = findCommand(pi, "plans");
		expect(cmd).toBeDefined();
	});

	it("shows 'No saved plans' when empty", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		const state = createInitialState();
		const callbacks = createCallbacks();
		registerCommands(pi, state, callbacks);

		const cmd = findCommand(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plans",
		);
		const ctx = createMockCtx({ cwd: CWD });
		await cmd.handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith("No saved plans.", "info");
	});

	it("lists plans when they exist", async () => {
		// Create a plan first
		memfs.mkdirSync(`${CWD}/.pi/plans`, { recursive: true });
		memfs.writeFileSync(
			`${CWD}/.pi/plans/my-plan.md`,
			'---\ntitle: "My Plan"\nstatus: draft\ncreated: "2025-01-01"\ntype: feature\n---\n\nBody',
		);

		const pi = createMockPi() as unknown as ExtensionAPI;
		const state = createInitialState();
		const callbacks = createCallbacks();
		registerCommands(pi, state, callbacks);

		const cmd = findCommand(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plans",
		);
		const ctx = createMockCtx({ cwd: CWD });
		await cmd.handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalled();
		expect(ctx.ui.notify.mock.calls[0][0]).toContain("My Plan");
	});
});

describe("/execute_plan command", () => {
	it("registers 'execute_plan' command", () => {
		const pi = createMockPi();
		const state = createInitialState();
		const callbacks = createCallbacks();
		registerCommands(pi as unknown as ExtensionAPI, state, callbacks);

		const cmd = findCommand(pi, "execute_plan");
		expect(cmd).toBeDefined();
	});

	it("enters execution mode without plan name (from plan mode)", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		const state = createInitialState();
		state.planModeEnabled = true;
		const callbacks = createCallbacks();
		registerCommands(pi, state, callbacks);

		const ctx = createMockCtx();
		const cmd = findCommand(
			pi as unknown as ReturnType<typeof createMockPi>,
			"execute_plan",
		);
		await cmd.handler("", ctx);

		expect(state.planModeEnabled).toBe(false);
		expect(state.executionMode).toBe(true);
		expect(pi.setActiveTools).toHaveBeenCalledWith(NORMAL_MODE_TOOLS);
	});

	it("exits plan mode and enters execution when plan mode is on", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		const state = createInitialState();
		state.planModeEnabled = true;
		const callbacks = createCallbacks();
		registerCommands(pi, state, callbacks);

		const ctx = createMockCtx();
		const cmd = findCommand(
			pi as unknown as ReturnType<typeof createMockPi>,
			"execute_plan",
		);
		await cmd.handler("", ctx);

		expect(state.planModeEnabled).toBe(false);
		expect(state.executionMode).toBe(true);
	});

	it("handles plan not found gracefully", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		const state = createInitialState();
		const callbacks = createCallbacks();
		registerCommands(pi, state, callbacks);

		const ctx = createMockCtx({ cwd: CWD });
		const cmd = findCommand(
			pi as unknown as ReturnType<typeof createMockPi>,
			"execute_plan",
		);
		await cmd.handler("nonexistent", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("No plan found"),
			"warning",
		);
	});

	it("loads plan and extracts todos when plan name provided", async () => {
		memfs.mkdirSync(`${CWD}/.pi/plans`, { recursive: true });
		const planContent =
			'---\ntitle: "My Plan"\nstatus: draft\ncreated: "2025-01-01"\ntype: feature\n---\n\n**Phase 1**\nSetup\n\n**Phase 2**\nBuild';
		memfs.writeFileSync(`${CWD}/.pi/plans/my-plan.md`, planContent);

		const pi = createMockPi() as unknown as ExtensionAPI;
		const state = createInitialState();
		state.planModeEnabled = true;
		const callbacks = createCallbacks();
		registerCommands(pi, state, callbacks);

		const ctx = createMockCtx({ cwd: CWD });
		const cmd = findCommand(
			pi as unknown as ReturnType<typeof createMockPi>,
			"execute_plan",
		);
		await cmd.handler("my-plan", ctx);

		expect(state.todoItems.length).toBeGreaterThan(0);
		expect(state.planModeEnabled).toBe(false);
		expect(state.executionMode).toBe(true);
	});
});
