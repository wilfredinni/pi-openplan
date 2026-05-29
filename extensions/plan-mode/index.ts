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

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	getMarkdownTheme,
	parseFrontmatter,
	type ThemeColor,
} from "@earendil-works/pi-coding-agent";
import { Key, Markdown } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
	buildMemoryBankPrompt,
	type MemoryBankFile,
	readAllMemoryBankFiles,
	readMemoryBankFile,
	writeMemoryBankFile,
} from "./memory-bank.ts";
import {
	createPlanFile,
	getDependencyGraph,
	listPlans,
	listPlanVersions,
	loadCustomTemplate,
	type PlanMetadata,
	readPlanFile,
	slugify,
	updatePlanStatus,
} from "./plan-files.ts";
import {
	EXECUTION_MODE_PROMPT,
	PLAN_AMEND_SYSTEM_PROMPT,
	PLAN_MODE_SYSTEM_PROMPT,
	PLAN_RESUME_SYSTEM_PROMPT,
	PLAN_REVISE_SYSTEM_PROMPT,
} from "./prompts.ts";
import {
	MAX_HEADER_LENGTH,
	MAX_OPTIONS,
	MAX_QUESTIONS,
	MIN_OPTIONS,
	type PlanQuestionInput,
	PlanQuestionPrompt,
} from "./questions.ts";

// ── Tool Sets ──────────────────────────────────────────────────────────

/** Tools allowed in plan mode (read-only + plan management) */
const PLAN_MODE_TOOLS = [
	"read",
	"grep",
	"find",
	"ls",
	"bash",
	"subagent",
	"web_search",
	"fetch_content",
	"code_search",
	"get_search_content",
	"ctx_execute",
	"ctx_execute_file",
	"ctx_search",
	"ctx_batch_execute",
	"ctx_index",
	"ctx_fetch_and_index",
	"plan_write",
	"plan_read",
	"plan_list",
	"plan_question",
];

/** Tools restored when exiting plan mode */
const NORMAL_MODE_TOOLS = [...PLAN_MODE_TOOLS, "edit", "write"];

// ── Bash Safety ────────────────────────────────────────────────────────

const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\s+-s\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/\bsed\s+.*-i\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_PATTERNS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*curl\s/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*eza\b/,
	/^\s*make\s+(test|test-cov|shell|logs)/i,
];

function isSafeCommand(command: string): boolean {
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(command));
	return !isDestructive && isSafe;
}

// ── Todo / Plan Step Tracking ──────────────────────────────────────────

type TodoStatus = "pending" | "in_progress" | "done" | "skipped" | "failed";

