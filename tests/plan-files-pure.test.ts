import { describe, expect, it } from "vitest";
import {
	sanitizeFilename,
	slugify,
} from "../extensions/plan-mode/plan-files.ts";

describe("sanitizeFilename", () => {
	it("strips .md extension", () => {
		expect(sanitizeFilename("my-plan.md")).toBe("my-plan");
	});

	it("replaces special characters with hyphens", () => {
		expect(sanitizeFilename("my weird plan!!!")).toBe("my-weird-plan");
	});

	it("collapses consecutive hyphens", () => {
		expect(sanitizeFilename("a   b")).toBe("a-b");
	});

	it("strips leading/trailing hyphens", () => {
		expect(sanitizeFilename("-hello-")).toBe("hello");
	});

	it("flattens subdirectory paths by default", () => {
		expect(sanitizeFilename("pending/my-plan")).toBe("pending-my-plan");
	});

	it("preserves subdirectory paths when preservePath=true", () => {
		expect(sanitizeFilename("pending/my-plan", true)).toBe("pending/my-plan");
	});

	it("preserves deep subdirectory paths", () => {
		expect(sanitizeFilename("archived/2025/rate-limiting", true)).toBe(
			"archived/2025/rate-limiting",
		);
	});

	it("sanitizes each path component when preservePath", () => {
		expect(sanitizeFilename("PENDING/My Plan!!!/setup", true)).toBe(
			"pending/my-plan/setup",
		);
	});

	it("truncates long names to 120 chars", () => {
		const long = "a".repeat(150);
		expect(sanitizeFilename(long).length).toBeLessThanOrEqual(120);
	});
});

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
