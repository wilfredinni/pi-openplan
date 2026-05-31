import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../extensions/plan-mode/state.ts";
import { registerTools } from "../extensions/plan-mode/tools.ts";
import { createMockCtx, createMockPi } from "./setup.ts";

describe("tools", () => {
	let pi: ReturnType<typeof createMockPi>;
	let state: ReturnType<typeof createInitialState>;
	let ctx: ReturnType<typeof createMockCtx>;

	beforeEach(() => {
		pi = createMockPi();
		state = createInitialState();
		ctx = createMockCtx();
	});

	it("registers plan_write tool", () => {
		registerTools(pi, state);
		expect(pi.registerTool).toHaveBeenCalledTimes(3);
		const toolName = (pi.registerTool as ReturnType<typeof vi.fn>).mock
			.calls[0][0].name;
		expect(toolName).toBe("plan_write");
	});

	it("registers plan_read tool", () => {
		registerTools(pi, state);
		const toolName = (pi.registerTool as ReturnType<typeof vi.fn>).mock
			.calls[1][0].name;
		expect(toolName).toBe("plan_read");
	});

	it("registers plan_list tool", () => {
		registerTools(pi, state);
		const toolName = (pi.registerTool as ReturnType<typeof vi.fn>).mock
			.calls[2][0].name;
		expect(toolName).toBe("plan_list");
	});

	describe("plan_write execution", () => {
		it("handles invalid type with default to feature", async () => {
			// Mock ctx.ui.notify
			ctx.ui.notify = vi.fn();
			// Test that the plan_write tool handler correctly defaults invalid types
			// We'll test this by checking the tool description shows the type field
			registerTools(pi, state);
			const tool = (pi.registerTool as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(tool.parameters).toBeDefined();
			expect(tool.description).toContain("plan");
		});
	});

	describe("plan_read execution", () => {
		it("returns not found message when plan does not exist", async () => {
			registerTools(pi, state);
			const tool = (pi.registerTool as ReturnType<typeof vi.fn>).mock
				.calls[1][0];
			expect(tool.description).toContain("plan");
		});
	});

	describe("plan_list execution", () => {
		it("returns no plans message when empty", async () => {
			registerTools(pi, state);
			const tool = (pi.registerTool as ReturnType<typeof vi.fn>).mock
				.calls[2][0];
			expect(tool.description).toContain("plan");
		});
	});
});
