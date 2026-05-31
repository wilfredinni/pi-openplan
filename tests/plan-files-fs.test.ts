import { createFsFromVolume, Volume } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Create a fresh volume and mock node:fs with memfs
const vol = new Volume();
const memfs = createFsFromVolume(vol);

vi.mock("node:fs", () => memfs);

// Import after mock is set up
const { createPlanFile, readPlanFile, listPlans, updatePlanStatus } =
	await import("../extensions/plan-mode/plan-files.ts");

const CWD = "/test-cwd";
const PLANS_DIR = "/test-cwd/.pi/plans";

beforeEach(() => {
	vol.reset();
	// Re-create the directory structure
	memfs.mkdirSync(CWD, { recursive: true });
});

describe("createPlanFile", () => {
	it("creates .pi/plans/ directory and file", () => {
		const result = createPlanFile(CWD, "test-plan", "Content here", {
			title: "Test Plan",
			status: "draft",
			created: "2025-01-01T00:00:00.000Z",
			type: "feature",
		});

		expect(result.path).toContain(".pi/plans/");
		expect(result.path).toContain("test-plan");
		expect(result.path).toMatch(/\.md$/);

		// Verify file was created
		const exists = memfs.existsSync(result.path);
		expect(exists).toBe(true);
	});

	it("writes frontmatter + content", () => {
		const result = createPlanFile(CWD, "my-plan", "Body text", {
			title: "My Plan",
			status: "draft",
			created: "2025-06-01T00:00:00.000Z",
			type: "feature",
		});

		const content = memfs.readFileSync(result.path, "utf-8");
		expect(content).toContain("---");
		expect(content).toContain('title: "My Plan"');
		expect(content).toContain("status: draft");
		expect(content).toContain("Body text");
	});

	it("sanitizes filenames (removes special chars)", () => {
		const result = createPlanFile(CWD, "my weird file name!!!", "Content", {
			title: "Test",
			status: "draft",
			created: "2025-01-01T00:00:00.000Z",
			type: "chore",
		});

		const basename = result.path.split("/").pop() ?? "";
		expect(basename).not.toContain(" ");
		expect(basename).not.toContain("!");
		expect(basename).toMatch(/^my-weird-file-name\.md$/);
	});

	it("includes updated field when provided", () => {
		const result = createPlanFile(CWD, "updated-plan", "Body", {
			title: "Updated",
			status: "in_progress",
			created: "2025-01-01T00:00:00.000Z",
			updated: "2025-06-01T00:00:00.000Z",
			type: "refactor",
		});

		const content = memfs.readFileSync(result.path, "utf-8");
		expect(content).toContain("status: in_progress");
		expect(content).toContain("type: refactor");
		expect(content).toContain('updated: "2025-06-01T00:00:00.000Z"');
	});
});

describe("readPlanFile", () => {
	it("reads a plan by exact name", () => {
		createPlanFile(CWD, "read-test", "Some content", {
			title: "Read Test",
			status: "draft",
			created: "2025-01-01T00:00:00.000Z",
			type: "feature",
		});

		const plan = readPlanFile(CWD, "read-test");
		expect(plan).not.toBeNull();
		expect(plan?.metadata.title).toBe("Read Test");
		expect(plan?.content).toBe("Some content");
	});

	it("returns null for non-existent plan", () => {
		const plan = readPlanFile(CWD, "non-existent");
		expect(plan).toBeNull();
	});

	it("reads with fuzzy match (partial name)", () => {
		createPlanFile(CWD, "fuzzy-match-test", "Fuzzy body", {
			title: "Fuzzy",
			status: "draft",
			created: "2025-01-01T00:00:00.000Z",
			type: "feature",
		});

		const plan = readPlanFile(CWD, "fuzzy");
		expect(plan).not.toBeNull();
		expect(plan?.content).toBe("Fuzzy body");
	});

	it("returns metadata with defaults for missing fields", () => {
		// Write a minimal file without frontmatter
		memfs.mkdirSync(PLANS_DIR, { recursive: true });
		memfs.writeFileSync(`${PLANS_DIR}/minimal.md`, "Just content");

		const plan = readPlanFile(CWD, "minimal");
		expect(plan).not.toBeNull();
		expect(plan?.content).toBe("Just content");
		expect(plan?.metadata.status).toBe("draft");
	});

	it("parses frontmatter with hyphenated YAML keys", () => {
		memfs.mkdirSync(PLANS_DIR, { recursive: true });
		memfs.writeFileSync(
			`${PLANS_DIR}/hyphen-key.md`,
			[
				"---",
				'title: "Hyphen Key Test"',
				"status: draft",
				'created: "2025-01-01"',
				"type: feature",
				"custom-key: works-with-hyphens",
				"---",
				"",
				"Body content",
			].join("\n"),
		);

		const plan = readPlanFile(CWD, "hyphen-key");
		expect(plan).not.toBeNull();
		expect(plan?.metadata.title).toBe("Hyphen Key Test");
		expect(plan?.metadata.status).toBe("draft");
		expect(plan?.content).toBe("Body content");
	});
});

