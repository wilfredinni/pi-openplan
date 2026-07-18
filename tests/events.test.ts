import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerEvents } from "../extensions/plan-mode/events.ts";
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
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
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
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[1] as Function;
		}

		it("mutates systemPrompt with stable append in plan mode", async () => {
			state.planModeEnabled = true;
			const handler = getHandler();
			const result = await handler({ systemPrompt: "BASE" });
			expect(result).toBeDefined();
			expect(result.systemPrompt).toContain("BASE");
			expect(result.systemPrompt).toContain("[Plan Mode]");
			expect(result.systemPrompt).toContain("READ-ONLY");
			// No message injection — instructions live in systemPrompt
			expect(result.message).toBeUndefined();
		});

		it("returns same systemPrompt on second turn (stable, no full/brief split)", async () => {
			state.planModeEnabled = true;
			const handler = getHandler();
			const turn1 = await handler({ systemPrompt: "BASE" });
			const turn2 = await handler({ systemPrompt: "BASE" });
			// Byte-identical systemPrompt mutations across turns → KV cache stable
			expect(turn1.systemPrompt).toBe(turn2.systemPrompt);
		});

		it("does nothing when not in plan mode or execution mode", async () => {
			const handler = getHandler();
			const result = await handler({ systemPrompt: "BASE" });
			expect(result).toBeUndefined();
		});

		it("mutates systemPrompt with stable append in execution mode (no todoItems)", async () => {
			state.executionMode = true;
			const handler = getHandler();
			const result = await handler({ systemPrompt: "BASE" });
			expect(result).toBeDefined();
			expect(result.systemPrompt).toContain("BASE");
			expect(result.systemPrompt).toContain("[Executing Plan]");
			expect(result.systemPrompt).toContain("[DONE:n]");
			expect(result.message).toBeUndefined();
		});

		it("does NOT embed remaining steps in execution systemPrompt (KV-cache stable)", async () => {
			state.executionMode = true;
			state.todoItems = [
				{ step: 1, text: "Phase 1", completed: false },
				{ step: 2, text: "Phase 2", completed: true },
			];
			const handler = getHandler();
			const result = await handler({ systemPrompt: "BASE" });
			expect(result).toBeDefined();
			// Remaining steps MUST NOT appear in the system prompt — they'd change every turn
			expect(result.systemPrompt).not.toContain("Phase 1");
			expect(result.systemPrompt).not.toContain("Phase 2");
			expect(result.systemPrompt).not.toContain("Remaining steps");
		});
	});

	describe("turn_end (DONE tracking)", () => {
		function getHandler() {
			return (pi.on as ReturnType<typeof vi.fn>).mock.calls.find(
				(c: unknown[]) => c[0] === "turn_end",
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
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
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
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
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
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
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[1] as Function;
		}

		it("strips plan-mode-context and plan-execution-context messages regardless of mode", async () => {
			// These custom-type messages are legacy — instructions now live in stable systemPrompt blocks.
			// Strip them in ALL modes for backward compatibility.
			const handler = getHandler();
			const result = await handler({
				messages: [
					{ role: "user", content: "hello" },
					{
						customType: "plan-mode-context",
						content: "prompt",
						display: false,
					},
					{ role: "user", content: "world" },
					{
						customType: "plan-execution-context",
						content: "exec prompt",
						display: false,
					},
				],
			});

			expect(result).toBeDefined();
			expect(result.messages).toHaveLength(2);
			expect(result.messages[0]).toEqual({ role: "user", content: "hello" });
			expect(result.messages[1]).toEqual({ role: "user", content: "world" });
		});

		it("strips [Plan Mode ACTIVE] from user messages", async () => {
			const handler = getHandler();
			const result = await handler({
				messages: [
					{ role: "user", content: "[Plan Mode ACTIVE] Check this" },
					{ role: "user", content: "hello" },
				],
			});

			expect(result).toBeDefined();
			expect(result.messages).toHaveLength(1);
			expect(result.messages[0]).toEqual({ role: "user", content: "hello" });
		});

		it("strips [Plan Mode ACTIVE] from array-content user messages", async () => {
			const handler = getHandler();
			const result = await handler({
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: "[Plan Mode ACTIVE] Check" }],
					},
					{ role: "user", content: "hello" },
				],
			});

			expect(result).toBeDefined();
			expect(result.messages).toHaveLength(1);
			expect(result.messages[0]).toEqual({ role: "user", content: "hello" });
		});

		it("passes through non-plan messages unchanged", async () => {
			const handler = getHandler();
			const result = await handler({
				messages: [{ role: "user", content: "hello" }],
			});

			expect(result).toBeDefined();
			expect(result.messages).toHaveLength(1);
			expect(result.messages[0]).toEqual({ role: "user", content: "hello" });
		});

		it("passes through assistant messages unchanged", async () => {
			const handler = getHandler();
			const result = await handler({
				messages: [
					{ role: "assistant", content: [{ type: "text", text: "hi" }] },
				],
			});

			expect(result).toBeDefined();
			expect(result.messages).toHaveLength(1);
		});
	});
});
