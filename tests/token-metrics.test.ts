import { describe, expect, it } from "vitest";
import {
	createTokenMetricsState,
	estimateTokenCount,
	getSessionSummary,
	recordInput,
	recordOutput,
} from "../extensions/plan-mode/token-metrics.ts";

describe("estimateTokenCount", () => {
	it("returns 0 for empty string", () => {
		expect(estimateTokenCount("")).toBe(0);
	});

	it("returns 1 for single character", () => {
		expect(estimateTokenCount("a")).toBe(1);
	});

	it("uses chars/4 heuristic", () => {
		expect(estimateTokenCount("hello world how are you")).toBe(
			Math.ceil("hello world how are you".length / 4),
		);
	});

	it("strips ANSI codes before counting", () => {
		const withAnsi = "\x1b[32mhello\x1b[0m";
		const withoutAnsi = "hello";
		expect(estimateTokenCount(withAnsi)).toBe(estimateTokenCount(withoutAnsi));
	});

	it("handles long text", () => {
		const long = "x".repeat(1000);
		expect(estimateTokenCount(long)).toBe(250);
	});

	it("returns at least 1 for non-empty text", () => {
		expect(estimateTokenCount("xy")).toBe(1);
	});
});

describe("createTokenMetricsState", () => {
	it("returns all zeros", () => {
		const state = createTokenMetricsState();
		expect(state.totalInputTokens).toBe(0);
		expect(state.totalOutputTokens).toBe(0);
		expect(state.sessionInputTokens).toBe(0);
		expect(state.sessionOutputTokens).toBe(0);
		expect(state.turns).toBe(0);
	});
});

describe("recordInput", () => {
	it("accumulates input tokens", () => {
		const metrics = createTokenMetricsState();
		recordInput(metrics, "hello world");
		expect(metrics.totalInputTokens).toBeGreaterThan(0);
		expect(metrics.sessionInputTokens).toBeGreaterThan(0);
		expect(metrics.turns).toBe(1);
	});

	it("increments across multiple calls", () => {
		const metrics = createTokenMetricsState();
		recordInput(metrics, "first prompt");
		recordInput(metrics, "second prompt");
		expect(metrics.totalInputTokens).toBeGreaterThan(
			metrics.sessionInputTokens - 100,
		);
		expect(metrics.turns).toBe(2);
	});

	it("estimates ~455 tokens for full prompt", () => {
		// PLAN_MODE_SYSTEM_PROMPT is ~455 tokens
		const fullPrompt = "x".repeat(1820); // 1820/4 = 455
		const metrics = createTokenMetricsState();
		recordInput(metrics, fullPrompt);
		expect(metrics.sessionInputTokens).toBe(455);
	});
});

describe("recordOutput", () => {
	it("accumulates output tokens", () => {
		const metrics = createTokenMetricsState();
		recordOutput(metrics, "agent response");
		expect(metrics.totalOutputTokens).toBeGreaterThan(0);
		expect(metrics.sessionOutputTokens).toBeGreaterThan(0);
	});

	it("does not increment turn count", () => {
		const metrics = createTokenMetricsState();
		recordOutput(metrics, "response");
		expect(metrics.turns).toBe(0);
	});
});

describe("getSessionSummary", () => {
	it("returns 'No plan mode turns yet' when no turns", () => {
		const metrics = createTokenMetricsState();
		expect(getSessionSummary(metrics)).toBe("No plan mode turns yet.");
	});

	it("includes turn count and token info", () => {
		const metrics = createTokenMetricsState();
		recordInput(metrics, "some prompt text");
		recordOutput(metrics, "some response text");
		const summary = getSessionSummary(metrics);
		expect(summary).toContain("1 turn(s)");
		expect(summary).toContain("input tokens");
		expect(summary).toContain("output tokens");
		expect(summary).toContain("savings");
	});
});
