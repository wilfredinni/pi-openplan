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
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
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

		it("throws on error (pi runtime sets isError for thrown errors)", async () => {
			const toolCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_write",
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[0] as { execute: Function };

			// Mock cwd to cause an error (invalid path)
			const ctx = createMockCtx({ cwd: "/nonexistent/deep/path" });

			// Tool should throw — pi runtime catches thrown errors and sets isError
			await expect(
				toolCall.execute(
					"id1",
					{
						filename: "test-plan",
						title: "Test",
						content: "## Content",
					},
					undefined,
					undefined,
					ctx,
				),
			).rejects.toThrow();
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
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
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
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[0] as { execute: Function };
			// Use unique CWD to avoid cross-test FS pollution
			const ctx = createMockCtx({ cwd: `/tmp/test-list-${testId}` });

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

	describe("plan_edit", () => {
		it("registers the tool", () => {
			expect(pi.registerTool).toHaveBeenCalledWith(
				expect.objectContaining({ name: "plan_edit" }),
			);
		});

		it("throws when plan not found", async () => {
			const toolCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_edit",
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[0] as { execute: Function };
			const ctx = createMockCtx({ cwd: `/tmp/test-edit-${testId}` });

			await expect(
				toolCall.execute(
					"id1",
					{ filename: "nonexistent", content: "New content" },
					undefined,
					undefined,
					ctx,
				),
			).rejects.toThrow(/Plan not found/);
		});

		it("throws when section not found", async () => {
			// Create a plan first via plan_write
			const writeCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_write",
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[0] as { execute: Function };
			const ctx = createMockCtx({ cwd: `/tmp/test-edit-${testId}` });
			await writeCall.execute(
				"id0",
				{
					filename: "my-plan",
					title: "Test",
					content: "## Overview\n\nContent.",
				},
				undefined,
				undefined,
				ctx,
			);

			const editCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_edit",
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[0] as { execute: Function };

			await expect(
				editCall.execute(
					"id1",
					{ filename: "my-plan", section: "NoSuch", content: "New" },
					undefined,
					undefined,
					ctx,
				),
			).rejects.toThrow(/Section "NoSuch" not found/);
		});

		it("updates section and returns success", async () => {
			const writeCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_write",
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[0] as { execute: Function };
			const ctx = createMockCtx({ cwd: `/tmp/test-edit-${testId}` });
			await writeCall.execute(
				"id0",
				{
					filename: "my-plan",
					title: "Test",
					content: "## Overview\n\nOld overview.\n\n## Phase 1\n\nPhase one.",
				},
				undefined,
				undefined,
				ctx,
			);

			const editCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_edit",
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[0] as { execute: Function };

			const result = await editCall.execute(
				"id1",
				{
					filename: "my-plan",
					section: "Phase 1",
					content: "Updated phase one.",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.isError).toBeFalsy();
			expect(result.content[0].text).toContain("Plan updated");
			expect(result.content[0].text).toContain("Phase 1");
			expect(ctx.ui.notify).toHaveBeenCalled();
			expect(pi.sendMessage).toHaveBeenCalled();
		});

		it("full replace overwrites content without preserving old version", async () => {
			const writeCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_write",
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[0] as { execute: Function };
			const ctx = createMockCtx({ cwd: `/tmp/test-edit-${testId}` });
			await writeCall.execute(
				"id0",
				{
					filename: "my-plan",
					title: "Test",
					content: "## Old Content\n\nOld body.",
				},
				undefined,
				undefined,
				ctx,
			);

			const editCall = (
				pi.registerTool as ReturnType<typeof vi.fn>
			).mock.calls.find(
				(c: unknown[]) => (c[0] as { name: string }).name === "plan_edit",
				// biome-ignore lint/complexity/noBannedTypes: test mock convenience
			)?.[0] as { execute: Function };

			const result = await editCall.execute(
				"id1",
				{ filename: "my-plan", content: "## New Content\n\nNew body." },
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toContain("Plan updated");
			expect(result.content[0].text).toContain("full replace");
		});
	});
});
