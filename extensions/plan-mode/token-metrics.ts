/**
 * Token metrics — invisible measurement of pi-openplan's token footprint.
 *
 * Tracks input tokens (system prompts, tool descriptions, injected messages)
 * and output tokens (agent responses) with per-session and lifetime aggregation.
 * Inspired by caveman-stats' approach to real token tracking.
 *
 * Uses char/4 estimation — fast, no external deps. All counts are approximate
 * and labeled as such in the UI.
 *
 * Metrics are persisted via pi.appendEntry("plan-mode-tokens", ...) so they
 * survive restarts and accumulate across sessions.
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface TokenMetricsSnapshot {
	/** Category label for the source */
	category: string;
	/** Approximate token count */
	tokens: number;
	/** Raw character count */
	chars: number;
	/** ISO timestamp */
	timestamp: string;
	/** Session identifier (for dedup in lifetime aggregation) */
	sessionId: string;
}

export interface TokenMetricsSummary {
	session: {
		totalTokens: number;
		sources: Record<string, number>;
		outputTokens: number;
	};
	lifetime: {
		totalTokens: number;
		sessions: number;
		perCategory: Record<string, { tokens: number; count: number }>;
	};
}

// ── Token Estimation ────────────────────────────────────────────────────

/**
 * Estimate token count from character length.
 * Uses char/4 as a conservative approximation for mixed code+prose text.
 * Explicitly labeled approximate everywhere it's displayed.
 */
export function estimateTokenCount(text: string): number {
	return Math.ceil(text.length / 4);
}

// ── Bytes → tokens (optimized, skips string construction) ──────────────

/**
 * Estimate tokens from byte length of a string.
 * For most text, byte length ≈ char length for ASCII-heavy text.
 * More accurate for measuring stored/metrics payloads.
 */
export function estimateTokensFromBytes(bytes: number): number {
	return Math.max(1, Math.ceil(bytes / 4));
}

// ── Metrics Collection ──────────────────────────────────────────────────

const CATEGORIES = {
	SYSTEM_PROMPT: "system-prompt",
	TOOL_DESCRIPTIONS: "tool-descriptions",
	PLAN_CONTENT: "plan-content",
	TOOL_RESPONSE: "tool-response",
	AGENT_OUTPUT: "agent-output",
} as const;

/**
 * Collects and persists token metrics for the current session.
 */
export class TokenMetricsCollector {
	private sessionId: string;
	private sources: Map<string, number> = new Map();
	private outputTokens = 0;
	private entries: TokenMetricsSnapshot[] = [];

