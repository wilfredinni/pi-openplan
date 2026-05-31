/**
 * Command registrations for plan-mode extension.
 *
 * Exports registerCommands() factory that registers all plan-mode commands
 * with the extension API. Each handler accesses shared state and callbacks
 * via parameters rather than closure.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	compressText,
	isCompressibleFile,
	listPlans,
	readPlanFile,
	updatePlanStatus,
} from "./plan-files.ts";
import {
	extractTodosFromPlan,
	NORMAL_MODE_TOOLS,
	type PlanModeCallbacks,
	type PlanModeState,
} from "./state.ts";
import type {
	TokenMetricsSnapshot,
	TokenMetricsSummary,
} from "./token-metrics.ts";
import {
	aggregateLifetimeMetrics,
	formatTokenReport,
} from "./token-metrics.ts";

export function registerCommands(
	pi: ExtensionAPI,
	state: PlanModeState,
	callbacks: PlanModeCallbacks,
): void {
	// ── /plan ───────────────────────────────────────────────────────────

	pi.registerCommand("plan", {
		description:
			"Toggle plan mode (read-only exploration with structured planning)",
		handler: async (_args, ctx) => callbacks.togglePlanMode(ctx),
	});

	// ── /tokens-toggle ──────────────────────────────────────────────────

	pi.registerCommand("tokens-toggle", {
		description: "Toggle showing per-turn token overhead in the footer status",
		handler: async (_args, ctx) => {
			state.showTokenOverhead = !state.showTokenOverhead;
			ctx.ui.notify(
				`Token overhead ${state.showTokenOverhead ? "shown" : "hidden"} in footer`,
				"info",
			);
			callbacks.updateUI(ctx);
		},
	});

	// ── /compress-context ───────────────────────────────────────────────

	pi.registerCommand("compress-context", {
		description:
			"Compress a context file (default: context.md) into caveman-speak to save input tokens. " +
			"Drops filler, articles, pleasantries; preserves code, URLs, file paths. " +
			"Original backed up as {file}.original.md. Only for .md, .txt, .typ files.",
		handler: async (args, ctx) => {
			const filepath = (args?.trim() || "context.md").replace(
				/^~\//,
				`${os.homedir()}/`,
			);
			const absolutePath = path.isAbsolute(filepath)
				? filepath
				: path.join(ctx.cwd, filepath);

			if (!fs.existsSync(absolutePath)) {
				ctx.ui.notify(`File not found: ${absolutePath}`, "error");
				return;
			}

			if (!isCompressibleFile(absolutePath)) {
				ctx.ui.notify(
					`Skipped: ${absolutePath} is not a compressible file type (.md, .txt, .typ, .tex)`,
					"warning",
				);
				return;
			}

			if (absolutePath.endsWith(".original.md")) {
				ctx.ui.notify(
					"Skipped: already a backup file (*.original.md)",
					"warning",
				);
				return;
			}

			try {
				const content = fs.readFileSync(absolutePath, "utf-8");
				const originalSize = content.length;
				const originalTokens = Math.ceil(originalSize / 4);

				const compressed = compressText(content);
				const compressedSize = compressed.length;
				const compressedTokens = Math.ceil(compressedSize / 4);

				const backupPath = absolutePath.replace(/\.(\w+)$/, ".original.$1");
				fs.writeFileSync(backupPath, content, "utf-8");
				fs.writeFileSync(absolutePath, compressed, "utf-8");

				const saved = originalSize - compressedSize;
				const _savedTokens = originalTokens - compressedTokens;
				const pct =
					originalSize > 0 ? Math.round((saved / originalSize) * 100) : 0;

				ctx.ui.notify(
					`Compressed ${path.basename(absolutePath)}: ${originalTokens} → ${compressedTokens} tokens` +
						` (~${pct}% saved). Backup: ${path.basename(backupPath)}`,
					"info",
				);
			} catch (err) {
				ctx.ui.notify(
					`Failed to compress: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
		},
	});

	// ── /plans ──────────────────────────────────────────────────────────

	pi.registerCommand("plans", {
		description: "List saved plans",
		handler: async (_args, ctx) => {
			const plans = listPlans(ctx.cwd);
			if (plans.length === 0) {
				ctx.ui.notify("No saved plans.", "info");
				return;
			}
			const list = plans
				.map(
					(p) => `• ${p.filename} [${p.metadata.status}] — ${p.metadata.title}`,
				)
				.join("\n");
			ctx.ui.notify(`Saved Plans:\n${list}`, "info");
		},
	});

	// ── /tokens ─────────────────────────────────────────────────────────

	pi.registerCommand("tokens", {
		description: "Show token usage metrics for plan mode",
		handler: async (_args, ctx) => {
			const sessionSummary = state.metrics.getSummary();

			const entries = ctx.sessionManager.getEntries();
			const tokenEntries: TokenMetricsSnapshot[] = [];
			for (const entry of entries) {
				if (
					(entry as { type: string; customType?: string }).type === "custom" &&
					(entry as { type: string; customType?: string }).customType ===
						"plan-mode-tokens"
				) {
					const data = (entry as { data?: TokenMetricsSnapshot[] }).data;
					if (data) tokenEntries.push(...data);
				}
			}
			const lifetime = aggregateLifetimeMetrics(tokenEntries);

			const summary: TokenMetricsSummary = {
				session: {
					totalTokens: sessionSummary.total,
					sources: sessionSummary.sources,
					outputTokens: sessionSummary.output,
				},
				lifetime: {
					totalTokens: lifetime.totalTokens,
					sessions: lifetime.sessions,
					perCategory: lifetime.perCategory,
				},
			};

			const report = formatTokenReport(summary);
			ctx.ui.notify(report, "info");
		},
	});

	// ── /execute_plan ───────────────────────────────────────────────────

	pi.registerCommand("execute_plan", {
		description:
			"Exit plan mode and execute a saved plan. Optionally provide a plan name as argument.",
		handler: async (args, ctx) => {
			if (state.planModeEnabled) {
				state.planModeEnabled = false;
				state.executionMode = true;
				state.todoItems = [];
				pi.setActiveTools(NORMAL_MODE_TOOLS);
			} else if (state.executionMode) {
				// Already in execution mode — reload plan
				state.todoItems = [];
			} else {
				ctx.ui.notify(
					"Cannot execute plan from normal mode. Use /plan first to enter plan mode, then /execute_plan.",
					"warning",
				);
				return;
			}

			state.todoItems = [];
			let planContent = "";
			const planName = args?.trim();

			if (planName) {
				try {
					const plan = readPlanFile(ctx.cwd, planName);
					if (plan) {
						planContent = plan.content;
						updatePlanStatus(ctx.cwd, planName, "in_progress");
						const extracted = extractTodosFromPlan(plan.content);
						if (extracted.length > 0) {
							state.todoItems = extracted;
						}
					} else {
						ctx.ui.notify(
							`No plan found matching "${planName}". Entering execution mode without a plan.`,
							"warning",
						);
					}
				} catch (err) {
					ctx.ui.notify(
						`Failed to read plan: ${err instanceof Error ? err.message : String(err)}`,
						"error",
					);
				}
			}

			callbacks.updateUI(ctx);
			callbacks.persistState();

			pi.appendEntry("plan-mode-execute", {
				planName: planName || null,
				hasTodos: state.todoItems.length > 0,
			});

			if (planContent) {
				const planTitle = planContent.match(/^#[\s]+(.+)/m)?.[1] || "Plan";
				state.metrics.record("plan-content", planContent.length);
				pi.sendUserMessage(
					`Execute plan "${planTitle}" (${planName}). ` +
						`Read full content via plan_read(full:true) if needed. ` +
						`${state.todoItems.length} phases. Tag [DONE:n], pause at ⏸️ markers.`,
				);
			} else {
				state.metrics.record("plan-content", 0);
				pi.sendUserMessage(
					"Execute the plan. Mark phases with [DONE:n]. Pause at ⏸️ markers.",
				);
			}
		},
	});
}
