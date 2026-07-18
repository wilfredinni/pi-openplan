/**
 * Command registrations for plan-mode extension.
 *
 * Exports registerCommands() factory that registers all plan-mode commands
 * with the extension API. Each handler accesses shared state and callbacks
 * via parameters rather than closure.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { listPlans, readPlanFile, updatePlanStatus } from "./plan-files.ts";
import {
	extractTodosFromPlan,
	NORMAL_MODE_TOOLS,
	PLAN_MODE_TOOLS,
	type PlanModeCallbacks,
	type PlanModeState,
} from "./state.ts";

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

	// ── /execute_plan ───────────────────────────────────────────────────

	pi.registerCommand("execute_plan", {
		description:
			"Exit plan mode and execute a saved plan. Optionally provide a plan name as argument.",
		handler: async (args, ctx) => {
			const wasInPlanMode = state.planModeEnabled;

			if (state.planModeEnabled) {
				state.planModeEnabled = false;
				state.executionMode = true;
				pi.setActiveTools(NORMAL_MODE_TOOLS);
			} else {
				state.executionMode = true;
			}

			const planName = args?.trim();

			let planContent = "";

			if (planName) {
				// Save conversation-extracted todos as fallback in case plan
				// extraction returns zero phases (e.g. non-standard formatting).
				const fallbackTodos =
					state.todoItems.length > 0 ? [...state.todoItems] : [];

				try {
					const plan = readPlanFile(ctx.cwd, planName);
					if (plan) {
						planContent = plan.content;
						updatePlanStatus(ctx.cwd, planName, "in_progress");
						const extracted = extractTodosFromPlan(plan.content);
						if (extracted.length > 0) {
							state.todoItems = extracted;
						} else if (fallbackTodos.length > 0) {
							ctx.ui.notify(
								`No phases detected in "${planName}". Keeping ${fallbackTodos.length} conversation-extracted step(s) as fallback.`,
								"warning",
							);
							state.todoItems = fallbackTodos;
						} else {
							ctx.ui.notify(
								`No phases detected in "${planName}". Execution will proceed without phase tracking.`,
								"warning",
							);
							state.todoItems = [];
						}
					} else {
						ctx.ui.notify(
							`No plan found matching "${planName}". Aborting execution. Use "/plans" to list available plans.`,
							"error",
						);
						// Roll back only if we were in plan mode before this command
						if (wasInPlanMode) {
							state.planModeEnabled = true;
							state.executionMode = false;
							pi.setActiveTools(PLAN_MODE_TOOLS);
						} else {
							state.executionMode = false;
						}
						callbacks.updateUI(ctx);
						return;
					}
				} catch (err) {
					ctx.ui.notify(
						`Failed to read plan: ${err instanceof Error ? err.message : String(err)}`,
						"error",
					);
					if (wasInPlanMode) {
						state.planModeEnabled = true;
						state.executionMode = false;
						pi.setActiveTools(PLAN_MODE_TOOLS);
					} else {
						state.executionMode = false;
					}
					callbacks.updateUI(ctx);
					return;
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
				pi.sendUserMessage(
					`Execute plan "${planTitle}" (${planName}). ` +
						`Read full content via plan_read(full:true) if needed. ` +
						`${state.todoItems.length} phases. Tag [DONE:n], pause at ⏸️ markers.`,
				);
			} else {
				pi.sendUserMessage(
					"Execute the plan. Mark phases with [DONE:n]. Pause at ⏸️ markers.",
				);
			}
		},
	});
}
