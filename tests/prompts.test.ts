import { describe, expect, it } from "vitest";
import {
	CONCISENESS_DIRECTIVE,
	EXECUTION_MODE_PROMPT,
	PLAN_MODE_SYSTEM_PROMPT,
	PLAN_MODE_SYSTEM_PROMPT_BRIEF,
} from "../extensions/plan-mode/prompts.ts";

describe("CONCISENESS_DIRECTIVE", () => {
	it("is not empty", () => {
		expect(CONCISENESS_DIRECTIVE.length).toBeGreaterThan(0);
	});

	it("contains key sections", () => {
		expect(CONCISENESS_DIRECTIVE).toContain("Respond terse");
		expect(CONCISENESS_DIRECTIVE).toContain("Drop filler");
		expect(CONCISENESS_DIRECTIVE).toContain("security warnings");
	});
});

describe("PLAN_MODE_SYSTEM_PROMPT", () => {
	it("is not empty", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT.length).toBeGreaterThan(0);
	});

	it("contains [Plan Mode] header", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("[Plan Mode]");
	});

	it("contains READ-ONLY constraint", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("READ-ONLY");
	});

	it("contains plan_write instruction", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("plan_write");
	});

	it("contains workflow steps", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("Scope and constraints");
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("Explore codebase");
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("Clarify via plan_question");
	});

	it("contains blocked tools", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("Blocked:");
	});

	it("contains conciseness directive", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain(CONCISENESS_DIRECTIVE);
	});

	it("contains subagent definitions", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("scout");
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("researcher");
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("context-builder");
	});
});

describe("PLAN_MODE_SYSTEM_PROMPT_BRIEF", () => {
	it("is not empty", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF.length).toBeGreaterThan(0);
	});

	it("contains [Plan Mode] header", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF).toContain("[Plan Mode]");
	});

	it("is shorter than full prompt", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF.length).toBeLessThan(
			PLAN_MODE_SYSTEM_PROMPT.length,
		);
	});

	it("is roughly 200 tokens (~800 chars)", () => {
		// Brief prompt should be significantly smaller than full (~1800 chars)
		expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF.length).toBeLessThan(1200);
	});

	it("contains conciseness directive", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF).toContain(CONCISENESS_DIRECTIVE);
	});

	it("does not contain workflow section", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF).not.toContain("Workflow");
	});

	it("does not contain subagent definitions", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT_BRIEF).not.toContain("scout");
	});
});

describe("EXECUTION_MODE_PROMPT", () => {
	it("is not empty", () => {
		expect(EXECUTION_MODE_PROMPT.length).toBeGreaterThan(0);
	});

	it("contains [Executing Plan]", () => {
		expect(EXECUTION_MODE_PROMPT).toContain("[Executing Plan]");
	});

	it("mentions [DONE:n] markers", () => {
		expect(EXECUTION_MODE_PROMPT).toContain("[DONE:");
	});

	it("mentions pause markers", () => {
		expect(EXECUTION_MODE_PROMPT).toContain("⏸");
	});

	it("is short (~50 tokens / <300 chars)", () => {
		expect(EXECUTION_MODE_PROMPT.length).toBeLessThan(300);
	});
});
