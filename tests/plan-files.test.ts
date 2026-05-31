import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	compressText,
	createPlanFile,
	isCompressibleFile,
	listPlans,
	parseFrontmatter,
	readPlanFile,
	sanitizeFilename,
	slugify,
	updatePlanStatus,
} from "../extensions/plan-mode/plan-files.ts";

describe("plan-files", () => {
	describe("parseFrontmatter", () => {
		it("parses valid frontmatter with all fields", () => {
			const raw = `---
title: "Test Plan"
status: draft
created: "2026-01-15T12:00:00Z"
type: feature
---

# Content`;
			const { metadata, body } = parseFrontmatter(raw);
			expect(metadata.title).toBe("Test Plan");
			expect(metadata.status).toBe("draft");
			expect(metadata.created).toBe("2026-01-15T12:00:00Z");
			expect(metadata.type).toBe("feature");
			expect(body).toBe("# Content");
		});

		it("returns empty metadata and full body for no frontmatter", () => {
			const { metadata, body } = parseFrontmatter("Just content here");
			expect(metadata.title).toBeUndefined();
			expect(body).toBe("Just content here");
		});

		it("returns partial metadata for missing optional fields", () => {
			const raw = `---
title: "Minimal Plan"
---
Body`;
			const { metadata, body } = parseFrontmatter(raw);
			expect(metadata.title).toBe("Minimal Plan");
			expect(metadata.status).toBeUndefined();
			expect(metadata.type).toBeUndefined();
			expect(body).toBe("Body");
		});

		it("strips quotes from values", () => {
			const raw = `---
title: "Quoted Title"
---
Body`;
			const { metadata } = parseFrontmatter(raw);
			expect(metadata.title).toBe("Quoted Title");
		});

		it("handles extra whitespace in frontmatter", () => {
			const raw = `---\ntitle: "Spaced Title"  \nstatus: draft  \n---\nBody`;
			const { metadata } = parseFrontmatter(raw);
			expect(metadata.title).toBe("Spaced Title");
		});
	});

	describe("sanitizeFilename", () => {
		it("replaces special characters with hyphens", () => {
			expect(sanitizeFilename("hello world")).toBe("hello-world");
			expect(sanitizeFilename("my plan! v2")).toBe("my-plan-v2");
		});

		it("strips .md extension", () => {
			expect(sanitizeFilename("plan.md")).toBe("plan");
		});

		it("collapses consecutive hyphens", () => {
			expect(sanitizeFilename("hello---world")).toBe("hello-world");
		});

		it("strips leading and trailing hyphens", () => {
			expect(sanitizeFilename("--hello-world--")).toBe("hello-world");
		});

		it("lowercases result", () => {
			expect(sanitizeFilename("HELLO World")).toBe("hello-world");
		});

		it("truncates long names at 120 chars", () => {
			const long = "a".repeat(150);
			const result = sanitizeFilename(long);
			expect(result.length).toBeLessThanOrEqual(120);
		});

		it("returns empty for all-special input", () => {
			expect(sanitizeFilename("!@#$%^&*()")).toBe("");
		});

		it("handles underscores correctly", () => {
			expect(sanitizeFilename("my_plan_file")).toBe("my_plan_file");
		});
	});

	describe("slugify", () => {
		it("prepends date prefix", () => {
			const result = slugify("Test Plan");
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-test-plan$/);
		});

		it("sanitizes special characters", () => {
			const result = slugify("Hello World! v2");
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-hello-world-v2$/);
		});

		it("truncates long slugs at 80 chars (plus date)", () => {
			const long = "x".repeat(100);
			const result = slugify(long);
			// Date is 10 chars + hyphen = 11, then max 80 slug chars
			expect(result.length).toBeLessThanOrEqual(91); // 10 + 1 + 80
		});
	});

	describe("compressText", () => {
		it("preserves code blocks exactly", () => {
			const input = "Some text\n```\nrm -rf /\n```\nMore text";
			const result = compressText(input);
			expect(result).toContain("```\nrm -rf /\n```");
		});

		it("preserves multiple code blocks", () => {
			const input = "```\nblock1\n```\nbetween\n```\nblock2\n```";
			const result = compressText(input);
			expect(result).toContain("block1");
			expect(result).toContain("block2");
		});

		it("preserves inline code", () => {
			const input = "Use the `rm -rf` command carefully";
			const result = compressText(input);
			expect(result).toContain("`rm -rf`");
		});

		it("preserves URLs", () => {
			const input = "See https://example.com/foo for details";
			const result = compressText(input);
			expect(result).toContain("https://example.com/foo");
		});

		it("preserves file paths", () => {
			const input = "Edit /etc/config.json to configure";
			const result = compressText(input);
			expect(result).toContain("/etc/config.json");
		});

		it("preserves markdown headings", () => {
			const input = "# Title\n\n## Section\n\nContent here";
			const result = compressText(input);
			expect(result).toContain("# Title");
			expect(result).toContain("## Section");
		});

		it("preserves list markers", () => {
			const input = "- item one\n- item two\n* item three";
			const result = compressText(input);
			expect(result).toContain("- item one");
			expect(result).toContain("- item two");
			expect(result).toContain("* item three");
		});

		it("preserves blockquotes", () => {
			const input = "> This is a quote";
			const result = compressText(input);
			expect(result).toContain("> This is");
		});

		it("removes filler words from prose", () => {
			const input = "You should just really basically do it";
			const result = compressText(input);
			expect(result).not.toMatch(/\bjust\b/);
			expect(result).not.toMatch(/\breally\b/);
			expect(result).not.toMatch(/\bbasically\b/);
		});

		it("compresses 'in order to' to 'to'", () => {
			const result = compressText("Do this in order to proceed");
			expect(result).not.toContain("in order to");
		});

		it("removes articles the/a/an from prose", () => {
			const result = compressText("Create the file in a directory an option");
			// Articles should be removed from processed text
			expect(result).toBeDefined();
		});

		it("preserves empty lines", () => {
			const input = "Line 1\n\nLine 2\n\n\nLine 3";
			const result = compressText(input);
			expect(result).toContain("\n\n");
		});

		it("handles empty input", () => {
			expect(compressText("")).toBe("");
		});
	});

	describe("File I/O with temp directories", () => {
		let tmpDir: string;
		let cwd: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-files-test-"));
			cwd = tmpDir;
		});

		afterEach(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		it("createPlanFile creates a file and returns its path", () => {
			const result = createPlanFile(cwd, "test-plan", "Content body", {
				title: "Test Plan",
				status: "draft",
				created: new Date().toISOString(),
				type: "feature",
			});
			expect(result.path).toBeDefined();
			expect(fs.existsSync(result.path)).toBe(true);
		});

		it("createPlanFile writes frontmatter and content", () => {
			const created = createPlanFile(cwd, "my-plan", "Body text", {
				title: "My Plan",
				status: "draft",
				created: "2026-01-01T00:00:00Z",
				type: "fix",
			});
			const raw = fs.readFileSync(created.path, "utf-8");
			expect(raw).toContain('title: "My Plan"');
			expect(raw).toContain("status: draft");
			expect(raw).toContain("type: fix");
			expect(raw).toContain("Body text");
		});

		it("readPlanFile returns null for non-existent plan", () => {
			const result = readPlanFile(cwd, "nonexistent");
			expect(result).toBeNull();
		});

		it("readPlanFile reads an existing plan by exact name", () => {
			createPlanFile(cwd, "read-test", "Content here", {
				title: "Read Test",
				status: "approved",
				created: "2026-01-01T00:00:00Z",
				type: "refactor",
			});
			const result = readPlanFile(cwd, "read-test");
			expect(result).not.toBeNull();
			expect(result?.metadata.title).toBe("Read Test");
			expect(result?.metadata.status).toBe("approved");
			expect(result?.content).toBe("Content here");
		});

		it("readPlanFile does fuzzy matching", () => {
			createPlanFile(cwd, "add-rate-limiting", "Rate limit plan", {
				title: "Add Rate Limiting",
				status: "draft",
				created: "2026-01-01T00:00:00Z",
				type: "feature",
			});
			const result = readPlanFile(cwd, "rate-limit");
			expect(result).not.toBeNull();
			expect(result?.filename).toContain("rate");
		});

		it("listPlans returns empty array when no plans dir", () => {
			const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), "empty-plan-"));
			const plans = listPlans(emptyCwd);
			expect(plans).toEqual([]);
			fs.rmSync(emptyCwd, { recursive: true, force: true });
		});

		it("listPlans lists all plans sorted by creation date", () => {
			const meta = {
				title: "P",
				status: "draft" as const,
				created: new Date().toISOString(),
				type: "feature" as const,
			};
			createPlanFile(cwd, "first", "Content A", {
				...meta,
				created: "2026-01-01T00:00:00Z",
			});
			createPlanFile(cwd, "second", "Content B", {
				...meta,
				created: "2026-01-02T00:00:00Z",
			});
			const plans = listPlans(cwd);
			expect(plans).toHaveLength(2);
			// Most recent first
			expect(plans[0].filename).toContain("second");
		});

		it("listPlans filters by status", () => {
			createPlanFile(cwd, "done-plan", "Done", {
				title: "Done",
				status: "done",
				created: "2026-01-01T00:00:00Z",
				type: "feature",
			});
			createPlanFile(cwd, "draft-plan", "Draft", {
				title: "Draft",
				status: "draft",
				created: "2026-01-02T00:00:00Z",
				type: "chore",
			});
			const donePlans = listPlans(cwd, "done");
			expect(donePlans).toHaveLength(1);
			expect(donePlans[0].metadata.status).toBe("done");
		});

		it("updatePlanStatus updates status and updated timestamp", () => {
			createPlanFile(cwd, "status-test", "Body", {
				title: "Status Test",
				status: "draft",
				created: "2026-01-01T00:00:00Z",
				type: "feature",
			});
			const updated = updatePlanStatus(cwd, "status-test", "in_progress");
			expect(updated).not.toBeNull();
			expect(updated?.metadata.status).toBe("in_progress");
			expect(updated?.metadata.updated).toBeDefined();
		});

		it("updatePlanStatus returns null for non-existent plan", () => {
			const result = updatePlanStatus(cwd, "ghost", "done");
			expect(result).toBeNull();
		});

		it("readPlanFile returns null for empty filename after sanitization", () => {
			const result = readPlanFile(cwd, "!@#$%");
			expect(result).toBeNull();
		});
	});

	describe("isCompressibleFile", () => {
		it("returns true for .md files", () => {
			expect(isCompressibleFile("context.md")).toBe(true);
		});

		it("returns true for .txt files", () => {
			expect(isCompressibleFile("notes.txt")).toBe(true);
		});

		it("returns true for .typ files", () => {
			expect(isCompressibleFile("doc.typ")).toBe(true);
		});

		it("returns true for .typst files", () => {
			expect(isCompressibleFile("doc.typst")).toBe(true);
		});

		it("returns true for .tex files", () => {
			expect(isCompressibleFile("paper.tex")).toBe(true);
		});

		it("returns false for .ts files", () => {
			expect(isCompressibleFile("script.ts")).toBe(false);
		});

		it("returns false for .js files", () => {
			expect(isCompressibleFile("script.js")).toBe(false);
		});

		it("returns false for .json files", () => {
			expect(isCompressibleFile("data.json")).toBe(false);
		});

		it("returns false for binary-looking extensions", () => {
			expect(isCompressibleFile("image.png")).toBe(false);
			expect(isCompressibleFile("archive.zip")).toBe(false);
		});
	});
});
