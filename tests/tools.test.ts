import { beforeEach, describe, expect, it, type vi } from "vitest";
import { registerTools } from "../extensions/plan-mode/tools.ts";
import { createMockCtx, createMockPi } from "./helpers.ts";

describe("tools", () => {
	let pi: ReturnType<typeof createMockPi>;
	let testId = 0;

	beforeEach(() => {
		pi = createMockPi();
		registerTools(pi);
		testId++;
	});

	describe("plan_write", () => {
		it("registers the tool", () => {
			expect(pi.registerTool).toHaveBeenCalledWith(
				expect.objectContaining({ name: "plan_write" }),
			);
		});

		it("writes a plan and returns success", async () => {
			const toolCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_write",
			)?.[0] as { execute: Function };
			const ctx = createMockCtx();

			const result = await toolCall.execute(
				"id1",
				{
					filename: "test-plan",
					title: "Test Plan",
					content: "## Phase 1:\nSetup",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.isError).toBeFalsy();
			expect(result.content[0].text).toContain("Plan saved");
			expect(ctx.ui.notify).toHaveBeenCalled();
			expect(pi.sendMessage).toHaveBeenCalled();
		});

		it("handles errors gracefully", async () => {
			const toolCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_write",
			)?.[0] as { execute: Function };

			// Mock cwd to cause an error (invalid path)
			const ctx = createMockCtx({ cwd: "/nonexistent/deep/path" });

			const result = await toolCall.execute(
				"id1",
				{
					filename: "test-plan",
					title: "Test",
					content: "## Content",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.isError).toBe(true);
		});
	});

	describe("plan_read", () => {
		it("registers the tool", () => {
			expect(pi.registerTool).toHaveBeenCalledWith(
				expect.objectContaining({ name: "plan_read" }),
			);
		});

		it("returns not-found for missing plan", async () => {
			const toolCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_read",
			)?.[0] as { execute: Function };
			const ctx = createMockCtx();

			const result = await toolCall.execute(
				"id1",
				{
					filename: "nonexistent",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toContain("No plan found");
		});
	});

	describe("plan_list", () => {
		it("registers the tool", () => {
			expect(pi.registerTool).toHaveBeenCalledWith(
				expect.objectContaining({ name: "plan_list" }),
			);
		});

		it("returns empty list when no plans exist", async () => {
			const toolCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_list",
			)?.[0] as { execute: Function };
			// Use unique CWD to avoid cross-test FS pollution
			const ctx = createMockCtx({ cwd: `/tmp/test-${testId}` });

			const result = await toolCall.execute(
				"id1",
				{},
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toContain("No plans found");
		});
	});
});
