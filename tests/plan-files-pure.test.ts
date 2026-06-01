import { describe, expect, it } from "vitest";
import { slugify } from "../extensions/plan-mode/plan-files.ts";

describe("plan-files pure functions", () => {
	describe("slugify", () => {
		it("returns YYYY-MM-DD-slug format", () => {
			const result = slugify("my-plan");
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-/);
			expect(result).toContain("my-plan");
		});

		it("replaces spaces with hyphens", () => {
			const date = new Date().toISOString().slice(0, 10);
			expect(slugify("my plan name")).toBe(`${date}-my-plan-name`);
		});

		it("replaces non-ASCII characters with hyphens individually", () => {
			const date = new Date().toISOString().slice(0, 10);
			// Non-ASCII chars are not in [^a-z0-9], produce individual hyphens
			expect(slugify("héllo wörld")).toBe(`${date}-h-llo-w-rld`);
		});

		it("truncates long text to 80 chars of slug", () => {
			const longText = "a".repeat(200);
			const result = slugify(longText);
			const slugPart = result.slice(11);
			expect(slugPart.length).toBeLessThanOrEqual(80);
		});

		it("all-special-char input leaves empty slug, trailing hyphen", () => {
			const result = slugify("!!! @@@ ###");
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-$/);
		});

		it("collapses consecutive hyphens", () => {
			const date = new Date().toISOString().slice(0, 10);
			expect(slugify("a  b")).toBe(`${date}-a-b`);
		});

		it("strips leading and trailing hyphens from slug part", () => {
			const date = new Date().toISOString().slice(0, 10);
			expect(slugify(" -hello- ")).toBe(`${date}-hello`);
		});

		it("lowercases the slug", () => {
			const date = new Date().toISOString().slice(0, 10);
			expect(slugify("HELLO World")).toBe(`${date}-hello-world`);
		});
	});
});
