import { describe, expect, it } from "vitest";
import { slugify } from "../extensions/plan-mode/plan-files.ts";

// sanitizeFilename and parseFrontmatter are not exported from plan-files.ts
// They are module-private. We test slugify which is exported, and test
// behavior of createPlanFile/readPlanFile indirectly in the fs tests.

describe("slugify", () => {
	it("prefixes with date", () => {
		const result = slugify("test-plan");
		// Format: YYYY-MM-DD-test-plan
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-test-plan$/);
	});

	it("replaces non-alphanumeric with hyphens", () => {
		const result = slugify("hello world!");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-hello-world$/);
	});

	it("strips leading/trailing hyphens", () => {
		const result = slugify("!!hello!!");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-hello$/);
	});

	it("collapses consecutive hyphens", () => {
		const result = slugify("a   b");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-a-b$/);
	});

	it("truncates to 80 chars for the slug part", () => {
		const long = `a${"b".repeat(120)}c`;
		const result = slugify(long);
		expect(result.length).toBeLessThanOrEqual(95); // date (10) + dash + 80 chars
	});

	it("handles non-ASCII characters (replaces them)", () => {
		const result = slugify("café");
		// non-ASCII chars are stripped/replaced by [^a-z0-9]+ pattern
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-caf$/);
	});

	it("handles empty-like input gracefully", () => {
		const result = slugify("a");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-a$/);
	});
});
