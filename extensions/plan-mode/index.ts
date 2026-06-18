/**
 * Plan Mode Extension — OpenCode-compatible plan mode for pi.
 *
 * Read-only exploration mode with subagent delegation, structured plan files,
 * clarifying question workflow, and phased execution tracking.
 *
 * Commands:
 *   /plan           — Toggle plan mode
 *   /plans          — List saved plans
 *   /execute_plan   — Exit plan mode and execute a saved plan
 *   Ctrl+Alt+P      — Toggle plan mode
 *
 * Flags:
 *   --plan          — Start in plan mode
 *
 * Tools:
 *   plan_write      — Save a plan to .pi/plans/
 *   plan_read       — Read a saved plan
 *   plan_list       — List all saved plans
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Key, Markdown } from "@earendil-works/pi-tui";
import { registerCommands } from "./commands.ts";
import { registerEvents } from "./events.ts";
import { registerPlanQuestionTool } from "./question-prompt.ts";
import {
	createInitialState,
	NORMAL_MODE_TOOLS,
	PLAN_MODE_TOOLS,
	type PlanModeCallbacks,
	type PlanModeState,
} from "./state.ts";
import { registerTools } from "./tools.ts";

export default function planModeExtension(pi: ExtensionAPI): void {
	// ── State ────────────────────────────────────────────────────────
	const state: PlanModeState = createInitialState();

	// ── Plan Content Renderer ────────────────────────────────────────

	pi.registerMessageRenderer("plan-content", (message, _options, _theme) => {
		const rawContent =
			typeof message.content === "string" ? message.content : "";
		const mdTheme = getMarkdownTheme();
		const md = new Markdown(rawContent, 1, 0, mdTheme);
		return md;
	});

	pi.registerMessageRenderer("plan-answers", (message, _options, _theme) => {
		const rawContent =
			typeof message.content === "string" ? message.content : "";
		const mdTheme = getMarkdownTheme();
		const md = new Markdown(rawContent, 1, 0, mdTheme);
		return md;
	});

	// ── CLI Flag ──────────────────────────────────────────────────────

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	// ── UI Helpers ────────────────────────────────────────────────────

	function updateUI(ctx: Parameters<PlanModeCallbacks["updateUI"]>[0]): void {
		// Safety: no theme access in non-interactive modes
		if (!ctx.hasUI) return;

		// Footer status
		if (state.executionMode && state.todoItems.length > 0) {
			const completed = state.todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus(
				"plan-mode",
				ctx.ui.theme.fg("accent", `📋 ${completed}/${state.todoItems.length}`),
			);
		} else if (state.planModeEnabled) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", `⏸ plan`));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		// Widget showing plan progress (below editor for persistent visibility)
		// Uses function form (render/invalidate) so widget re-renders on completion.
		if (state.executionMode && state.todoItems.length > 0) {
			ctx.ui.setWidget(
				"plan-todos",
				(_tui, theme) => {
					const lines = state.todoItems.map((item) => {
						if (item.completed) {
							return (
								theme.fg("success", "✓ ") +
								theme.fg("muted", theme.strikethrough(item.text))
							);
						}
						return theme.fg("muted", "○ ") + theme.fg("accent", item.text);
					});
					return {
						render: () => lines,
						invalidate: () => {},
					};
				},
				{ placement: "belowEditor" },
			);
		} else if (state.planModeEnabled && state.todoItems.length > 0) {
			ctx.ui.setWidget(
				"plan-todos",
				(_tui, theme) => {
					const lines = state.todoItems.map(
						(item) => `${theme.fg("muted", "○ ")}${item.text}`,
					);
					return {
						render: () => [theme.fg("warning", "── Plan Steps ──"), ...lines],
						invalidate: () => {},
					};
				},
				{ placement: "belowEditor" },
			);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function persistState(): void {
		pi.appendEntry("plan-mode-v2", {
			enabled: state.planModeEnabled,
			todos: state.todoItems,
			executing: state.executionMode,
			turnCount: state.planModeTurnCount,
			activePlan: state.activePlan,
		});
	}

	function enterPlanMode(
		ctx: Parameters<PlanModeCallbacks["enterPlanMode"]>[0],
	): void {
		state.planModeEnabled = true;
		state.executionMode = false;
		state.planModeTurnCount = 0;
		pi.setActiveTools(PLAN_MODE_TOOLS);
		ctx.ui.notify(
			`Plan mode enabled — read-only. Tools: read, grep, find, ls, bash (safe), subagent, research, plan_write`,
			"info",
		);
		updateUI(ctx);
		persistState();
	}

	function exitPlanMode(
		ctx: Parameters<PlanModeCallbacks["exitPlanMode"]>[0],
	): void {
		state.planModeEnabled = false;
		state.executionMode = false;
		state.todoItems = [];
		state.activePlan = undefined;
		pi.setActiveTools(NORMAL_MODE_TOOLS);

		ctx.ui.notify("Plan mode disabled — full access restored.", "info");
		updateUI(ctx);
		persistState();
	}

	function togglePlanMode(
		ctx: Parameters<PlanModeCallbacks["togglePlanMode"]>[0],
	): void {
		if (state.planModeEnabled) {
			exitPlanMode(ctx);
		} else {
			enterPlanMode(ctx);
		}
	}

	const callbacks: PlanModeCallbacks = {
		updateUI,
		persistState,
		togglePlanMode,
		enterPlanMode,
		exitPlanMode,
	};

	// ── Shortcut ──────────────────────────────────────────────────────

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	// ── Register Modules ──────────────────────────────────────────────

	registerCommands(pi, state, callbacks);
	registerTools(pi);
	registerPlanQuestionTool(pi);
	registerEvents(pi, state, callbacks);
}
