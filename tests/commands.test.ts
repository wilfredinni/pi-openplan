import { beforeEach, describe, expect, it, type vi } from "vitest";
import { registerCommands } from "../extensions/plan-mode/commands.ts";
import {
	createCallbacks,
	createMockCtx,
	createMockPi,
	createTestState,
} from "./helpers.ts";

describe("commands", () => {
	let pi: ReturnType<typeof createMockPi>;
	let state: ReturnType<typeof createTestState>;
	let callbacks: ReturnType<typeof createCallbacks>;

	beforeEach(() => {
		pi = createMockPi();
		state = createTestState();
		callbacks = createCallbacks();
		registerCommands(pi, state, callbacks);
	});

	describe("/plan", () => {
		it("registers plan command", () => {
			expect(pi.registerCommand).toHaveBeenCalledWith(
				"plan",
				expect.objectContaining({
					description: expect.stringContaining("plan mode"),
				}),
			);
		});

		it("calls togglePlanMode on handler execution", async () => {
			const cmd = (
				pi.registerCommand as ReturnType<typeof vi.fn>
			).mock.calls.find((c: unknown[]) => c[0] === "plan")?.[1] as {
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
				handler: Function;
			};
			const ctx = createMockCtx();

			await cmd.handler("", ctx);
			expect(callbacks.togglePlanMode).toHaveBeenCalledWith(ctx);
		});
	});

	describe("/plans", () => {
		it("registers plans command", () => {
			expect(pi.registerCommand).toHaveBeenCalledWith(
				"plans",
				expect.objectContaining({
					description: expect.stringContaining("List saved plans"),
				}),
			);
		});

		it("shows empty notification when no plans", async () => {
			const cmd = (
				pi.registerCommand as ReturnType<typeof vi.fn>
			).mock.calls.find((c: unknown[]) => c[0] === "plans")?.[1] as {
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
				handler: Function;
			};
			const ctx = createMockCtx();

			await cmd.handler("", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("No saved plans"),
				expect.any(String),
			);
		});
	});

	describe("/execute_plan", () => {
		it("registers execute_plan command", () => {
			expect(pi.registerCommand).toHaveBeenCalledWith(
				"execute_plan",
				expect.objectContaining({
					description: expect.stringContaining("execute a saved plan"),
				}),
			);
		});

		it("enters execution mode without plan name", async () => {
			const cmd = (
				pi.registerCommand as ReturnType<typeof vi.fn>
			).mock.calls.find((c: unknown[]) => c[0] === "execute_plan")?.[1] as {
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
				handler: Function;
			};
			const ctx = createMockCtx();

			await cmd.handler("", ctx);
			expect(state.executionMode).toBe(true);
			expect(pi.sendUserMessage).toHaveBeenCalled();
		});

		it("handles non-existent plan name from plan mode — rolls back to plan mode", async () => {
			const cmd = (
				pi.registerCommand as ReturnType<typeof vi.fn>
			).mock.calls.find((c: unknown[]) => c[0] === "execute_plan")?.[1] as {
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
				handler: Function;
			};
			state.planModeEnabled = true;
			const ctx = createMockCtx();

			await cmd.handler("nonexistent-plan", ctx);
			// Should abort and roll back to plan mode
			expect(state.executionMode).toBe(false);
			expect(state.planModeEnabled).toBe(true);
			expect(pi.setActiveTools).toHaveBeenLastCalledWith(
				expect.arrayContaining(["plan_write"]),
			);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("No plan found"),
				"error",
			);
		});

		it("handles non-existent plan name from normal mode — does NOT enable plan mode", async () => {
			const cmd = (
				pi.registerCommand as ReturnType<typeof vi.fn>
			).mock.calls.find((c: unknown[]) => c[0] === "execute_plan")?.[1] as {
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
				handler: Function;
			};
			state.planModeEnabled = false;
			const ctx = createMockCtx();

			await cmd.handler("nonexistent-plan", ctx);
			// Should abort WITHOUT enabling plan mode
			expect(state.executionMode).toBe(false);
			expect(state.planModeEnabled).toBe(false);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("No plan found"),
				"error",
			);
		});

		it("preserves existing todoItems when no plan name is given", async () => {
			const cmd = (
				pi.registerCommand as ReturnType<typeof vi.fn>
			).mock.calls.find((c: unknown[]) => c[0] === "execute_plan")?.[1] as {
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
				handler: Function;
			};
			state.todoItems = [{ step: 1, text: "Setup", completed: false }];
			const ctx = createMockCtx();

			await cmd.handler("", ctx);
			expect(state.executionMode).toBe(true);
			expect(state.todoItems).toHaveLength(1);
			expect(state.todoItems[0].text).toBe("Setup");
		});
	});
});