	constructor(sessionId?: string) {
		this.sessionId =
			sessionId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	/** Record a token source (input-side: prompts, tools, messages) */
	record(category: string, chars: number): void {
		const tokens = estimateTokenCount(String(chars));
		const key = category;
		this.sources.set(key, (this.sources.get(key) ?? 0) + tokens);
		this.pushSnapshot(category, tokens, chars);
	}

	/** Record output tokens from an agent response */
	recordOutput(chars: number): void {
		const tokens = estimateTokenCount(String(chars));
		this.outputTokens += tokens;
		this.pushSnapshot(CATEGORIES.AGENT_OUTPUT, tokens, chars);
	}

	/** Get the current session summary */
	getSummary(): {
		total: number;
		sources: Record<string, number>;
		output: number;
	} {
		const total = Array.from(this.sources.values()).reduce((a, b) => a + b, 0);
		const sources: Record<string, number> = {};
		for (const [key, val] of this.sources) {
			sources[key] = val;
		}
		return { total, sources, output: this.outputTokens };
	}

	/** Serialize current state to a persistable snapshot */
	toSnapshot(): TokenMetricsSnapshot[] {
		return this.entries;
	}

	/** Load persisted snapshots into the collector */
	fromSnapshots(snapshots: TokenMetricsSnapshot[]): void {
		for (const snap of snapshots) {
			if (snap.sessionId === this.sessionId) {
				// Rebuild sources map from current session entries
				this.entries.push(snap);
				if (snap.category === CATEGORIES.AGENT_OUTPUT) {
					this.outputTokens += snap.tokens;
				} else {
					this.sources.set(
						snap.category,
						(this.sources.get(snap.category) ?? 0) + snap.tokens,
					);
				}
			}
		}
	}

	private pushSnapshot(category: string, tokens: number, chars: number): void {
		this.entries.push({
			category,
			tokens,
			chars,
			timestamp: new Date().toISOString(),
			sessionId: this.sessionId,
		});
	}
}

// ── Lifetime Aggregation ────────────────────────────────────────────────

/**
 * Aggregate lifetime token metrics from persisted entries.
 * Deduplicates by sessionId (keeps latest per session).
 */
export function aggregateLifetimeMetrics(entries: TokenMetricsSnapshot[]): {
	sessions: number;
	totalTokens: number;
	perCategory: Record<string, { tokens: number; count: number }>;
} {
	// Deduplicate by sessionId (keep last entry per sessionId per category)
	const sessionMap = new Map<string, Map<string, TokenMetricsSnapshot>>();
	for (const entry of entries) {
		if (!sessionMap.has(entry.sessionId)) {
			sessionMap.set(entry.sessionId, new Map());
		}
		const catMap = sessionMap.get(entry.sessionId)!;
		catMap.set(entry.category, entry);
	}

	const perCategory: Record<string, { tokens: number; count: number }> = {};
	let totalTokens = 0;

	for (const [, catMap] of sessionMap) {
		for (const [cat, snap] of catMap) {
			if (!perCategory[cat]) {
				perCategory[cat] = { tokens: 0, count: 0 };
			}
			perCategory[cat].tokens += snap.tokens;
			perCategory[cat].count++;
			totalTokens += snap.tokens;
		}
	}

	return {
		sessions: sessionMap.size,
		totalTokens,
		perCategory,
	};
}

/**
 * Format token count for display (e.g., "1,234", "12.3k", "1.2M")
 */
export function formatTokenCount(tokens: number): string {
	if (tokens >= 1_000_000) {
		return `${(tokens / 1_000_000).toFixed(1)}M`;
	}
	if (tokens >= 1_000) {
		return `${(tokens / 1_000).toFixed(1)}k`;
	}
	return tokens.toLocaleString();
}

/**
 * Build a formatted token usage report.
 */
export function formatTokenReport(summary: TokenMetricsSummary): string {
	const lines: string[] = [];
	const sep = "──────────────────────────";

	lines.push("Plan Mode Token Usage");
	lines.push(sep);

	// Session totals
	lines.push(
		`This session:      ${formatTokenCount(summary.session.totalTokens)} tokens`,
	);
	lines.push(
		`All sessions:      ${formatTokenCount(summary.lifetime.totalTokens)} tokens`,
	);
	lines.push(sep);

	// Per-source breakdown (input overhead)
	if (Object.keys(summary.session.sources).length > 0) {
		lines.push("Input overhead (per turn avg):");
		const totalInput = Object.values(summary.session.sources).reduce(
			(a, b) => a + b,
			0,
		);
		for (const [source, tokens] of Object.entries(summary.session.sources)) {
			const pct = totalInput > 0 ? Math.round((tokens / totalInput) * 100) : 0;
			lines.push(`  ${source}: ${formatTokenCount(tokens)} tokens (${pct}%)`);
		}
	}

	// Output tokens
	if (summary.session.outputTokens > 0) {
		lines.push(sep);
		lines.push(
			`Output (this session): ${formatTokenCount(summary.session.outputTokens)} tokens`,
		);
	}

	// Efficiency ratio
	const totalInput = Object.values(summary.session.sources).reduce(
		(a, b) => a + b,
		0,
	);
	if (totalInput > 0 && summary.session.outputTokens > 0) {
		const ratio = (summary.session.outputTokens / totalInput).toFixed(2);
		lines.push(`Efficiency: ${ratio} (output / overhead)`);
	}

	// Lifetime summary
	if (summary.lifetime.sessions > 1) {
		lines.push(sep);
		lines.push(`Across ${summary.lifetime.sessions} sessions:`);
		for (const [cat, info] of Object.entries(summary.lifetime.perCategory)) {
			lines.push(
				`  ${cat}: ${formatTokenCount(info.tokens)} tokens (${info.count}x)`,
			);
		}
	}

	lines.push(sep);
	lines.push("* Token counts are approximate (char/4 estimation)");

	return lines.join("\n");
}