describe("listPlans", () => {
	it("returns empty array when no plans dir exists", () => {
		const plans = listPlans("/empty-dir");
		expect(plans).toEqual([]);
	});

	it("lists all plans sorted by date descending", () => {
		createPlanFile(CWD, "older", "Old", {
			title: "Older",
			status: "done",
			created: "2024-01-01T00:00:00.000Z",
			type: "fix",
		});
		createPlanFile(CWD, "newer", "New", {
			title: "Newer",
			status: "approved",
			created: "2025-01-01T00:00:00.000Z",
			type: "feature",
		});

		const plans = listPlans(CWD);
		expect(plans).toHaveLength(2);
		// Newer first (descending by date)
		expect(plans[0].metadata.title).toBe("Newer");
		expect(plans[1].metadata.title).toBe("Older");
	});

	it("filters by status", () => {
		createPlanFile(CWD, "active", "Active plan", {
			title: "Active",
			status: "in_progress",
			created: "2025-01-01T00:00:00.000Z",
			type: "feature",
		});
		createPlanFile(CWD, "done-plan", "Done plan", {
			title: "Done",
			status: "done",
			created: "2025-01-01T00:00:00.000Z",
			type: "chore",
		});

		const activeOnly = listPlans(CWD, "in_progress");
		expect(activeOnly).toHaveLength(1);
		expect(activeOnly[0].metadata.title).toBe("Active");

		const doneOnly = listPlans(CWD, "done");
		expect(doneOnly).toHaveLength(1);
		expect(doneOnly[0].metadata.title).toBe("Done");
	});

	it("includes filename in PlanFile result", () => {
		createPlanFile(CWD, "file-name-check", "Body", {
			title: "Check",
			status: "draft",
			created: "2025-01-01T00:00:00.000Z",
			type: "chore",
		});

		const plans = listPlans(CWD);
		expect(plans[0].filename).toMatch(/\.md$/);
	});
});

describe("updatePlanStatus", () => {
	it("updates status and adds updated timestamp", () => {
		createPlanFile(CWD, "status-test", "Content", {
			title: "Status Test",
			status: "draft",
			created: "2025-01-01T00:00:00.000Z",
			type: "feature",
		});

		const updated = updatePlanStatus(CWD, "status-test", "in_progress");
		expect(updated).not.toBeNull();
		expect(updated?.metadata.status).toBe("in_progress");
		expect(updated?.metadata.updated).toBeDefined();

		// Verify persisted
		const plan = readPlanFile(CWD, "status-test");
		expect(plan?.metadata.status).toBe("in_progress");
	});

	it("returns null for non-existent plan", () => {
		const result = updatePlanStatus(CWD, "non-existent", "done");
		expect(result).toBeNull();
	});

	it("updates to done status", () => {
		createPlanFile(CWD, "done-test", "Body", {
			title: "Done Test",
			status: "in_progress",
			created: "2025-01-01T00:00:00.000Z",
			type: "fix",
		});

		const updated = updatePlanStatus(CWD, "done-test", "done");
		expect(updated?.metadata.status).toBe("done");
	});
});
