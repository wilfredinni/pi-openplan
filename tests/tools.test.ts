import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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

import { registerTools } from "../extensions/plan-mode/tools.ts";
import { createMockCtx, createMockPi } from "./helpers/pi-mock.ts";

const CWD = "/test";

beforeEach(() => {
	vol.reset();
	memfs.mkdirSync(CWD, { recursive: true });
});

function findTool(pi: ReturnType<typeof createMockPi>, name: string) {
	return pi.registerTool.mock.calls.find(
		(c: [{ name: string }]) => c[0].name === name,
	)?.[0];
}

describe("plan_write tool", () => {
	it("registers plan_write tool", () => {
		const pi = createMockPi();
		registerTools(pi as unknown as ExtensionAPI);
		expect(pi.registerTool).toHaveBeenCalled();
		const tool = findTool(pi, "plan_write");
		expect(tool).toBeDefined();
		expect(tool.name).toBe("plan_write");
	});

	it("creates a plan file and returns path", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		registerTools(pi);
		const tool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_write",
		);

		const result = await tool.execute(
			"call-1",
			{ filename: "test-plan", title: "Test Plan", content: "Plan body" },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		expect(result.isError).toBeFalsy();
		expect(result.details.path).toContain(".pi/plans/");
		expect(result.details.path).toContain("test-plan");

		// Verify file was created
		const content = memfs.readFileSync(result.details.path, "utf-8");
		expect(content).toContain("Plan body");
	});

	it("handles error gracefully", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		registerTools(pi);
		const tool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_write",
		);

		const result = await tool.execute(
			"call-2",
			{ filename: "", title: "", content: "" },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		// Should not crash
		expect(result).toBeDefined();
	});
});

describe("plan_read tool", () => {
	it("reads an existing plan", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		registerTools(pi);

		// Create plan file via plan_write
		const writeTool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_write",
		);
		await writeTool.execute(
			"call-1",
			{ filename: "read-test", title: "Read Test", content: "Body content" },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		// Read via plan_read
		const readTool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_read",
		);
		const result = await readTool.execute(
			"call-2",
			{ filename: "read-test" },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		expect(result.isError).toBeFalsy();
		expect(result.content[0].text).toContain("Read Test");
		expect(result.content[0].text).toContain("Body content");
	});

	it("returns metadata-only when full:false", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		registerTools(pi);

		const writeTool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_write",
		);
		await writeTool.execute(
			"call-1",
			{ filename: "meta-test", title: "Meta", content: "Body" },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		const readTool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_read",
		);
		const result = await readTool.execute(
			"call-2",
			{ filename: "meta-test", full: false },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		expect(result.content[0].text).toContain("Meta");
		expect(result.content[0].text).toContain("[");
	});

	it("returns not found message for missing plan", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		registerTools(pi);
		const readTool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_read",
		);

		const result = await readTool.execute(
			"call-1",
			{ filename: "nonexistent" },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		expect(result.content[0].text).toContain("No plan found");
	});
});

describe("plan_list tool", () => {
	it("lists all plans", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		registerTools(pi);

		// Create two plans
		const writeTool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_write",
		);
		await writeTool.execute(
			"call-1",
			{ filename: "plan-a", title: "Plan A", content: "A" },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);
		await writeTool.execute(
			"call-2",
			{ filename: "plan-b", title: "Plan B", content: "B" },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		const listTool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_list",
		);
		const result = await listTool.execute(
			"call-3",
			{},
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		expect(result.content[0].text).toContain("Plan A");
		expect(result.content[0].text).toContain("Plan B");
		expect(result.details.plans).toHaveLength(2);
	});

	it("returns empty when no plans exist", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		registerTools(pi);
		const listTool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_list",
		);

		const result = await listTool.execute(
			"call-1",
			{},
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		expect(result.content[0].text).toBe("No plans found.");
	});

	it("filters by status when provided", async () => {
		const pi = createMockPi() as unknown as ExtensionAPI;
		registerTools(pi);

		const writeTool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_write",
		);
		await writeTool.execute(
			"call-1",
			{ filename: "draft-plan", title: "Draft", content: "Draft body" },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		const listTool = findTool(
			pi as unknown as ReturnType<typeof createMockPi>,
			"plan_list",
		);
		const resultByStatus = await listTool.execute(
			"call-2",
			{ status: "draft" },
			new AbortController().signal,
			vi.fn(),
			createMockCtx({ cwd: CWD }),
		);

		expect(resultByStatus.content[0].text).toContain("Draft");
	});
});
