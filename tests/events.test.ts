import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerEvents } from "../extensions/plan-mode/events.ts";
import { createInitialState } from "../extensions/plan-mode/state.ts";
import {
	createCallbacks,
	createMockCtx,
	createMockPi,
} from "./helpers/pi-mock.ts";

function findHandler(pi: ReturnType<typeof createMockPi>, eventName: string) {
	return pi.on.mock.calls.find((c: [string]) => c[0] === eventName)?.[1];
}

describe("event: tool_call", () => {
	it("blocks destructive bash commands in plan mode", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.planModeEnabled = true;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "tool_call");
		const result = await handler({
			toolName: "bash",
			input: { command: "rm -rf /" },
		});

		expect(result).toBeDefined();
		expect(result.block).toBe(true);
		expect(result.reason).toContain("destructive");
	});

	it("allows safe bash commands in plan mode", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.planModeEnabled = true;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "tool_call");
		const result = await handler({
			toolName: "bash",
			input: { command: "cat file.txt" },
		});

		expect(result).toBeUndefined();
	});

	it("ignores non-bash tools", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.planModeEnabled = true;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "tool_call");
		const result = await handler({
			toolName: "read",
			input: { path: "file.txt" },
		});

		expect(result).toBeUndefined();
	});

	it("passes through when plan mode is disabled", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.planModeEnabled = false;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "tool_call");
		const result = await handler({
			toolName: "bash",
			input: { command: "rm -rf /" },
		});

		expect(result).toBeUndefined();
	});
});

describe("event: before_agent_start", () => {
	it("injects full system prompt on first turn in plan mode", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.planModeEnabled = true;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "before_agent_start");
		const result = await handler();

		expect(result).toBeDefined();
		expect(result.message.customType).toBe("plan-mode-context");
		expect(result.message.display).toBe(false);
		expect(result.message.content).toContain("[Plan Mode]");
		expect(result.message.content).toContain("READ-ONLY");
	});

	it("injects brief prompt after first turn in plan mode", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.planModeEnabled = true;
		state.planModeTurnCount = 1; // Already had one turn
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "before_agent_start");
		const result = await handler();

		expect(result).toBeDefined();
		expect(result.message.content).toContain("[Plan Mode]");
		// Brief prompt doesn't contain Workflow section
		expect(result.message.content).not.toContain("Explore codebase");
	});

	it("increments turnCount", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.planModeEnabled = true;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		expect(state.planModeTurnCount).toBe(0);
		const handler = findHandler(pi, "before_agent_start");
		await handler();
		expect(state.planModeTurnCount).toBe(1);
	});

	it("injects execution prompt when in execution mode with todos", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.executionMode = true;
		state.todoItems = [{ step: 1, text: "Test", completed: false }];
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "before_agent_start");
		const result = await handler();

		expect(result).toBeDefined();
		expect(result.message.customType).toBe("plan-execution-context");
		expect(result.message.content).toContain("Executing Plan");
		expect(result.message.content).toContain("Test");
	});

	it("returns undefined when neither plan nor execution mode active", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.planModeEnabled = false;
		state.executionMode = false;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "before_agent_start");
		const result = await handler();

		expect(result).toBeUndefined();
	});
});

describe("event: turn_end", () => {
	it("marks [DONE:n] steps as completed in execution mode", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.executionMode = true;
		state.todoItems = [{ step: 1, text: "Setup", completed: false }];
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "turn_end");
		const event = {
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Phase [DONE:1] complete" }],
			},
		};
		await handler(event, createMockCtx());

		expect(state.todoItems[0].completed).toBe(true);
		expect(callbacks.updateUI).toHaveBeenCalled();
		expect(callbacks.persistState).toHaveBeenCalled();
	});

	it("does nothing when not in execution mode", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.executionMode = false;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "turn_end");
		await handler(
			{ message: { role: "assistant", content: [] } },
			createMockCtx(),
		);

		expect(callbacks.updateUI).not.toHaveBeenCalled();
	});
});