interface TodoItem {
	step: number;
	text: string;
	status: TodoStatus;
	startedAt?: string;
	completedAt?: string;
}

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function extractTodosFromPlan(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	const headerMatch = message.match(/\*{0,2}Phase\s+\d+\*{0,2}[:*-]?\s*\n/i);
	if (!headerMatch) {
		// Fallback: look for "Plan:" header
		const planMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
		if (!planMatch) return items;

		const planSection = message.slice(
			message.indexOf(planMatch[0]) + planMatch[0].length,
		);
		const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;
		for (const match of planSection.matchAll(numberedPattern)) {
			const text = match[2]
				.trim()
				.replace(/\*{1,2}$/, "")
				.trim();
			if (text.length > 3) {
				items.push({
					step: items.length + 1,
					text: text.length > 60 ? `${text.slice(0, 57)}...` : text,
					status: "pending",
				});
			}
		}
		return items;
	}

	// Extract phases from the plan
	const phasePattern =
		/(?:###?\s*)?\*{0,2}Phase\s+(\d+)\*{0,2}[:*-]?\s*([^\n]+)/gi;
	for (const match of message.matchAll(phasePattern)) {
		const num = parseInt(match[1], 10);
		const name = match[2].trim();
		if (name.length > 3) {
			items.push({
				step: num,
				text: name.length > 60 ? `${name.slice(0, 57)}...` : name,
				status: "pending",
			});
		}
	}

	// If no phases found, try numbered list under "Changes" or "Implementation"
	if (items.length === 0) {
		const changesMatch = message.match(
			/(?:###?\s*)?(?:Changes|Implementation|Approach)[:*]?\s*\n/i,
		);
		if (changesMatch) {
			const section = message.slice(
				message.indexOf(changesMatch[0]) + changesMatch[0].length,
			);
			const numPattern = /^\s*(\d+)[.)]\s+([^\n]+)/gm;
			for (const match of section.matchAll(numPattern)) {
				const text = match[2].trim();
				if (text.length > 3) {
					items.push({ step: items.length + 1, text, status: "pending" });
				}
			}
		}
	}

	return items;
}

/**
 * Extract status tags from text: [DONE:n], [SKIP:n], [FAIL:n], [START:n]
 */
function extractStatusSteps(text: string): Map<number, TodoStatus> {
	const steps = new Map<number, TodoStatus>();
	const patterns: [RegExp, TodoStatus][] = [
		[/\[DONE:(\d+)\]/gi, "done"],
		[/\[SKIP:(\d+)\]/gi, "skipped"],
		[/\[FAIL:(\d+)\]/gi, "failed"],
		[/\[START:(\d+)\]/gi, "in_progress"],
	];
	for (const [regex, status] of patterns) {
		for (const match of text.matchAll(regex)) {
			const step = Number(match[1]);
			if (Number.isFinite(step)) {
				steps.set(step, status);
			}
		}
	}
	return steps;
}

/**
 * Legacy support: extract [DONE:n] tags only.
 */
function extractDoneSteps(text: string): number[] {
	const steps: number[] = [];
	for (const match of text.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

function markCompletedSteps(text: string, items: TodoItem[]): number {
	const done = extractDoneSteps(text);
	for (const step of done) {
		const item = items.find((t) => t.step === step);
		if (item) {
			item.status = "done";
			item.completedAt = new Date().toISOString();
		}
	}
	return done.length;
}

/**
 * Update todo item statuses from all status tags in the text.
 */
function updateStepStatus(text: string, items: TodoItem[]): number {
	const statusMap = extractStatusSteps(text);
	let changed = 0;
	for (const [step, status] of statusMap) {
		const item = items.find((t) => t.step === step);
		if (item && item.status !== status) {
			item.status = status;
			if (status === "done" || status === "failed" || status === "skipped") {
				item.completedAt = new Date().toISOString();
			} else if (status === "in_progress") {
				item.startedAt = item.startedAt ?? new Date().toISOString();
			}
			changed++;
		}
	}
	return changed;
}

// ── Extension ──────────────────────────────────────────────────────────

export default function planModeExtension(pi: ExtensionAPI): void {
	// ── State ──────────────────────────────────────────────────────────
	let planModeEnabled = false;
	let executionMode = false;
	let planReviseMode = false;
	let planAmendMode = false;
	let pendingPlanContent = "";
	let pendingPlanTitle = "";
	let todoItems: TodoItem[] = [];

	// ── Plan Content Renderer ──────────────────────────────────────────

	pi.registerMessageRenderer("plan-content", (message, _options, _theme) => {
		const rawContent =
			typeof message.content === "string" ? message.content : "";
		const mdTheme = getMarkdownTheme();
		const md = new Markdown(rawContent, 1, 0, mdTheme);
		return md;
	});

	// ── CLI Flag ────────────────────────────────────────────────────────
	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	// ── UI Helpers ──────────────────────────────────────────────────────

	function getStatusIcon(
		theme: {
			fg: (color: ThemeColor, text: string) => string;
			strikethrough: (text: string) => string;
		},
		status: TodoStatus,
		text: string,
	): string {
		switch (status) {
			case "done":
				return (
					theme.fg("success", "✓ ") +
					theme.fg("muted", theme.strikethrough(text))
				);
			case "in_progress":
				return theme.fg("accent", "⟳ ") + theme.fg("accent", text);
			case "failed":
				return theme.fg("warning", "✗ ") + theme.fg("warning", text);
			case "skipped":
				return theme.fg("muted", "⏭ ") + theme.fg("muted", text);
			default:
				return theme.fg("muted", "○ ") + theme.fg("accent", text);
		}
	}

	function renderProgressBar(
		theme: {
			fg: (color: ThemeColor, text: string) => string;
		},
		completed: number,
		total: number,
	): string {
		const width = 10;
		const done = Math.floor((completed / Math.max(total, 1)) * width);
		const bar = "█".repeat(done) + "░".repeat(Math.max(0, width - done));
		return theme.fg("accent", `${bar} ${completed}/${total}`);
	}

	function updateUI(ctx: ExtensionContext): void {
		// Footer status
		if (planAmendMode) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "✎ amend"));
		} else if (planReviseMode) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "✎ revise"));
		} else if (executionMode && todoItems.length > 0) {
			const doneCount = todoItems.filter((t) => t.status === "done").length;
			ctx.ui.setStatus(
				"plan-mode",
				ctx.ui.theme.fg("accent", `📋 ${doneCount}/${todoItems.length}`),
			);
		} else if (planModeEnabled) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		// Widget showing plan progress
		if (executionMode && todoItems.length > 0) {
			const doneCount = todoItems.filter((t) => t.status === "done").length;
			const progressBar = renderProgressBar(
				ctx.ui.theme,
				doneCount,
				todoItems.length,
			);
			const lines = [
				ctx.ui.theme.fg("muted", progressBar),
				...todoItems.map((item) =>
					getStatusIcon(ctx.ui.theme, item.status, item.text),
				),
			];
			ctx.ui.setWidget("plan-todos", lines);
		} else if (planModeEnabled && todoItems.length > 0) {
			const lines = todoItems.map(
				(item) => `${ctx.ui.theme.fg("muted", "○ ")}${item.text}`,
			);
			ctx.ui.setWidget("plan-todos", [
				ctx.ui.theme.fg("warning", "── Plan Steps ──"),
				...lines,
			]);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function persistState(): void {
		pi.appendEntry("plan-mode-v2", {
			enabled: planModeEnabled,
			todos: todoItems,
			executing: executionMode,
			revising: planReviseMode,
			amending: planAmendMode,
			pendingPlanContent,
			pendingPlanTitle,
		});
	}

	// ── Toggle ──────────────────────────────────────────────────────────

	function enterPlanMode(ctx: ExtensionContext): void {
		planModeEnabled = true;
		executionMode = false;
		planReviseMode = false;
		planAmendMode = false;
		pendingPlanContent = "";
		pendingPlanTitle = "";
		pi.setActiveTools(PLAN_MODE_TOOLS);
		ctx.ui.notify(
			`Plan mode enabled — read-only. Tools: read, grep, find, ls, bash (safe), subagent, research, plan_write`,
			"info",
		);
		updateUI(ctx);
		persistState();
	}

	function exitPlanMode(ctx: ExtensionContext): void {
		planModeEnabled = false;
		executionMode = false;
		planReviseMode = false;
		planAmendMode = false;
		pendingPlanContent = "";
		pendingPlanTitle = "";
		todoItems = [];
		pi.setActiveTools(NORMAL_MODE_TOOLS);
		ctx.ui.notify("Plan mode disabled — full access restored.", "info");
		updateUI(ctx);
		persistState();
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		if (planModeEnabled) {
			exitPlanMode(ctx);
		} else {
			enterPlanMode(ctx);
		}
	}

	// ── Commands ────────────────────────────────────────────────────────

	pi.registerCommand("plan", {
		description:
			"Toggle plan mode (read-only exploration with structured planning)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerCommand("plan_resume", {
		description:
			"Resume execution of an incomplete plan. If a plan name is provided, load it and resume from the first incomplete phase.",
		handler: async (args, ctx) => {
			const planName = args?.trim();

			// Exit plan mode if active
			if (planModeEnabled) {
				planModeEnabled = false;
				executionMode = true;
				pi.setActiveTools(NORMAL_MODE_TOOLS);
			} else if (!executionMode) {
				executionMode = true;
			}

			if (planName) {
				// Load plan and re-extract todos
				const plan = readPlanFile(ctx.cwd, planName);
				if (plan) {
					todoItems = extractTodosFromPlan(plan.content);
					updatePlanStatus(ctx.cwd, planName, "in_progress");
				}
			}

			if (todoItems.length === 0) {
				ctx.ui.notify(
					"No plan loaded. Use /execute_plan <name> to start a new execution.",
					"warning",
				);
				return;
			}

			const statusLines = todoItems
				.map((t) => {
					const icon =
						t.status === "done"
							? "[DONE]"
							: t.status === "skipped"
								? "[SKIP]"
								: t.status === "in_progress"
									? "[START]"
									: "[PENDING]";
					return `${icon} Phase ${t.step}: ${t.text}`;
				})
				.join("\n");

			ctx.ui.notify(
				`Resuming execution from phase ${
					todoItems.find((t) => t.status !== "done")?.step ?? 1
				}.`,
				"info",
			);

			updateUI(ctx);
			persistState();

			pi.sendUserMessage(
				`${PLAN_RESUME_SYSTEM_PROMPT}\n\n## Current Plan Status\n\n${statusLines}\n\nResume execution. Use [DONE:n], [START:n], [SKIP:n], or [FAIL:n] tags.`,
			);
		},
	});

	pi.registerCommand("plan_skip", {
		description: "Skip a phase by number. Usage: /plan_skip <phase-number>",
		handler: async (args, ctx) => {
			const phaseNum = parseInt(args?.trim() ?? "", 10);
			if (Number.isNaN(phaseNum) || phaseNum < 1) {
				ctx.ui.notify(
					"Usage: /plan_skip <phase-number> — provide the phase number to skip.",
					"warning",
				);
				return;
			}

			const item = todoItems.find((t) => t.step === phaseNum);
			if (!item) {
				ctx.ui.notify(`Phase ${phaseNum} not found.`, "warning");
				return;
			}

			item.status = "skipped";
			item.completedAt = new Date().toISOString();
			ctx.ui.notify(`Skipped Phase ${phaseNum}: ${item.text}`, "info");
			updateUI(ctx);
			persistState();
		},
	});

	pi.registerCommand("plan_retry", {
		description:
			"Retry a failed or skipped phase by resetting it. Usage: /plan_retry <phase-number>",
		handler: async (args, ctx) => {
			const phaseNum = parseInt(args?.trim() ?? "", 10);
			if (Number.isNaN(phaseNum) || phaseNum < 1) {
				ctx.ui.notify(
					"Usage: /plan_retry <phase-number> — provide the phase number to retry.",
					"warning",
				);
				return;
			}

			const item = todoItems.find((t) => t.step === phaseNum);
			if (!item) {
				ctx.ui.notify(`Phase ${phaseNum} not found.`, "warning");
				return;
			}

			item.status = "pending";
			item.completedAt = undefined;
			item.startedAt = undefined;
			ctx.ui.notify(
				`Reset Phase ${phaseNum}: ${item.text} to pending.`,
				"info",
			);
			updateUI(ctx);
			persistState();
		},
	});

	pi.registerCommand("plan_models", {
		description:
			"Configure models for plan and execute modes. Usage: /plan_models plan=<model> execute=<model>",
		handler: async (args, ctx) => {
			// Parse args like "plan=model1 execute=model2"
			const parts = (args ?? "").trim().split(/\s+/);
			if (parts.length === 0 || parts[0] === "") {
				ctx.ui.notify(
					"Current model settings. To change: /plan_models plan=<model> execute=<model>",
					"info",
				);
				return;
			}

			const planModelValue = parts
				.find((p) => p.startsWith("plan="))
				?.slice("plan=".length);
			const executeModelValue = parts
				.find((p) => p.startsWith("execute="))
				?.slice("execute=".length);

			if (planModelValue || executeModelValue) {
				pi.appendEntry("plan-model-preferences", {
					planModel: planModelValue || null,
					executeModel: executeModelValue || null,
				});
				ctx.ui.notify(
					`Models updated. Plan: ${planModelValue ?? "default"}, Execute: ${executeModelValue ?? "default"}`,
					"info",
				);
			}
		},
	});

	pi.registerCommand("plan_deps", {
		description: "Show dependency graph of all plans",
		handler: async (_args, ctx) => {
			const deps = getDependencyGraph(ctx.cwd);
			if (deps.length === 0) {
				ctx.ui.notify("No plans found.", "info");
				return;
			}

			const lines = deps.map((p) => {
				const depends =
					p.dependsOn.length > 0
						? `depends on: ${p.dependsOn.join(", ")}`
						: "no dependencies";
				const blocks =
					p.blocks.length > 0
						? `blocks: ${p.blocks.join(", ")}`
						: "blocks nothing";
				return `• **${p.filename}** [${p.status}] — ${p.title}\n  ${depends}\n  ${blocks}`;
			});

			ctx.ui.notify(`Dependency Graph:\n\n${lines.join("\n")}`, "info");
		},
	});

	pi.registerCommand("plan_revise", {
		description:
			"Load an existing plan and re-enter plan mode to revise it. Provide a plan name as argument.",
		handler: async (args, ctx) => {
			const planName = args?.trim();
			if (!planName) {
				ctx.ui.notify(
					"Usage: /plan_revise <plan-name> — provide the plan name to revise.",
					"warning",
				);
				return;
			}

			try {
				const plan = readPlanFile(ctx.cwd, planName);
				if (!plan) {
					ctx.ui.notify(
						`No plan found matching "${planName}". Use /plans to list available plans.`,
						"error",
					);
					return;
				}

				// Enter plan mode if not already
				if (!planModeEnabled) {
					enterPlanMode(ctx);
				}

				planReviseMode = true;
				pendingPlanContent = plan.content;
				pendingPlanTitle = plan.metadata.title;

				// Increment version
				const newVersion = (plan.metadata.version ?? 1) + 1;

				ctx.ui.notify(
					`Loaded plan: ${plan.metadata.title} (v${plan.metadata.version ?? 1}). Revise and save with plan_write.`,
					"info",
				);

				updateUI(ctx);
				persistState();

				// Send the plan to the agent for revision
				pi.sendUserMessage(
					`Revise the plan: **${plan.metadata.title}** (v${plan.metadata.version ?? 1} → v${newVersion})\n\nCurrent plan:\n${plan.content}\n\nApply the requested changes. When done, use plan_write to save the updated plan. The version in frontmatter should be ${newVersion}.`,
				);
			} catch (err) {
				ctx.ui.notify(
					`Failed to load plan: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
		},
	});

	pi.registerCommand("plan_amend", {
		description:
			"Pause execution and modify the remaining phases of the current plan.",
		handler: async (_args, ctx) => {
			if (!executionMode || todoItems.length === 0) {
				ctx.ui.notify(
					"No active plan execution to amend. Start with /execute_plan first.",
					"warning",
				);
				return;
			}

			planAmendMode = true;

			// Build plan content with completion status
			const remaining = todoItems.filter((t) => t.status !== "done");
			const doneItems = todoItems.filter((t) => t.status === "done");
			const statusLines = [
				"## Completion Status",
				"",
				"### Completed",
				...doneItems.map((t) => `- [DONE:${t.step}] ${t.text}`),
				"",
				"### Remaining",
				...remaining.map((t) => `- [PENDING:${t.step}] ${t.text}`),
				"",
				"---",
			];
			pendingPlanContent = statusLines.join("\n");
			pendingPlanTitle = "Plan Amendment";

			ctx.ui.notify(
				"Execution paused. Modify the remaining phases, then use plan_write to save.",
				"info",
			);

			updateUI(ctx);
			persistState();

			pi.sendUserMessage(
				`${PLAN_AMEND_SYSTEM_PROMPT}\n\nCurrent plan status:\n${pendingPlanContent}\n\nApply the requested changes. Use plan_write to save the amended plan.`,
			);
		},
	});

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

	pi.registerCommand("execute_plan", {
		description:
			"Exit plan mode and execute a saved plan. Optionally provide a plan name as argument.",
		handler: async (args, ctx) => {
			// Exit plan mode if active
			if (planModeEnabled) {
				planModeEnabled = false;
				executionMode = true;
				pi.setActiveTools(NORMAL_MODE_TOOLS);
			} else {
				executionMode = true;
			}

			todoItems = [];
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
							todoItems = extracted;
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

			updateUI(ctx);
			persistState();

			// Record execution start for resume tracking
			pi.appendEntry("plan-mode-execute", {
				planName: planName || null,
				hasTodos: todoItems.length > 0,
			});

			// Send user message to execute the plan
			if (planContent) {
				const planTitle = planContent.match(/^#[\s]+(.+)/m)?.[1] || "Plan";
				pi.sendUserMessage(
					`Execute the plan: **${planTitle}**\n\n${planContent}\n\nFollow each phase in order. After completing each step, include a [DONE:n] tag matching the phase number. Report progress after each phase.`,
				);
			} else {
				pi.sendUserMessage(
					"Execute the plan. Follow all phases in order and mark steps with [DONE:n] when completed.",
				);
			}
		},
	});

	// ── Shortcut ────────────────────────────────────────────────────────

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	// ── Plan Question Tool ────────────────────────────────────────────

	pi.registerTool({
		name: "plan_question",
		label: "Ask Questions",
		description:
			"Present interactive clarifying questions to the user. Use during plan mode to ask structured questions with predefined options. Supports single-select, multi-select, and custom text answers. Batch multiple related questions in one call. Returns answers as arrays mapping to each question.",
		promptSnippet: "Ask structured clarifying questions with options",
		promptGuidelines: [
			"Use plan_question to ask structured clarifying questions with predefined options. Do NOT ask questions inline — use the tool for a better interactive UX.",
			"Each question must have a short header (max 12 chars) and 2-4 options with clear labels and descriptions.",
			"Batch multiple related questions in one call (max 4 questions per call).",
		],
		parameters: Type.Object({
			questions: Type.Array(
				Type.Object({
					question: Type.String({
						description: "Full question text to display",
					}),
					header: Type.String({
						description: "Short label for tab display (max 12 characters)",
					}),
					options: Type.Array(
						Type.Object({
							label: Type.String({
								description: "Option label shown to user",
							}),
							description: Type.String({
								description: "Brief description of this option",
							}),
						}),
						{
							minItems: MIN_OPTIONS,
							maxItems: MAX_OPTIONS,
							description: "2-4 predefined options with label and description",
						},
					),
					multiSelect: Type.Optional(
						Type.Boolean({
							description:
								"Allow multiple selections (checkboxes). Default: false",
						}),
					),
					custom: Type.Optional(
						Type.Boolean({
							description: "Allow free-text 'Other' answer. Default: true",
						}),
					),
				}),
				{
					minItems: 1,
					maxItems: MAX_QUESTIONS,
					description: "1-4 questions to ask",
				},
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const input = params as unknown as PlanQuestionInput;

			// Validate input
			for (const q of input.questions) {
				if (!q.question?.trim()) {
					return {
						content: [
							{
								type: "text",
								text: `Error: question text is empty. Each question must have non-empty text.`,
							},
						],
						details: {},
						isError: true,
					};
				}
				if (!q.header?.trim()) {
					return {
						content: [
							{
								type: "text",
								text: `Error: header is empty for question "${q.question.slice(0, 40)}...". Each question needs a short header label.`,
							},
						],
						details: {},
						isError: true,
					};
				}
				if (q.header.length > MAX_HEADER_LENGTH) {
					return {
						content: [
							{
								type: "text",
								text: `Error: header "${q.header}" exceeds max length of ${MAX_HEADER_LENGTH} characters. Please shorten it.`,
							},
						],
						details: {},
						isError: true,
					};
				}
			}

			// Interactive mode: present as TUI overlay
			if (ctx.hasUI && ctx.ui.custom) {
				const result = await ctx.ui.custom<string[][] | null>(
					(tui, theme, _kb, done) => {
						const prompt = new PlanQuestionPrompt(input.questions, theme, done);
						return {
							render: (w: number) => prompt.render(w),
							invalidate() {
								prompt.invalidate();
							},
							handleInput(data: string) {
								prompt.handleInput(data);
								tui.requestRender();
							},
						};
					},
				);

				if (result === null) {
					return {
						content: [
							{
								type: "text",
								text: "Questions were dismissed by the user. Proceed with your best judgment based on what you know, or make reasonable assumptions.",
							},
						],
						details: { dismissed: true },
					};
				}

				return {
					content: [
						{
							type: "text",
							text: `User answers received:\n${result
								.map((answers, i) => {
									const header = input.questions[i]?.header ?? `Q${i + 1}`;
									return `${header}: ${answers.length > 0 ? answers.join(", ") : "(no preference)"}`;
								})
								.join("\n")}`,
						},
					],
					details: { answers: result },
				};
			}

			// Non-interactive mode (print / JSON): return questions as text
			const questionText = input.questions
				.map(
					(q, i) =>
						`Question ${i + 1}: ${q.question}\nOptions:\n${q.options.map((o, j) => `  ${j + 1}. ${o.label} — ${o.description}`).join("\n")}${q.custom !== false ? `\n  or type your own answer` : ""}`,
				)
				.join("\n\n");

			return {
				content: [
					{
						type: "text",
						text: `This terminal does not support interactive questions. Make reasonable assumptions based on the context:\n\n${questionText}`,
					},
				],
				details: { nonInteractive: true },
			};
		},
	});

	// ── Memory Bank Tools ─────────────────────────────────────────────

	pi.registerTool({
		name: "memory_read",
		label: "Memory Read",
		description:
			"Read a memory bank file (context.md, system-patterns.md, progress.md) from the project root. If no filename provided, lists all available memory bank files.",
		promptSnippet:
			"Read memory bank files for persistent project context across sessions",
		parameters: Type.Object({
			filename: Type.Optional(
				Type.String({
					description:
						"Optional: specific file to read (context.md, system-patterns.md, progress.md)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				if (params.filename) {
					const entry = readMemoryBankFile(
						ctx.cwd,
						params.filename as MemoryBankFile,
					);
					if (!entry.exists) {
						return {
							content: [
								{
									type: "text",
									text: `Memory bank file "${params.filename}" not found. Available files: ${readAllMemoryBankFiles(
										ctx.cwd,
									)
										.map((e) => e.filename)
										.join(", ")}`,
								},
							],
							details: {},
						};
					}
					return {
						content: [{ type: "text", text: entry.content }],
						details: { filename: entry.filename },
					};
				}

				// List all available memory bank files
				const entries = readAllMemoryBankFiles(ctx.cwd);
				if (entries.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No memory bank files found. Create context.md, system-patterns.md, or progress.md in the project root.",
							},
						],
						details: { files: [] },
					};
				}
				const list = entries
					.map((e) => `- **${e.filename}** (${e.content.length} chars)`)
					.join("\n");
				return {
					content: [
						{
							type: "text",
							text: `# Memory Bank Files\n\n${list}`,
						},
					],
					details: { files: entries.map((e) => e.filename) },
				};
			} catch (err: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Failed to read memory bank: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: {},
					isError: true,
				};
			}
		},
	});

	pi.registerTool({
		name: "memory_write",
		label: "Memory Write",
		description:
			"Write or update a memory bank file (context.md, system-patterns.md, progress.md) in the project root. Use for persisting project context across sessions.",
		promptSnippet: "Update memory bank files to persist project context",
		parameters: Type.Object({
			filename: Type.String({
				description:
					"File to write: context.md, system-patterns.md, or progress.md",
			}),
			content: Type.String({
				description: "Full content of the memory bank file (markdown)",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const filename = params.filename as MemoryBankFile;
				const validFiles = ["context.md", "system-patterns.md", "progress.md"];
				if (!validFiles.includes(filename)) {
					return {
						content: [
							{
								type: "text",
								text: `Invalid filename "${filename}". Must be one of: ${validFiles.join(", ")}`,
							},
						],
						details: {},
						isError: true,
					};
				}

				writeMemoryBankFile(ctx.cwd, filename, params.content);

				return {
					content: [
						{
							type: "text",
							text: `Memory bank file updated: ${filename}`,
						},
					],
					details: { filename },
				};
			} catch (err: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Failed to write memory bank: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: {},
					isError: true,
				};
			}
		},
	});

	// ── Plan Management Tools ───────────────────────────────────────────

	pi.registerTool({
		name: "plan_write",
		label: "Write Plan",
		description:
			"Save an implementation plan to .pi/plans/. Use during plan mode to persist structured plans with phases, verification steps, and risks.",
		promptSnippet: "Save an implementation plan to .pi/plans/{filename}",
		promptGuidelines: [
			"Use plan_write to save structured plans during plan mode. Include phases, verification steps, risks, and pause points.",
		],
		parameters: Type.Object({
			filename: Type.String({
				description:
					"Plan filename (e.g. 'add-rate-limiting' or 'feature-auth'). Auto-prefixed with date and .md extension.",
			}),
			title: Type.String({
				description: "Human-readable plan title",
			}),
			content: Type.String({
				description:
					"Full plan content in markdown. Include phases, verification, risks, and pause points.",
			}),
			type: Type.Optional(
				Type.String({
					description:
						"Plan type: feature, fix, refactor, or chore (default: feature)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const filename = slugify(params.filename);
				const metadata: PlanMetadata = {
					title: params.title,
					status: "draft",
					created: new Date().toISOString(),
					version: 1,
					type: (params.type as PlanMetadata["type"]) ?? "feature",
				};
				const result = createPlanFile(
					ctx.cwd,
					filename,
					params.content,
					metadata,
				);
				// Stripe any YAML frontmatter the agent may have included in the content
				const { body: cleanBody } = parseFrontmatter(params.content);
				const hasOwnTitle = /^#\s/.test(cleanBody.trimStart());
				const titleHeading = hasOwnTitle ? "" : `# ${params.title}\n\n`;
				const statusIcon =
					metadata.status === "draft"
						? "📝"
						: metadata.status === "in_progress"
							? "🔄"
							: metadata.status === "done"
								? "✅"
								: "📋";
				const metaLine = `*${statusIcon} ${metadata.status} · ${metadata.type} · ${new Date(metadata.created).toLocaleDateString()}*\n`;

				// Display the plan as a rendered markdown message in the conversation
				pi.sendMessage(
					{
						customType: "plan-content",
						content: `${titleHeading}${metaLine}\n${cleanBody}`,
						display: true,
					},
					{ triggerTurn: false },
				);

				return {
					content: [
						{
							type: "text",
							text: `Plan saved: ${result.path} (${metadata.type}, ${metadata.status})`,
						},
					],
					details: { path: result.path, filename },
				};
			} catch (err: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Failed to save plan: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: {},
					isError: true,
				};
			}
		},
	});

	pi.registerTool({
		name: "plan_read",
		label: "Read Plan",
		description:
			"Read a saved plan from .pi/plans/. Use to review plans created earlier in this or previous sessions.",
		promptSnippet: "Read a plan from .pi/plans/{filename}",
		parameters: Type.Object({
			filename: Type.String({
				description:
					"Plan filename or partial name (e.g. 'add-rate-limiting', 'feature-auth')",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const plan = readPlanFile(ctx.cwd, params.filename);
				if (!plan) {
					return {
						content: [
							{
								type: "text",
								text: `No plan found matching "${params.filename}". Use plan_list to see available plans.`,
							},
						],
						details: {},
					};
				}
				return {
					content: [
						{
							type: "text",
							text: `# ${plan.metadata.title}\nStatus: ${plan.metadata.status} | Created: ${plan.metadata.created} | Type: ${plan.metadata.type}\n\n${plan.content}`,
						},
					],
					details: { filename: plan.filename, metadata: plan.metadata },
				};
			} catch (err: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Failed to read plan: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: {},
					isError: true,
				};
			}
		},
	});

	pi.registerTool({
		name: "plan_history",
		label: "Plan History",
		description:
			"List version history for a plan or a specific saved plan. Optionally show the diff between versions.",
		promptSnippet: "Show version history for a plan",
		parameters: Type.Object({
			filename: Type.String({
				description: "Plan filename or partial name to show history for",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const versions = listPlanVersions(ctx.cwd, params.filename);
				if (versions.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `No version history found for "${params.filename}".`,
							},
						],
						details: { versions: [] },
					};
				}

				const list = versions
					.map(
						(v) =>
							`- **v${v.version}** — ${v.timestamp.slice(0, 10)} (${v.file})`,
					)
					.join("\n");

				return {
					content: [
						{
							type: "text",
							text: `# Version History: ${params.filename}\n\n${list}`,
						},
					],
					details: { versions },
				};
			} catch (err: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Failed to list plan history: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: {},
					isError: true,
				};
			}
		},
	});

	pi.registerTool({
		name: "plan_list",
		label: "List Plans",
		description:
			"List all saved plans in .pi/plans/. Shows filename, status, title, and creation date.",
		promptSnippet: "List all saved plans",
		parameters: Type.Object({
			status: Type.Optional(
				Type.String({
					description:
						"Filter by status: draft, approved, in_progress, or done",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const plans = listPlans(
					ctx.cwd,
					params.status as PlanMetadata["status"] | undefined,
				);
				if (plans.length === 0) {
					return {
						content: [{ type: "text", text: "No plans found." }],
						details: { plans: [] },
					};
				}
				const list = plans
					.map(
						(p) =>
							`- **${p.filename}** [${p.metadata.status}] ${p.metadata.title} (${p.metadata.created.slice(0, 10)})`,
					)
					.join("\n");
				return {
					content: [{ type: "text", text: `# Saved Plans\n\n${list}` }],
					details: { plans: plans.map((p) => p.filename) },
				};
			} catch (err: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Failed to list plans: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: {},
					isError: true,
				};
			}
		},
	});

	// ── Event: Block Dangerous Bash ─────────────────────────────────────

	pi.on("tool_call", async (event) => {
		if (!planModeEnabled || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason:
					`Plan mode: destructive command blocked.\n` +
					`To run: exit plan mode first with /plan, then re-run.\n` +
					`Blocked: ${command.slice(0, 80)}`,
			};
		}
	});

	// ── Event: Inject System Prompts ────────────────────────────────────

	pi.on("before_agent_start", async (_event, ctx) => {
		const memoryBankPrompt = buildMemoryBankPrompt(ctx.cwd);

		if (planReviseMode && pendingPlanContent) {
			return {
				message: {
					customType: "plan-revise-context",
					content: `${PLAN_REVISE_SYSTEM_PROMPT}${memoryBankPrompt}\n\n## Current Plan: ${pendingPlanTitle}\n\n${pendingPlanContent}`,
					display: false,
				},
			};
		}

		if (planAmendMode && pendingPlanContent) {
			return {
				message: {
					customType: "plan-amend-context",
					content: `${PLAN_AMEND_SYSTEM_PROMPT}${memoryBankPrompt}\n\n## Current Plan Status\n\n${pendingPlanContent}`,
					display: false,
				},
			};
		}

		if (planModeEnabled) {
			const customTemplate = loadCustomTemplate(ctx.cwd);
			const templateNote = customTemplate
				? `\n\n## Custom Plan Template\n\nThis project has a custom plan template at \`.pi/plan-template.md\`. Use that format when writing plans with plan_write.\n\n${customTemplate}`
				: "";

			return {
				message: {
					customType: "plan-mode-context",
					content: `${PLAN_MODE_SYSTEM_PROMPT}${memoryBankPrompt}${templateNote}`,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => t.status !== "done");
			const todoList = remaining
				.map((t) => {
					const statusIcon =
						t.status === "in_progress"
							? "⟳"
							: t.status === "skipped"
								? "⏭"
								: t.status === "failed"
									? "✗"
									: "○";
					return `${statusIcon} ${t.step}. ${t.text}`;
				})
				.join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `${EXECUTION_MODE_PROMPT}\n\nRemaining steps:\n${todoList}`,
					display: false,
				},
			};
		}
	});

	// ── Event: Track Status Markers ─────────────────────────────────────

	pi.on("turn_end", async (event, ctx) => {
		if (!executionMode || todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		let changed = false;
		// Support new status tags (DONE, SKIP, FAIL, START)
		if (updateStepStatus(text, todoItems) > 0) {
			changed = true;
		}
		// Legacy [DONE:n] support
		if (markCompletedSteps(text, todoItems) > 0) {
			changed = true;
		}
		if (changed) {
			updateUI(ctx);
		}
		persistState();
	});

	// ── Event: Plan Completion & Next Actions ───────────────────────────

	pi.on("agent_end", async (event, ctx) => {
		// Clear revise/amend modes after the agent has processed them
		if (planReviseMode || planAmendMode) {
			planReviseMode = false;
			planAmendMode = false;
			pendingPlanContent = "";
			pendingPlanTitle = "";
			updateUI(ctx);
			persistState();
		}

		// Check if execution is complete
		if (executionMode && todoItems.length > 0) {
			const allDone = todoItems.every((t) => t.status === "done");
			if (allDone) {
				const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{
						customType: "plan-complete",
						content: `**Plan Complete!** ✓\n\n${completedList}`,
						display: true,
					},
					{ triggerTurn: false },
				);
				executionMode = false;
				todoItems = [];
				pi.setActiveTools(NORMAL_MODE_TOOLS);
				updateUI(ctx);
				persistState();
				return;
			}

			// Partial completion — check if we're at a pause point
			const lastAssistant = [...event.messages]
				.reverse()
				.find(isAssistantMessage);
			if (lastAssistant) {
				const text = getTextContent(lastAssistant);
				if (text.includes("⏸") || text.includes("PAUSE")) {
					pi.sendMessage(
						{
							customType: "plan-pause",
							content:
								"⏸️ **Pause point reached.** Review the completed phase before continuing.",
							display: true,
						},
						{ triggerTurn: false },
					);
				}
			}
			return;
		}

		if (!planModeEnabled || !ctx.hasUI) return;

		// Extract plan steps from the last assistant message
		const lastAssistant = [...event.messages]
			.reverse()
			.find(isAssistantMessage);
		if (lastAssistant) {
			const text = getTextContent(lastAssistant);
			const extracted = extractTodosFromPlan(text);
			if (extracted.length > 0) {
				todoItems = extracted;
				updateUI(ctx);
				persistState();
			}
		}

		// Show plan steps if extracted
		if (todoItems.length > 0) {
			const todoListText = todoItems
				.map((t, i) => `${i + 1}. ○ ${t.text}`)
				.join("\n");
			pi.sendMessage(
				{
					customType: "plan-todo-list",
					content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`,
					display: true,
				},
				{ triggerTurn: false },
			);
		}
	});

	// ── Event: Restore State on Session Start ───────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		// Check --plan flag
		if (pi.getFlag("plan") === true && !planModeEnabled) {
			planModeEnabled = true;
		}

		// Restore persisted state
		const entries = ctx.sessionManager.getEntries();
		const planModeEntry = entries
			.filter(
				(e: { type: string; customType?: string }) =>
					e.type === "custom" && e.customType === "plan-mode-v2",
			)
			.pop() as
			| {
					data?: {
						enabled: boolean;
						todos?: TodoItem[];
						executing?: boolean;
						revising?: boolean;
						amending?: boolean;
						pendingPlanContent?: string;
						pendingPlanTitle?: string;
					};
			  }
			| undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			todoItems = planModeEntry.data.todos ?? todoItems;
			executionMode = planModeEntry.data.executing ?? executionMode;
			planReviseMode = planModeEntry.data.revising ?? false;
			planAmendMode = planModeEntry.data.amending ?? false;
			pendingPlanContent = planModeEntry.data.pendingPlanContent ?? "";
			pendingPlanTitle = planModeEntry.data.pendingPlanTitle ?? "";
		}

		// On resume, re-scan messages for status markers
		const isResume = planModeEntry !== undefined;
		if (isResume && executionMode && todoItems.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (
					entry.type === "message" &&
					"message" in entry &&
					isAssistantMessage(entry.message as AgentMessage)
				) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			updateStepStatus(allText, todoItems);
			// Legacy [DONE:n] support
			markCompletedSteps(allText, todoItems);
		}

		// Apply tool restrictions
		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
		}
		updateUI(ctx);
	});

	// ── Event: Filter Stale Plan Context ────────────────────────────────

	pi.on("context", async (event) => {
		if (planModeEnabled || executionMode || planReviseMode || planAmendMode)
			return;

		// When not in plan mode, clean up plan-mode context messages
		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (
					msg.customType === "plan-mode-context" ||
					msg.customType === "plan-execution-context" ||
					msg.customType === "plan-revise-context" ||
					msg.customType === "plan-amend-context"
				) {
					return false;
				}
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[Plan Mode ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c) =>
							c.type === "text" &&
							(c as TextContent).text?.includes("[Plan Mode ACTIVE]"),
					);
				}
				return true;
			}),
		};
	});
}
