import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerEvents } from "../extensions/plan-mode/events.ts";
import { PLAN_MODE_TOOLS } from "../extensions/plan-mode/state.ts";
import {
	createCallbacks,
	createMockCtx,
	createMockPi,
	createTestState,
} from "./helpers.ts";

describe("events", () => {
	let pi: ReturnType<typeof createMockPi>;
	let state: ReturnType<typeof createTestState>;
	let callbacks: ReturnType<typeof createCallbacks>;

	beforeEach(() => {
		pi = createMockPi();
		state = createTestState();
		callbacks = createCallbacks();
		registerEvents(pi, state, callbacks);
	});

	describe("tool_call (bash safety)", () => {
		function getHandler() {
			return (pi.on as ReturnType<typeof vi.fn>).mock.calls.find(
				(c: unknown[]) => c[0] === "tool_call",
			)?.[1] as Function;
		}

		it("blocks destructive bash in plan mode", async () => {
			state.planModeEnabled = true;
			const handler = getHandler();
			const result = await handler({
				toolName: "bash",
				input: { command: "rm -rf /" },
			});
			expect(result).toBeDefined();
			expect(result.block).toBe(true);
			expect(result.reason).toContain("destructive command blocked");
		});

		it("allows safe bash in plan mode", async () => {
			state.planModeEnabled = true;
			const handler = getHandler();
			const result = await handler({
				toolName: "bash",
				input: { command: "ls -la" },
			});
			expect(result).toBeUndefined();
		});

		it("passes through when plan mode disabled", async () => {
			state.planModeEnabled = false;
			const handler = getHandler();
			const result = await handler({
				toolName: "bash",
				input: { command: "rm -rf /" },
			});
			expect(result).toBeUndefined();
		});

		it("passes through non-bash tools", async () => {
			state.planModeEnabled = true;
			const handler = getHandler();
			const result = await handler({
				toolName: "read",
				input: { path: "file.txt" },
			});
			expect(result).toBeUndefined();
		});
	});

	describe("before_agent_start (prompts)", () => {
		function getHandler() {
			return (pi.on as ReturnType<typeof vi.fn>).mock.calls.find(
				(c: unknown[]) => c[0] === "before_agent_start",
			)?.[1] as Function;
		}

		it("injects full system prompt on first plan mode turn", async () => {
			state.planModeEnabled = true;
			const handler = getHandler();
			const result = await handler();
			expect(result).toBeDefined();
			expect(result.message.customType).toBe("plan-mode-context");
			expect(result.message.content).toContain("[Plan Mode]");
			expect(state.planModeTurnCount).toBe(1);
		});

		it("injects brief prompt on second+ plan mode turn", async () => {
			state.planModeEnabled = true;
			state.planModeTurnCount = 1;
			const handler = getHandler();
			const result = await handler();
			expect(result).toBeDefined();
			expect(result.message.content).toContain("[Plan Mode]");
			expect(result.message.content.length).toBeLessThan(1000);
			expect(state.planModeTurnCount).toBe(2);
		});

		it("does nothing when not in plan mode or execution mode", async () => {
			const handler = getHandler();
			const result = await handler();
			expect(result).toBeUndefined();
		});
	});

	describe("turn_end (DONE tracking)", () => {
		function getHandler() {
			return (pi.on as ReturnType<typeof vi.fn>).mock.calls.find(
				(c: unknown[]) => c[0] === "turn_end",
			)?.[1] as Function;
		}

		it("marks step completed when DONE marker found", async () => {
			state.executionMode = true;
			state.todoItems = [{ step: 1, text: "Setup", completed: false }];
			const handler = getHandler();
			const ctx = createMockCtx();

			await handler(
				{
					message: {
						role: "assistant",
						content: [{ type: "text", text: "[DONE:1]" }],
					},
				},
				ctx,
			);

			expect(state.todoItems[0].completed).toBe(true);
			expect(callbacks.updateUI).toHaveBeenCalledWith(ctx);
			expect(callbacks.persistState).toHaveBeenCalled();
		});

		it("skips when not in execution mode", async () => {
			const handler = getHandler();

			await handler(
				{
					message: {
						role: "assistant",
						content: [{ type: "text", text: "[DONE:1]" }],
					},
				},
				createMockCtx(),
			);

			expect(callbacks.updateUI).not.toHaveBeenCalled();
		});
	});

	describe("agent_end (completion)", () => {
		function getHandler() {
			return (pi.on as ReturnType<typeof vi.fn>).mock.calls.find(
				(c: unknown[]) => c[0] === "agent_end",
			)?.[1] as Function;
		}

		it("triggers plan complete when all todos done", async () => {
			state.executionMode = true;
			state.todoItems = [{ step: 1, text: "Setup", completed: true }];
			const handler = getHandler();
			const ctx = createMockCtx();

			await handler({ messages: [] }, ctx);

			expect(state.executionMode).toBe(false);
			expect(state.todoItems).toEqual([]);
			expect(pi.setActiveTools).toHaveBeenCalled();
			expect(pi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({ customType: "plan-complete" }),
				expect.any(Object),
			);
		});

		it("does not trigger for not-all-done", async () => {
			state.executionMode = true;
			state.todoItems = [{ step: 1, text: "Setup", completed: false }];
			const handler = getHandler();
			const ctx = createMockCtx();

			await handler({ messages: [] }, ctx);
			expect(state.executionMode).toBe(true);
		});
	});

	describe("session_start (restore)", () => {
		function getHandler() {
			return (pi.on as ReturnType<typeof vi.fn>).mock.calls.find(
				(c: unknown[]) => c[0] === "session_start",
			)?.[1] as Function;
		}

		it("sets plan mode when --plan flag is true", async () => {
			vi.mocked(pi.getFlag).mockReturnValue(true);
			const handler = getHandler();
			const ctx = createMockCtx({
				sessionManager: {
					getEntries: vi.fn().mockReturnValue([]),
					getBranch: vi.fn().mockReturnValue([]),
				} as unknown as ExtensionContext["sessionManager"],
			});

			await handler({}, ctx);
			expect(state.planModeEnabled).toBe(true);
		});
	});

	describe("context (filter)", () => {
		function getHandler() {
			return (pi.on as ReturnType<typeof vi.fn>).mock.calls.find(
				(c: unknown[]) => c[0] === "context",
			)?.[1] as Function;
		}

		it("filters plan-mode-context messages when not in plan or execution mode", async () => {
			const handler = getHandler();
			const result = await handler({
				messages: [
					{ role: "user", content: "hello" },
					{
						customType: "plan-mode-context",
						content: "prompt",
						display: false,
					},
				],
			});

			expect(result).toBeDefined();
			expect(result.messages).toHaveLength(1);
			expect(result.messages[0]).toEqual({ role: "user", content: "hello" });
		});

		it("returns undefined (no-op) when plan mode is active", async () => {
			state.planModeEnabled = true;
			const handler = getHandler();
			const result = await handler({
				messages: [
					{ role: "user", content: "hello" },
					{
						customType: "plan-mode-context",
						content: "prompt",
						display: false,
					},
				],
			});

			// Handler returns early (undefined) when plan mode is active
			expect(result).toBeUndefined();
		});
	});
});