describe("event: agent_end", () => {
	it("detects completion when all todos done", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		const state = createInitialState();
		state.executionMode = true;
		state.todoItems = [{ step: 1, text: "Done", completed: true }];
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "agent_end");
		await handler(
			{
				messages: [
					{ role: "assistant", content: [{ type: "text", text: "All done" }] },
				],
			},
			createMockCtx(),
		);

		expect(state.executionMode).toBe(false);
		expect(state.todoItems).toHaveLength(0);
		expect(pi.sendMessage).toHaveBeenCalled();
	});

	it("detects pause point when ⏸ in assistant message", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		const state = createInitialState();
		state.executionMode = true;
		state.todoItems = [
			{ step: 1, text: "Phase 1", completed: true },
			{ step: 2, text: "Phase 2", completed: false },
		];
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "agent_end");
		await handler(
			{
				messages: [
					{
						role: "assistant",
						content: [{ type: "text", text: "Done with phase 1 ⏸" }],
					},
				],
			},
			createMockCtx(),
		);

		expect(pi.sendMessage).toHaveBeenCalled();
	});

	it("extracts plan steps from assistant message", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		const state = createInitialState();
		state.planModeEnabled = true;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "agent_end");
		await handler(
			{
				messages: [
					{
						role: "assistant",
						content: [
							{
								type: "text",
								text: "# Plan\n\n**Phase 1**\nSetup\n\n**Phase 2**\nBuild",
							},
						],
					},
				],
			},
			createMockCtx({ hasUI: true }),
		);

		expect(state.todoItems.length).toBeGreaterThan(0);
	});
});

describe("event: session_start", () => {
	it("enables plan mode when --plan flag is set", async () => {
		const pi = createMockPi({ getFlag: vi.fn().mockReturnValue(true) });
		const state = createInitialState();
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "session_start");
		const ctx = createMockCtx({
			sessionManager: { getEntries: vi.fn().mockReturnValue([]) },
		});
		await handler({}, ctx);

		expect(state.planModeEnabled).toBe(true);
	});

	it("restores persisted state from entries", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "session_start");
		const ctx = createMockCtx({
			sessionManager: {
				getEntries: vi.fn().mockReturnValue([
					{
						type: "custom",
						customType: "plan-mode-v2",
						data: {
							enabled: true,
							todos: [{ step: 1, text: "Resumed", completed: false }],
							executing: false,
							turnCount: 3,
						},
					},
				]),
			},
		});
		await handler({}, ctx);

		expect(state.planModeEnabled).toBe(true);
		expect(state.todoItems).toHaveLength(1);
		expect(state.todoItems[0].text).toBe("Resumed");
		expect(state.planModeTurnCount).toBe(3);
	});

	it("applies tool restrictions when in plan mode", async () => {
		const pi = createMockPi({
			getFlag: vi.fn().mockReturnValue(true),
			setActiveTools: vi.fn(),
		});
		const state = createInitialState();
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "session_start");
		const ctx = createMockCtx({
			sessionManager: { getEntries: vi.fn().mockReturnValue([]) },
		});
		await handler({}, ctx);

		expect(pi.setActiveTools).toHaveBeenCalled();
	});
});

describe("event: context", () => {
	it("filters plan-mode context messages when not in plan/execution mode", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.planModeEnabled = false;
		state.executionMode = false;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "context");
		const result = await handler({
			messages: [
				{
					role: "user",
					customType: "plan-mode-context",
					content: "Should filter",
				},
				{ role: "user", content: "Keep me" },
			],
		});

		expect(result).toBeDefined();
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].content).toBe("Keep me");
	});

	it("passes through all messages when in plan mode", async () => {
		const pi = createMockPi();
		const state = createInitialState();
		state.planModeEnabled = true;
		const callbacks = createCallbacks();
		registerEvents(pi as unknown as ExtensionAPI, state, callbacks);

		const handler = findHandler(pi, "context");
		const result = await handler({
			messages: [
				{ role: "user", customType: "plan-mode-context", content: "Keep" },
				{ role: "user", content: "Keep too" },
			],
		});

		// Should return undefined (no filtering) since plan mode is active
		// Actually, looking at the code: if planModeEnabled OR executionMode is true, it returns undefined
		expect(result).toBeUndefined();
	});
});
