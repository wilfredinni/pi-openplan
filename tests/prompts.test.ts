import { describe, expect, it } from "vitest";
import {
	CONCISENESS_DIRECTIVE,
	EXECUTION_MODE_PROMPT,
	PLAN_MODE_SYSTEM_PROMPT,
	PLAN_MODE_SYSTEM_PROMPT_BRIEF,
	PLAN_TEMPLATE,
} from "../extensions/plan-mode/prompts.ts";

describe("prompts", () => {
	it("exports all expected constants", () => {
		expect(CONCISENESS_DIRECTIVE).toBeDefined();
		expect(PLAN_MODE_SYSTEM_PROMPT).toBeDefined();
		expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF).toBeDefined();
		expect(EXECUTION_MODE_PROMPT).toBeDefined();
		expect(PLAN_TEMPLATE).toBeDefined();
	});

	it("all constants are non-empty strings", () => {
		expect(CONCISENESS_DIRECTIVE.length).toBeGreaterThan(0);
		expect(PLAN_MODE_SYSTEM_PROMPT.length).toBeGreaterThan(0);
		expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF.length).toBeGreaterThan(0);
		expect(EXECUTION_MODE_PROMPT.length).toBeGreaterThan(0);
		expect(PLAN_TEMPLATE.length).toBeGreaterThan(0);
	});

	describe("CONCISENESS_DIRECTIVE", () => {
		it('contains "terse"', () => {
			expect(CONCISENESS_DIRECTIVE).toContain("terse");
		});

		it('contains "Drop filler"', () => {
			expect(CONCISENESS_DIRECTIVE).toContain("Drop filler");
		});

		it('contains "No hedging"', () => {
			expect(CONCISENESS_DIRECTIVE).toContain("No hedging");
		});

		it("mentions articles and filler words", () => {
			expect(CONCISENESS_DIRECTIVE).toMatch(
				/articles.*just.*really.*basically/s,
			);
		});
	});

	describe("PLAN_MODE_SYSTEM_PROMPT", () => {
		it("includes CONCISENESS_DIRECTIVE", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain(CONCISENESS_DIRECTIVE);
		});

		it("declares read-only mode", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain("[Plan Mode] READ-ONLY");
		});

		it("mentions plan_write tool", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain("plan_write");
		});

		it("mentions plan_question", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain("plan_question");
		});

		it("is longer than brief variant", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT.length).toBeGreaterThan(
				PLAN_MODE_SYSTEM_PROMPT_BRIEF.length,
			);
		});

		it("references subagents", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain("Subagents");
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain("scout");
			expect(PLAN_MODE_SYSTEM_PROMPT).toContain("researcher");
		});
	});

	describe("PLAN_MODE_SYSTEM_PROMPT_BRIEF", () => {
		it("includes CONCISENESS_DIRECTIVE", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF).toContain(CONCISENESS_DIRECTIVE);
		});

		it("is shorter than full prompt", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF.length).toBeLessThan(
				PLAN_MODE_SYSTEM_PROMPT.length,
			);
		});

		it("mentions read-only mode", () => {
			expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF).toContain("[Plan Mode] READ-ONLY");
		});
	});

	describe("EXECUTION_MODE_PROMPT", () => {
		it('contains "[DONE:n]" markers instruction', () => {
			expect(EXECUTION_MODE_PROMPT).toContain("[DONE:n]");
		});

		it("mentions pause markers", () => {
			expect(EXECUTION_MODE_PROMPT).toContain("⏸");
		});

		it("includes CONCISENESS_DIRECTIVE", () => {
			expect(EXECUTION_MODE_PROMPT).toContain(CONCISENESS_DIRECTIVE);
		});

		it("declares executing plan state", () => {
			expect(EXECUTION_MODE_PROMPT).toContain("[Executing Plan]");
		});
	});

	describe("PLAN_TEMPLATE", () => {
		it("contains YAML frontmatter markers", () => {
			expect(PLAN_TEMPLATE).toContain("---");
		});

		it("contains title placeholder", () => {
			expect(PLAN_TEMPLATE).toContain("$TITLE");
		});

		it("contains phase structure", () => {
			expect(PLAN_TEMPLATE).toContain("Phase 1:");
		});

		it("contains verification section", () => {
			expect(PLAN_TEMPLATE).toContain("Verification");
		});
	});
});
