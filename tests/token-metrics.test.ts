import { describe, expect, it } from "vitest";
import {
	aggregateLifetimeMetrics,
	estimateTokenCount,
	estimateTokensFromBytes,
	formatTokenCount,
	formatTokenReport,
	TokenMetricsCollector,
	type TokenMetricsSnapshot,
} from "../extensions/plan-mode/token-metrics.ts";

describe("token-metrics", () => {
	describe("estimateTokenCount", () => {
		it("returns 0 for empty string", () => {
			expect(estimateTokenCount("")).toBe(0);
		});

		it("returns 1 for 4 chars", () => {
			expect(estimateTokenCount("abcd")).toBe(1);
		});

		it("returns 2 for 5-8 chars", () => {
			expect(estimateTokenCount("abcdefgh")).toBe(2);
		});

		it("rounds up fractional tokens", () => {
			expect(estimateTokenCount("abcde")).toBe(2);
		});

		it("handles long strings", () => {
			const long = "A".repeat(400);
			expect(estimateTokenCount(long)).toBe(100);
		});
	});

	describe("estimateTokensFromBytes", () => {
		it("returns at least 1 for 0 bytes", () => {
			expect(estimateTokensFromBytes(0)).toBe(1);
		});

		it("returns 1 for 1-4 bytes", () => {
			expect(estimateTokensFromBytes(3)).toBe(1);
			expect(estimateTokensFromBytes(4)).toBe(1);
		});

		it("returns 2 for 5-8 bytes", () => {
			expect(estimateTokensFromBytes(5)).toBe(2);
			expect(estimateTokensFromBytes(8)).toBe(2);
		});

		it("returns exact division for multiples of 4", () => {
			expect(estimateTokensFromBytes(40)).toBe(10);
		});
	});

	describe("formatTokenCount", () => {
		it("formats small numbers as-is", () => {
			expect(formatTokenCount(0)).toBe("0");
			expect(formatTokenCount(500)).toBe("500");
			expect(formatTokenCount(999)).toBe("999");
		});

		it("uses k suffix for thousands", () => {
			expect(formatTokenCount(1_000)).toBe("1.0k");
			expect(formatTokenCount(1_500)).toBe("1.5k");
			expect(formatTokenCount(15_000)).toBe("15.0k");
			expect(formatTokenCount(999_999)).toBe("1000.0k");
		});

		it("uses M suffix for millions", () => {
			expect(formatTokenCount(1_000_000)).toBe("1.0M");
			expect(formatTokenCount(2_500_000)).toBe("2.5M");
		});
	});

	describe("TokenMetricsCollector", () => {
		it("generates a unique sessionId", () => {
			const a = new TokenMetricsCollector();
			const b = new TokenMetricsCollector();
			expect(a.sessionId).toBeDefined();
			expect(a.sessionId).not.toBe(b.sessionId);
		});

		it("allows custom sessionId", () => {
			const c = new TokenMetricsCollector("test-session");
			expect(c.sessionId).toBe("test-session");
		});

		it("setSessionId overrides sessionId", () => {
			const c = new TokenMetricsCollector();
			c.setSessionId("override-id");
			expect((c as unknown as { sessionId: string }).sessionId).toBe(
				"override-id",
			);
		});

		it("record adds to source totals", () => {
			const c = new TokenMetricsCollector("test-record");
			c.record("test-cat", 40); // 10 tokens
			const summary = c.getSummary();
			expect(summary.sources["test-cat"]).toBe(10);
			expect(summary.total).toBe(10);
		});

		it("recordOutput adds to output tokens", () => {
			const c = new TokenMetricsCollector("test-output");
			c.recordOutput(40); // 10 tokens
			const summary = c.getSummary();
			expect(summary.output).toBe(10);
		});

		it("getSummary returns aggregated totals across multiple records", () => {
			const c = new TokenMetricsCollector("test-summary");
			c.record("a", 40); // 10
			c.record("b", 80); // 20
			c.recordOutput(40); // 10
			const summary = c.getSummary();
			expect(summary.total).toBe(30);
			expect(summary.sources.a).toBe(10);
			expect(summary.sources.b).toBe(20);
			expect(summary.output).toBe(10);
		});

		it("toSnapshot returns all entries", () => {
			const c = new TokenMetricsCollector("test-snapshot");
			c.record("cat1", 40);
			c.recordOutput(80);
			const snaps = c.toSnapshot();
			expect(snaps.length).toBe(2);
			expect(snaps[0].category).toBe("cat1");
			expect(snaps[0].tokens).toBe(10);
			expect(snaps[0].chars).toBe(40);
			expect(snaps[0].sessionId).toBe("test-snapshot");
			expect(snaps[0].timestamp).toBeDefined();
			expect(snaps[1].category).toBe("agent-output");
		});

		it("fromSnapshots restores same-session entries", () => {
			const snapshots: TokenMetricsSnapshot[] = [
				{
					category: "restore-cat",
					tokens: 25,
					chars: 100,
					timestamp: "2026-01-01T00:00:00Z",
					sessionId: "restore-test",
				},
			];
			const c = new TokenMetricsCollector("restore-test");
			c.fromSnapshots(snapshots);
			const summary = c.getSummary();
			expect(summary.sources["restore-cat"]).toBe(25);
		});

		it("fromSnapshots ignores different-session entries", () => {
			const snapshots: TokenMetricsSnapshot[] = [
				{
					category: "other-cat",
					tokens: 99,
					chars: 400,
					timestamp: "2026-01-01T00:00:00Z",
					sessionId: "other-session",
				},
			];
			const c = new TokenMetricsCollector("current-session");
			c.fromSnapshots(snapshots);
			const summary = c.getSummary();
			// Should not include other-session data
			expect(Object.keys(summary.sources)).toHaveLength(0);
			expect(summary.total).toBe(0);
		});
	});

	describe("aggregateLifetimeMetrics", () => {
		it("returns zeroes for empty input", () => {
			const result = aggregateLifetimeMetrics([]);
			expect(result.sessions).toBe(0);
			expect(result.totalTokens).toBe(0);
			expect(Object.keys(result.perCategory)).toHaveLength(0);
		});

		it("aggregates single session correctly", () => {
			const entries: TokenMetricsSnapshot[] = [
				{
					category: "system-prompt",
					tokens: 100,
					chars: 400,
					timestamp: "2026-01-01T00:00:00Z",
					sessionId: "session-1",
				},
				{
					category: "agent-output",
					tokens: 200,
					chars: 800,
					timestamp: "2026-01-01T00:00:00Z",
					sessionId: "session-1",
				},
			];
			const result = aggregateLifetimeMetrics(entries);
			expect(result.sessions).toBe(1);
			expect(result.totalTokens).toBe(300);
			expect(result.perCategory["system-prompt"].tokens).toBe(100);
			expect(result.perCategory["agent-output"].tokens).toBe(200);
		});

		it("deduplicates by sessionId (keeps latest per category)", () => {
			const entries: TokenMetricsSnapshot[] = [
				{
					category: "system-prompt",
					tokens: 100,
					chars: 400,
					timestamp: "2026-01-01T00:00:00Z",
					sessionId: "session-1",
				},
				{
					category: "system-prompt",
					tokens: 150,
					chars: 600,
					timestamp: "2026-01-02T00:00:00Z",
					sessionId: "session-1",
				},
			];
			const result = aggregateLifetimeMetrics(entries);
			expect(result.sessions).toBe(1);
			expect(result.totalTokens).toBe(150); // latest only
			expect(result.perCategory["system-prompt"].count).toBe(1);
		});

		it("aggregates multiple sessions", () => {
			const entries: TokenMetricsSnapshot[] = [
				{
					category: "system-prompt",
					tokens: 100,
					chars: 400,
					timestamp: "2026-01-01T00:00:00Z",
					sessionId: "session-1",
				},
				{
					category: "system-prompt",
					tokens: 200,
					chars: 800,
					timestamp: "2026-01-02T00:00:00Z",
					sessionId: "session-2",
				},
			];
			const result = aggregateLifetimeMetrics(entries);
			expect(result.sessions).toBe(2);
			expect(result.totalTokens).toBe(300);
			expect(result.perCategory["system-prompt"].tokens).toBe(300);
			expect(result.perCategory["system-prompt"].count).toBe(2);
		});
	});

	describe("formatTokenReport", () => {
		const minimalSummary = {
			session: {
				totalTokens: 100,
				sources: { "system-prompt": 60, "plan-content": 40 },
				outputTokens: 50,
			},
			lifetime: {
				totalTokens: 500,
				sessions: 3,
				perCategory: {
					"system-prompt": { tokens: 300, count: 3 },
				},
			},
		};

		it("includes session total", () => {
			const report = formatTokenReport(minimalSummary);
			expect(report).toContain("100");
		});

		it("includes lifetime total", () => {
			const report = formatTokenReport(minimalSummary);
			expect(report).toContain("500");
		});

		it("includes per-source breakdown", () => {
			const report = formatTokenReport(minimalSummary);
			expect(report).toContain("system-prompt");
			expect(report).toContain("plan-content");
		});

		it("includes output tokens", () => {
			const report = formatTokenReport(minimalSummary);
			expect(report).toContain("50");
		});

		it("includes efficiency ratio when both input and output exist", () => {
			const report = formatTokenReport(minimalSummary);
			expect(report).toContain("Efficiency");
		});

		it("includes lifetime session count when > 1", () => {
			const report = formatTokenReport(minimalSummary);
			expect(report).toContain("3 sessions");
		});

		it("handles empty sources", () => {
			const emptySummary = {
				session: {
					totalTokens: 0,
					sources: {},
					outputTokens: 0,
				},
				lifetime: {
					totalTokens: 0,
					sessions: 1,
					perCategory: {},
				},
			};
			const report = formatTokenReport(emptySummary);
			expect(report).toContain("0");
		});

		it("includes approximation notice", () => {
			const report = formatTokenReport(minimalSummary);
			expect(report).toContain("approximate");
		});
	});
});
