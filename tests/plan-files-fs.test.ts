/**
 * Filesystem integration tests for plan-files.ts using memfs.
 *
 * memfs provides an in-memory virtual filesystem. We mock node:fs
 * globally so all fs operations in plan-files.ts use the virtual FS.
 */

import { fs, vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs with memfs — factory is hoisted by vitest
vi.mock("node:fs", () => fs);

import {
	createPlanFile,
	listPlans,
	readPlanFile,
	updatePlanStatus,
} from "../extensions/plan-mode/plan-files.ts";

const TEST_CWD = "/tmp/test";

beforeEach(() => {
	vol.reset();
});

function writeFile(p: string, content: string): void {
	fs.writeFileSync(p, content);
}

function readFile(p: string): string {
	return fs.readFileSync(p, "utf-8") as string;
}

function exists(p: string): boolean {
	return fs.existsSync(p);
}

describe("plan-files filesystem operations", () => {
	describe("createPlanFile", () => {
		it("creates .pi/plans/ directory and writes file", () => {
			const result = createPlanFile(TEST_CWD, "my-plan", "## Content", {
				title: "My Plan",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});

			expect(result.path).toContain(".pi/plans/");
			expect(result.path).toContain("my-plan");
			expect(exists(result.path)).toBe(true);

			const content = readFile(result.path);
			expect(content).toContain('title: "My Plan"');
			expect(content).toContain("status: draft");
			expect(content).toContain("type: feature");
			expect(content).toContain("## Content");
		});

		it("sanitizes filename", () => {
			const result = createPlanFile(TEST_CWD, "My Crazy Plan!!!", "Content", {
				title: "Test",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});

			expect(result.path).not.toContain("!");
			expect(result.path).toContain("my-crazy-plan");
		});

		it("handles subdirectory paths", () => {
			const result = createPlanFile(TEST_CWD, "pending/my-plan", "Content", {
				title: "Test",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});

			expect(exists(result.path)).toBe(true);
			expect(result.path).toContain("pending");
		});
	});

	describe("readPlanFile", () => {
		it("reads plan by exact filename", () => {
			createPlanFile(TEST_CWD, "test-plan", "## Content", {
				title: "Test Plan",
				status: "approved",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});

			const plan = readPlanFile(TEST_CWD, "test-plan");
			expect(plan).not.toBeNull();
			expect(plan?.metadata.title).toBe("Test Plan");
			expect(plan?.metadata.status).toBe("approved");
			expect(plan?.content).toContain("## Content");
		});

		it("returns null for non-existent plan", () => {
			expect(readPlanFile(TEST_CWD, "nonexistent")).toBeNull();
		});

		it("fills default values for missing fields", () => {
			fs.mkdirSync("/tmp/test/.pi/plans", { recursive: true });
			writeFile(
				"/tmp/test/.pi/plans/minimal.md",
				"---\ntitle: Minimal\n---\n\nContent body",
			);

			const plan = readPlanFile(TEST_CWD, "minimal");
			expect(plan).not.toBeNull();
			expect(plan?.metadata.status).toBe("draft");
			expect(plan?.metadata.type).toBe("feature");
			expect(plan?.content).toBe("Content body");
		});
	});

	describe("listPlans", () => {
		it("returns empty array for empty directory", () => {
			expect(listPlans(TEST_CWD)).toEqual([]);
		});

		it("lists all plans sorted by created date descending", () => {
			createPlanFile(TEST_CWD, "plan-a", "Content A", {
				title: "Plan A",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});
			createPlanFile(TEST_CWD, "plan-b", "Content B", {
				title: "Plan B",
				status: "draft",
				created: "2026-06-01T00:00:00.000Z",
				type: "fix",
			});

			const plans = listPlans(TEST_CWD);
			expect(plans).toHaveLength(2);
			expect(plans[0].metadata.title).toBe("Plan B");
			expect(plans[1].metadata.title).toBe("Plan A");
		});

		it("filters by status", () => {
			createPlanFile(TEST_CWD, "draft-plan", "Content", {
				title: "Draft",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});
			createPlanFile(TEST_CWD, "done-plan", "Content", {
				title: "Done",
				status: "done",
				created: "2026-01-02T00:00:00.000Z",
				type: "chore",
			});

			const drafts = listPlans(TEST_CWD, "draft");
			expect(drafts).toHaveLength(1);
			expect(drafts[0].metadata.title).toBe("Draft");
		});

		it("skips non-.md files", () => {
			fs.mkdirSync("/tmp/test/.pi/plans", { recursive: true });
			writeFile("/tmp/test/.pi/plans/note.txt", "not a plan");

			expect(listPlans(TEST_CWD)).toHaveLength(0);
		});
	});

	describe("updatePlanStatus", () => {
		it("updates status and sets updated timestamp", () => {
			createPlanFile(TEST_CWD, "my-plan", "## Content", {
				title: "My Plan",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});

			const updated = updatePlanStatus(TEST_CWD, "my-plan", "in_progress");
			expect(updated).not.toBeNull();
			expect(updated?.metadata.status).toBe("in_progress");
			expect(updated?.metadata.updated).toBeDefined();

			const plan = readPlanFile(TEST_CWD, "my-plan");
			expect(plan?.metadata.status).toBe("in_progress");
		});

		it("returns null for non-existent plan", () => {
			expect(updatePlanStatus(TEST_CWD, "nonexistent", "done")).toBeNull();
		});
	});
});
