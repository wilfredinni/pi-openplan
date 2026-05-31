import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCommands } from "../extensions/plan-mode/commands.ts";
import { createInitialState } from "../extensions/plan-mode/state.ts";
import { createMockCtx, createMockPi } from "./setup.ts";

describe("commands", () => {
	let pi: ReturnType<typeof createMockPi>;
	let state: ReturnType<typeof createInitialState>;
	let _ctx: ReturnType<typeof createMockCtx>;
	let callbacks: {
		updateUI: ReturnType<typeof vi.fn>;
		persistState: ReturnType<typeof vi.fn>;
		togglePlanMode: ReturnType<typeof vi.fn>;
		enterPlanMode: ReturnType<typeof vi.fn>;
		exitPlanMode: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		pi = createMockPi();
		state = createInitialState();
		_ctx = createMockCtx();
		callbacks = {
			updateUI: vi.fn(),
			persistState: vi.fn(),
			togglePlanMode: vi.fn(),
			enterPlanMode: vi.fn(),
			exitPlanMode: vi.fn(),
		};

		// Mock sendMessage for /execute_plan
		pi.sendMessage = vi.fn();
		pi.sendUserMessage = vi.fn();
		pi.appendEntry = vi.fn();

		registerCommands(pi, state, callbacks);
	});

	it("registers /plan command", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"plan",
			expect.objectContaining({
				description: expect.stringContaining("plan mode"),
			}),
		);
	});

	it("registers /plans command", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"plans",
			expect.any(Object),
		);
	});

	it("registers /execute_plan command", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"execute_plan",
			expect.any(Object),
		);
	});

	it("registers /tokens command", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"tokens",
			expect.any(Object),
		);
	});

	it("registers /tokens-toggle command", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"tokens-toggle",
			expect.any(Object),
		);
	});

	it("registers /compress-context command", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"compress-context",
			expect.any(Object),
		);
	});
});
