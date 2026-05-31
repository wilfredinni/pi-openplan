/**
 * Lightweight token estimation for plan mode.
 *
 * Uses chars/4 heuristic (≈1 token per 4 English characters) — same approach
 * used by Claude's tokenizer for typical English text. Not accurate for
 * code-heavy or non-English content, but sufficient for relative savings.
 *
 * Tracks input (system prompts injected) and output (agent responses)
 * across the session. Used by events.ts hooks — no command interface.
 *
 * See README.md for the token savings claims this measures.
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface TokenMetricsState {
	totalInputTokens: number;
	totalOutputTokens: number;
	sessionInputTokens: number;
	sessionOutputTokens: number;
	turns: number;
}

// ── Estimation ──────────────────────────────────────────────────────────

/**
 * Estimate token count from text using chars/4 heuristic.
 * Strips ANSI codes before counting for cleaner estimates.
 */
export function estimateTokenCount(text: string): number {
	if (!text) return 0;
	// Strip ANSI escape sequences (common in terminal output)
	// biome-ignore lint/suspicious/noControlCharactersInRegex: needed for ANSI stripping
	const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
	return Math.max(1, Math.ceil(clean.length / 4));
}

// ── Factory ─────────────────────────────────────────────────────────────

export function createTokenMetricsState(): TokenMetricsState {
	return {
		totalInputTokens: 0,
		totalOutputTokens: 0,
		sessionInputTokens: 0,
		sessionOutputTokens: 0,
		turns: 0,
	};
}

// ── Record Functions ────────────────────────────────────────────────────

export function recordInput(metrics: TokenMetricsState, text: string): void {
	const tokens = estimateTokenCount(text);
	metrics.totalInputTokens += tokens;
	metrics.sessionInputTokens += tokens;
	metrics.turns++;
}

export function recordOutput(metrics: TokenMetricsState, text: string): void {
	const tokens = estimateTokenCount(text);
	metrics.totalOutputTokens += tokens;
	metrics.sessionOutputTokens += tokens;
}

// ── Helpers ─────────────────────────────────────────────────────────────

export function getSessionSummary(metrics: TokenMetricsState): string {
	if (metrics.turns === 0) return "No plan mode turns yet.";

	const fullPromptBaseline = 1221; // v1.0 full prompt token count
	const allInputTokens = metrics.sessionInputTokens;
	const estimatedWithoutOptimization = metrics.turns * fullPromptBaseline;
	const savings = estimatedWithoutOptimization - allInputTokens;
	const savingsPct =
		estimatedWithoutOptimization > 0
			? Math.round((savings / estimatedWithoutOptimization) * 100)
			: 0;

	return (
		`${metrics.turns} turn(s) | ` +
		`${metrics.sessionInputTokens} input tokens injected | ` +
		`${metrics.sessionOutputTokens} output tokens generated | ` +
		`~${savingsPct}% input savings vs baseline (${fullPromptBaseline}t/turn)`
	);
}
