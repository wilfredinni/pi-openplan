import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerEvents } from "../extensions/plan-mode/events.ts";
import { createInitialState } from "../extensions/plan-mode/state.ts";
import { createMockCtx, createMockPi } from "./setup.ts";

describe("events", () => {
	let pi: ReturnType<typeof createMockPi>;
	let state: ReturnType<typeof createInitialState>;
	let ctx: ReturnType<typeof createMockCtx>;
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
		ctx = createMockCtx();
		callbacks = {
			updateUI: vi.fn(),
			persistState: vi.fn(),
			togglePlanMode: vi.fn(),
			enterPlanMode: vi.fn(),
			exitPlanMode: vi.fn(),
		};

		// Initialize various pi mocks
		pi.sendMessage = vi.fn();
		pi.sendUserMessage = vi.fn();
		pi.appendEntry = vi.fn();
		pi.setActiveTools = vi.fn();
		pi.getFlag = vi.fn();
		ctx.sessionManager.getEntries = vi.fn().mockReturnValue([]);

		registerEvents(pi, state, callbacks);
	});

	it("registers tool_call event handler", () => {
		expect(pi.on).toHaveBeenCalledWith("tool_call", expect.any(Function));
	});

	it("registers before_agent_start event handler", () => {
		expect(pi.on).toHaveBeenCalledWith(
			"before_agent_start",
			expect.any(Function),
		);
	});

	it("registers turn_end event handler", () => {
		expect(pi.on).toHaveBeenCalledWith("turn_end", expect.any(Function));
	});

	it("registers agent_end event handler", () => {
		expect(pi.on).toHaveBeenCalledWith("agent_end", expect.any(Function));
	});

	it("registers session_start event handler", () => {
		expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
	});

	it("registers context event handler", () => {
		expect(pi.on).toHaveBeenCalledWith("context", expect.any(Function));
	});

	it("registers 6 event handlers total", () => {
		expect(pi.on).toHaveBeenCalledTimes(6);
	});
});
