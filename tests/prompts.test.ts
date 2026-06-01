import { describe, expect, it } from "vitest";
import {
	CONCISENESS_DIRECTIVE,
	EXECUTION_MODE_PROMPT,
	PLAN_MODE_SYSTEM_PROMPT,
	PLAN_MODE_SYSTEM_PROMPT_BRIEF,
	PLAN_TEMPLATE,
} from "../extensions/plan-mode/prompts.ts";

describe("prompts", () => {
	describe("CONCISENESS_DIRECTIVE", () => {
		it("is a non-empty string", () => {
			expect(CONCISENESS_DIRECTIVE).toBeTruthy();
			expect(typeof CONCISENESS_DIRECTIVE).toBe("string");
			expect(CONCISENESS_DIRECTIVE.length).toBeGreaterThan(0);
		});

		it("contains 'terse'", () => {
			expect(CONCISENESS_DIRECTIVE).toContain("terse");
		});

		it("contains 'Drop filler'", () => {
			expect(CONCISENESS_DIRECTIVE).toContain("Drop filler");
		});
	});

	describe("PLAN_MODE_SYSTEM_PROMPT", () => {
		it("is a non-empty string", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT).toBeTruthy();
			expect(typeof PLAN_MODE_SYSTEM_PROMPT).toBe("string");
			expect(PLAN_MODE_SYSTEM_PROMPT.length).toBeGreaterThan(0);
		});

		it("includes CONCISENESS_DIRECTIVE", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain(
				CONCISENESS_DIRECTIVE.trim().slice(0, 20),
			);
		});

		it("contains [Plan Mode]", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain("[Plan Mode]");
		});

		it("contains READ-ONLY", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain("READ-ONLY");
		});

		it("mentions plan_write", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain("plan_write");
		});
	});

	describe("PLAN_MODE_SYSTEM_PROMPT_BRIEF", () => {
		it("is a non-empty string", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF).toBeTruthy();
			expect(typeof PLAN_MODE_SYSTEM_PROMPT_BRIEF).toBe("string");
			expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF.length).toBeGreaterThan(0);
		});

		it("is shorter than full system prompt", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF.length).toBeLessThan(
				PLAN_MODE_SYSTEM_PROMPT.length,
			);
		});

		it("contains [Plan Mode]", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF).toContain("[Plan Mode]");
		});
	});

	describe("EXECUTION_MODE_PROMPT", () => {
		it("is a non-empty string", () => {
			expect(EXECUTION_MODE_PROMPT).toBeTruthy();
			expect(typeof EXECUTION_MODE_PROMPT).toBe("string");
			expect(EXECUTION_MODE_PROMPT.length).toBeGreaterThan(0);
		});

		it("contains [Executing Plan]", () => {
			expect(EXECUTION_MODE_PROMPT).toContain("[Executing Plan]");
		});

		it("contains [DONE:n]", () => {
			expect(EXECUTION_MODE_PROMPT).toContain("[DONE:n]");
		});

		it("contains pause marker", () => {
			expect(EXECUTION_MODE_PROMPT).toContain("⏸");
		});
	});

	describe("PLAN_TEMPLATE", () => {
		it("is a non-empty string", () => {
			expect(PLAN_TEMPLATE).toBeTruthy();
			expect(typeof PLAN_TEMPLATE).toBe("string");
			expect(PLAN_TEMPLATE.length).toBeGreaterThan(0);
		});

		it("contains YAML frontmatter markers", () => {
			expect(PLAN_TEMPLATE).toContain("---");
		});

		it("contains Phase 1", () => {
			expect(PLAN_TEMPLATE).toContain("Phase 1");
		});

		it("contains PAUSE", () => {
			expect(PLAN_TEMPLATE).toContain("PAUSE");
		});
	});
});
