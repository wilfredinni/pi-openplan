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
	editPlanSection,
	generateTaskChecklist,
	listPlans,
	readPlanFile,
	replacePlanContent,
	stripTaskChecklist,
	updatePlanStatus,
	updateTaskChecklist,
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

		it("updates status on the correct file with fuzzy-matched filename", () => {
			// Simulate a plan saved with date-prefixed slug (e.g. "2026-06-17-my-plan")
			// but user refers to it as "my-plan" — updatePlanStatus must resolve
			// to the actual filepath, not create a new file at "my-plan.md".
			const sluggedFilename = "2026-06-17-my-plan";
			createPlanFile(TEST_CWD, sluggedFilename, "## Content", {
				title: "My Plan",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});

			// Update using the bare name (fuzzy match)
			const updated = updatePlanStatus(TEST_CWD, "my-plan", "in_progress");
			expect(updated).not.toBeNull();
			expect(updated?.metadata.status).toBe("in_progress");

			// The original file should still be the only one and have updated status
			const plans = listPlans(TEST_CWD);
			expect(plans).toHaveLength(1);
			expect(plans[0].filename).toContain("my-plan");
			expect(plans[0].metadata.status).toBe("in_progress");

			// Reading with the bare name should return the updated plan
			const reread = readPlanFile(TEST_CWD, "my-plan");
			expect(reread?.metadata.status).toBe("in_progress");
		});
	});

	describe("editPlanSection", () => {
		it("replaces a section by heading name", () => {
			createPlanFile(
				TEST_CWD,
				"my-plan",
				"## Overview\n\nOld overview.\n\n## Phase 1\n\nPhase one content.\n\n## Risks\n\nRisk content.",
				{
					title: "My Plan",
					status: "draft",
					created: "2026-01-01T00:00:00.000Z",
					type: "feature",
				},
			);

			const result = editPlanSection(
				TEST_CWD,
				"my-plan",
				"Phase 1",
				"Updated phase one.",
			);

			expect(result.metadata.updated).toBeDefined();
			expect(result.content).toContain("## Overview");
			expect(result.content).toContain("Old overview.");
			expect(result.content).toContain("## Phase 1");
			expect(result.content).toContain("Updated phase one.");
			expect(result.content).toContain("## Risks");
			expect(result.content).toContain("Risk content.");
			expect(result.content).not.toContain("Phase one content.");
		});

		it("replaces last section (no following heading)", () => {
			createPlanFile(
				TEST_CWD,
				"my-plan",
				"## Overview\n\nOverview content.\n\n## Notes\n\nOld notes.",
				{
					title: "My Plan",
					status: "draft",
					created: "2026-01-01T00:00:00.000Z",
					type: "feature",
				},
			);

			const result = editPlanSection(
				TEST_CWD,
				"my-plan",
				"Notes",
				"New notes.",
			);

			expect(result.content).toContain("## Overview");
			expect(result.content).toContain("## Notes");
			expect(result.content).toContain("New notes.");
			expect(result.content).not.toContain("Old notes.");
		});

		it("throws when plan not found", () => {
			expect(() =>
				editPlanSection(TEST_CWD, "nonexistent", "Section", "Content"),
			).toThrow(/Plan not found/);
		});

		it("throws when section not found", () => {
			createPlanFile(TEST_CWD, "my-plan", "## Overview\n\nContent.", {
				title: "My Plan",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});

			expect(() =>
				editPlanSection(TEST_CWD, "my-plan", "NonExistent", "Content"),
			).toThrow(/Section "NonExistent" not found/);
		});

		it("updates the updated timestamp", () => {
			createPlanFile(TEST_CWD, "my-plan", "## Overview\n\nContent.", {
				title: "My Plan",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});

			const before = new Date();
			const result = editPlanSection(
				TEST_CWD,
				"my-plan",
				"Overview",
				"Updated.",
			);
			const after = new Date();

			expect(result.metadata.updated).toBeDefined();
			const updated = result.metadata.updated as string;
			const updatedDate = new Date(updated);
			expect(updatedDate.getTime()).toBeGreaterThanOrEqual(
				before.getTime() - 1000,
			);
			expect(updatedDate.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
		});
	});

	describe("replacePlanContent", () => {
		it("replaces entire content and preserves old as Previous Version", () => {
			createPlanFile(TEST_CWD, "my-plan", "## Old Content\n\nOld body.", {
				title: "My Plan",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});

			const result = replacePlanContent(
				TEST_CWD,
				"my-plan",
				"## New Content\n\nNew body.",
			);

			expect(result.content).toContain("## New Content");
			expect(result.content).toContain("New body.");
			expect(result.content).toContain("## Previous Version");
			expect(result.content).toContain("## Old Content");
			expect(result.content).toContain("Old body.");
			expect(result.metadata.updated).toBeDefined();
		});

		it("throws when plan not found", () => {
			expect(() =>
				replacePlanContent(TEST_CWD, "nonexistent", "New content."),
			).toThrow(/Plan not found/);
		});

		it("updates the updated timestamp", () => {
			createPlanFile(TEST_CWD, "my-plan", "## Content", {
				title: "My Plan",
				status: "draft",
				created: "2026-01-01T00:00:00.000Z",
				type: "feature",
			});

			const result = replacePlanContent(TEST_CWD, "my-plan", "## New Content");

			expect(result.metadata.updated).toBeDefined();
		});
	});

	describe("task checklist", () => {
		describe("generateTaskChecklist", () => {
			it("generates checklist from single todo", () => {
				const result = generateTaskChecklist([
					{ step: 1, text: "Setup", completed: false },
				]);
				expect(result).toBe("## Tasks\n\n- [ ] 1. Setup\n\n");
			});

			it("generates checklist from multiple todos", () => {
				const result = generateTaskChecklist([
					{ step: 1, text: "Setup", completed: false },
					{ step: 2, text: "Build", completed: false },
				]);
				expect(result).toContain("- [ ] 1. Setup");
				expect(result).toContain("- [ ] 2. Build");
			});

			it("returns empty string for empty todos", () => {
				expect(generateTaskChecklist([])).toBe("");
			});

			it("always uses [ ] regardless of completed field", () => {
				const result = generateTaskChecklist([
					{ step: 1, text: "Done step", completed: true },
				]);
				expect(result).toContain("- [ ] 1.");
			});

			it("preserves step numbers from input", () => {
				const result = generateTaskChecklist([
					{ step: 3, text: "Phase three", completed: false },
				]);
				expect(result).toContain("- [ ] 3. Phase three");
			});
		});

		describe("stripTaskChecklist", () => {
			it("removes tasks section from content", () => {
				const content =
					"## Tasks\n\n- [ ] 1. Setup\n- [ ] 2. Build\n\n# Plan Title\n\nContent here.";
				const result = stripTaskChecklist(content);
				expect(result).not.toContain("## Tasks");
				expect(result).toContain("# Plan Title");
				expect(result).toContain("Content here.");
			});

			it("returns content unchanged when no tasks section", () => {
				const content = "# Plan Title\n\nSome content.";
				expect(stripTaskChecklist(content)).toBe(content);
			});

			it("handles checked items in existing checklist", () => {
				const content =
					"## Tasks\n\n- [x] 1. Done\n- [ ] 2. Pending\n\n# Plan Title";
				const result = stripTaskChecklist(content);
				expect(result).not.toContain("## Tasks");
				expect(result).not.toContain("[x]");
				expect(result).toContain("# Plan Title");
			});
		});

		describe("updateTaskChecklist", () => {
			it("toggles single checkbox to [x]", () => {
				createPlanFile(
					TEST_CWD,
					"my-plan",
					"## Tasks\n\n- [ ] 1. Setup\n- [ ] 2. Build\n\n# My Plan\n\nContent.",
					{
						title: "My Plan",
						status: "in_progress",
						created: "2026-01-01T00:00:00.000Z",
						type: "feature",
					},
				);

				const result = updateTaskChecklist(TEST_CWD, "my-plan", [1]);

				expect(result).not.toBeNull();
				expect(result?.content).toContain("- [x] 1. Setup");
				expect(result?.content).toContain("- [ ] 2. Build");
				expect(result?.metadata.updated).toBeDefined();
			});

			it("toggles multiple checkboxes", () => {
				createPlanFile(
					TEST_CWD,
					"my-plan",
					"## Tasks\n\n- [ ] 1. Setup\n- [ ] 2. Build\n- [ ] 3. Deploy\n\n# Plan",
					{
						title: "Plan",
						status: "in_progress",
						created: "2026-01-01T00:00:00.000Z",
						type: "feature",
					},
				);

				const result = updateTaskChecklist(TEST_CWD, "my-plan", [1, 3]);

				expect(result?.content).toContain("- [x] 1. Setup");
				expect(result?.content).toContain("- [ ] 2. Build");
				expect(result?.content).toContain("- [x] 3. Deploy");
			});

			it("preserves already-checked items", () => {
				createPlanFile(
					TEST_CWD,
					"my-plan",
					"## Tasks\n\n- [x] 1. Setup\n- [ ] 2. Build\n\n# Plan",
					{
						title: "Plan",
						status: "in_progress",
						created: "2026-01-01T00:00:00.000Z",
						type: "feature",
					},
				);

				const result = updateTaskChecklist(TEST_CWD, "my-plan", [2]);

				expect(result?.content).toContain("- [x] 1. Setup");
				expect(result?.content).toContain("- [x] 2. Build");
			});

			it("returns null for non-existent plan", () => {
				const result = updateTaskChecklist(TEST_CWD, "nonexistent", [1]);
				expect(result).toBeNull();
			});

			it("returns null for plan without Tasks section", () => {
				createPlanFile(TEST_CWD, "my-plan", "# My Plan\n\nNo tasks here.", {
					title: "My Plan",
					status: "draft",
					created: "2026-01-01T00:00:00.000Z",
					type: "feature",
				});

				const result = updateTaskChecklist(TEST_CWD, "my-plan", [1]);
				expect(result).toBeNull();
			});

			it("no-op for empty completedSteps array", () => {
				createPlanFile(
					TEST_CWD,
					"my-plan",
					"## Tasks\n\n- [ ] 1. Setup\n- [ ] 2. Build\n\n# Plan",
					{
						title: "Plan",
						status: "in_progress",
						created: "2026-01-01T00:00:00.000Z",
						type: "feature",
					},
				);

				const result = updateTaskChecklist(TEST_CWD, "my-plan", []);

				expect(result?.content).toContain("- [ ] 1. Setup");
				expect(result?.content).toContain("- [ ] 2. Build");
			});

			it("writes changes back to file", () => {
				createPlanFile(
					TEST_CWD,
					"my-plan",
					"## Tasks\n\n- [ ] 1. Setup\n\n# Plan",
					{
						title: "Plan",
						status: "in_progress",
						created: "2026-01-01T00:00:00.000Z",
						type: "feature",
					},
				);

				updateTaskChecklist(TEST_CWD, "my-plan", [1]);

				// Re-read the file to confirm persistence
				const plan = readPlanFile(TEST_CWD, "my-plan");
				expect(plan?.content).toContain("- [x] 1. Setup");
			});
		});
	});
});
