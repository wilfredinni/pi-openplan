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
} from "@earendil-works/pi-coding-agent";
import { Key, Markdown } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	compressText,
	createPlanFile,
	isCompressibleFile,
	listPlans,
	type PlanMetadata,
	readPlanFile,
	slugify,
	updatePlanStatus,
} from "./plan-files.ts";
import {
	EXECUTION_MODE_PROMPT,
	PLAN_MODE_SYSTEM_PROMPT,
	PLAN_MODE_SYSTEM_PROMPT_BRIEF,
	CONCISENESS_DIRECTIVE,
} from "./prompts.ts";
import {
	TokenMetricsCollector,
	aggregateLifetimeMetrics,
	type TokenMetricsSnapshot,
	formatTokenReport,
	type TokenMetricsSummary,
} from "./token-metrics.ts";
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

interface TodoItem {
	step: number;
	text: string;
	completed: boolean;
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
					completed: false,
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
				completed: false,
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
					items.push({ step: items.length + 1, text, completed: false });
				}
			}
		}
	}

	return items;
}

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
		if (item) item.completed = true;
	}
	return done.length;
}

// ── Extension ──────────────────────────────────────────────────────────

export default function planModeExtension(pi: ExtensionAPI): void {
	// ── State ──────────────────────────────────────────────────────────
	let planModeEnabled = false;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let planModeTurnCount = 0;
	let showTokenOverhead = false;
	let lastTurnOverhead = 0;
	const metrics = new TokenMetricsCollector();

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

	function updateUI(ctx: ExtensionContext): void {
		// Footer status
		if (executionMode && todoItems.length > 0) {
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus(
				"plan-mode",
				ctx.ui.theme.fg("accent", `📋 ${completed}/${todoItems.length}`),
			);
		} else if (planModeEnabled) {
			const overhead = showTokenOverhead && lastTurnOverhead > 0
				? ` · +${lastTurnOverhead}T`
				: "";
			ctx.ui.setStatus(
				"plan-mode",
				ctx.ui.theme.fg("warning", `⏸ plan${overhead}`),
			);
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		// Widget showing plan progress
		if (executionMode && todoItems.length > 0) {
			const lines = todoItems.map((item) => {
				if (item.completed) {
					return (
						ctx.ui.theme.fg("success", "✓ ") +
						ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				return (
					ctx.ui.theme.fg("muted", "○ ") + ctx.ui.theme.fg("accent", item.text)
				);
			});
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
			turnCount: planModeTurnCount,
		});
		// Persist token metrics
		const snapshots = metrics.toSnapshot();
		if (snapshots.length > 0) {
			pi.appendEntry("plan-mode-tokens", snapshots);
		}
	}

	// ── Toggle ──────────────────────────────────────────────────────────

	function enterPlanMode(ctx: ExtensionContext): void {
		planModeEnabled = true;
		executionMode = false;
		planModeTurnCount = 0;
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

	pi.registerCommand("tokens-toggle", {
		description: "Toggle showing per-turn token overhead in the footer status",
		handler: async (_args, ctx) => {
			showTokenOverhead = !showTokenOverhead;
			ctx.ui.notify(
				`Token overhead ${showTokenOverhead ? "shown" : "hidden"} in footer`,
				"info",
			);
			updateUI(ctx);
		},
	});

	pi.registerCommand("compress-context", {
		description:
			"Compress a context file (default: context.md) into caveman-speak to save input tokens. " +
			"Drops filler, articles, pleasantries; preserves code, URLs, file paths. " +
			"Original backed up as {file}.original.md. Only for .md, .txt, .typ files.",
		handler: async (args, ctx) => {
			const filepath = (args?.trim() || "context.md").replace(
				/^~\//,
				os.homedir() + "/",
			);
			const absolutePath = path.isAbsolute(filepath)
				? filepath
				: path.join(ctx.cwd, filepath);

			// Check file exists
			if (!fs.existsSync(absolutePath)) {
				ctx.ui.notify(`File not found: ${absolutePath}`, "error");
				return;
			}

			// Check file is compressible
			if (!isCompressibleFile(absolutePath)) {
				ctx.ui.notify(
					`Skipped: ${absolutePath} is not a compressible file type (.md, .txt, .typ, .tex)`, "warning",
				);
				return;
			}

			// Skip if already a .original.md backup
			if (absolutePath.endsWith(".original.md")) {
				ctx.ui.notify("Skipped: already a backup file (*.original.md)", "warning");
				return;
			}

			try {
				const content = fs.readFileSync(absolutePath, "utf-8");
				const originalSize = content.length;
				const originalTokens = Math.ceil(originalSize / 4);

				const compressed = compressText(content);
				const compressedSize = compressed.length;
				const compressedTokens = Math.ceil(compressedSize / 4);

				// Save backup
				const backupPath = absolutePath.replace(/\.(\w+)$/, ".original.$1");
				fs.writeFileSync(backupPath, content, "utf-8");

				// Overwrite original
				fs.writeFileSync(absolutePath, compressed, "utf-8");

				const saved = originalSize - compressedSize;
				const savedTokens = originalTokens - compressedTokens;
				const pct = originalSize > 0
					? Math.round((saved / originalSize) * 100)
					: 0;

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

		pi.registerCommand("tokens", {
		description: "Show token usage metrics for plan mode",
		handler: async (_args, ctx) => {
			const sessionSummary = metrics.getSummary();

			// Load lifetime metrics from persisted entries
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

			// Send user message to execute the plan (short reference, don't embed full content)
			if (planContent) {
				const planTitle = planContent.match(/^#[\s]+(.+)/m)?.[1] || "Plan";
				metrics.record("plan-content", planContent.length);
				pi.sendUserMessage(
					`Execute plan "${planTitle}" (${planName}). ` +
					`Read full content via plan_read(full:true) if needed. ` +
					`${todoItems.length} phases. Tag [DONE:n], pause at ⏸️ markers.`,
				);
			} else {
				metrics.record("plan-content", 0);
				pi.sendUserMessage(
					"Execute the plan. Mark phases with [DONE:n]. Pause at ⏸️ markers.",
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
			"Ask structured clarifying questions. Supports single-select, multi-select, and custom text. Batch up to 4 questions per call.",
		promptSnippet: "Ask structured clarifying questions",
		promptGuidelines: [
			"Use plan_question instead of asking inline. Batch up to 4 questions, 2-4 options each, headers ≤12 chars.",
		],
		parameters: Type.Object({
			questions: Type.Array(
				Type.Object({
					question: Type.String({
						description: "Question text",
					}),
					header: Type.String({
						description: "Tab label, ≤12 chars",
					}),
					options: Type.Array(
						Type.Object({
							label: Type.String({
								description: "Option label",
							}),
							description: Type.String({
								description: "Option description",
							}),
						}),
						{
							minItems: MIN_OPTIONS,
							maxItems: MAX_OPTIONS,
							description: "2-4 options",
						},
					),
					multiSelect: Type.Optional(
						Type.Boolean({
							description: "Allow multiple selections (default: false)",
						}),
					),
					custom: Type.Optional(
						Type.Boolean({
							description: "Allow free-text answer (default: true)",
						}),
					),
				}),
				{
					minItems: 1,
					maxItems: MAX_QUESTIONS,
					description: "1-4 questions",
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

				const answersResponse = result
					.map((answers, i) => {
						const header = input.questions[i]?.header ?? `Q${i + 1}`;
						return `${header}: ${answers.length > 0 ? answers.join(", ") : "(no preference)"}`;
					})
					.join("\n");
				metrics.record("tool-response", answersResponse.length);
				return {
					content: [
						{
							type: "text",
							text: `User answers received:\n${answersResponse}`,
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

			const nonInteractiveResponse = `This terminal does not support interactive questions. Make reasonable assumptions based on the context:\n\n${questionText}`;
			metrics.record("tool-response", nonInteractiveResponse.length);
			return {
				content: [
					{
						type: "text",
						text: nonInteractiveResponse,
					},
				],
				details: { nonInteractive: true },
			};
		},
	});

	// ── Plan Management Tools ───────────────────────────────────────────

	pi.registerTool({
		name: "plan_write",
		label: "Write Plan",
		description: "Save a plan to .pi/plans/. Auto-formats YAML frontmatter.",
		promptSnippet: "Save a plan to .pi/plans/",
		promptGuidelines: [
			"Use plan_write to persist plans with phases, verification, and ⏸️ pause markers.",
		],
		parameters: Type.Object({
			filename: Type.String({
				description: "Plan filename (e.g. 'add-rate-limiting'). Auto-prefixed with date.",
			}),
			title: Type.String({
				description: "Plan title",
			}),
			content: Type.String({
				description: "Plan content in markdown, with phases and verification steps.",
			}),
			type: Type.Optional(
				Type.String({
					description: "Plan type: feature, fix, refactor, chore (default: feature)",
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

				// Notify that plan was saved (don't re-send full content — LLM already wrote it)
				const planMessageContent = `${titleHeading}${metaLine}\n${cleanBody}`;
				metrics.record("plan-content", planMessageContent.length);
				ctx.ui.notify(
					`Plan saved: ${result.path} (${metadata.type}, ${metadata.status})`,
					"info",
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
		description: "Read a plan from .pi/plans/. Returns full content by default, metadata-only if full:false.",
		promptSnippet: "Read a plan from .pi/plans/",
		parameters: Type.Object({
			filename: Type.String({
				description: "Plan filename or partial name",
			}),
			full: Type.Optional(
				Type.Boolean({
					description: "Return full content (default: true). false = metadata only",
				}),
			),
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
				const full = params.full !== false;
				const planReadResponse = full
					? `# ${plan.metadata.title}\nStatus: ${plan.metadata.status} | Created: ${plan.metadata.created} | Type: ${plan.metadata.type}\n\n${plan.content}`
					: `# ${plan.metadata.title} [${plan.metadata.status}]\n${plan.metadata.type} · ${plan.metadata.created.slice(0, 10)}\n${plan.filename}`;
				metrics.record("tool-response", planReadResponse.length);
				return {
					content: [
						{
							type: "text",
							text: planReadResponse,
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
		name: "plan_list",
		label: "List Plans",
		description: "List saved plans in .pi/plans/. Shows filename, status, title, date. Optionally filter by status.",
		promptSnippet: "List saved plans",
		parameters: Type.Object({
			status: Type.Optional(
				Type.String({
					description: "Filter: draft, approved, in_progress, done",
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
				const planListResponse = `# Saved Plans\n\n${list}`;
				metrics.record("tool-response", planListResponse.length);
				return {
					content: [{ type: "text", text: planListResponse }],
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

	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			planModeTurnCount++;
			// Use brief prompt on 2nd+ turn (progressive disclosure)
			const prompt = planModeTurnCount <= 1
				? PLAN_MODE_SYSTEM_PROMPT
				: PLAN_MODE_SYSTEM_PROMPT_BRIEF;
			metrics.record("system-prompt", prompt.length);
			lastTurnOverhead = Math.ceil(prompt.length / 4);
			return {
				message: {
					customType: "plan-mode-context",
					content: prompt,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			const execContent = `${EXECUTION_MODE_PROMPT}\n\nRemaining steps:\n${todoList}`;
			metrics.record("execution-context", execContent.length);
			return {
				message: {
					customType: "plan-execution-context",
					content: execContent,
					display: false,
				},
			};
		}
	});

	// ── Event: Track [DONE:n] Markers ───────────────────────────────────

	pi.on("turn_end", async (event, ctx) => {
		// Record output tokens from agent responses
		if (isAssistantMessage(event.message)) {
			const text = getTextContent(event.message);
			if (text.length > 0) {
				metrics.recordOutput(text.length);
			}
		}

		if (!executionMode || todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, todoItems) > 0) {
			updateUI(ctx);
		}
		persistState();
	});

	// ── Event: Plan Completion & Next Actions ───────────────────────────

	pi.on("agent_end", async (event, ctx) => {
		// Check if execution is complete
		if (executionMode && todoItems.length > 0) {
			const allDone = todoItems.every((t) => t.completed);
			if (allDone) {
				const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
				const completeContent = `**Plan Complete!** ✓\n\n${completedList}`;
				metrics.record("plan-complete", completeContent.length);
				pi.sendMessage(
					{
						customType: "plan-complete",
						content: completeContent,
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
					const pauseContent =
						"⏸️ **Pause point reached.** Review the completed phase before continuing.";
					metrics.record("plan-pause", pauseContent.length);
					pi.sendMessage(
						{
							customType: "plan-pause",
							content: pauseContent,
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

		// Show plan steps if extracted (skip when TUI widget visible — duplicates progress)
		if (todoItems.length > 0 && !ctx.hasUI) {
			const todoListText = todoItems
				.map((t, i) => `${i + 1}. ○ ${t.text}`)
				.join("\n");
			const todoListContent = `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`;
			metrics.record("plan-todo-list", todoListContent.length);
			pi.sendMessage(
				{
					customType: "plan-todo-list",
					content: todoListContent,
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
						turnCount?: number;
					};
			  }
			| undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			todoItems = planModeEntry.data.todos ?? todoItems;
			executionMode = planModeEntry.data.executing ?? executionMode;
			planModeTurnCount = planModeEntry.data.turnCount ?? 0;
		}

		// Restore token metrics from persisted entries
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
		metrics.fromSnapshots(tokenEntries);

		// On resume, re-scan messages for [DONE:n] markers
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
		if (planModeEnabled || executionMode) return;

		// When not in plan mode, clean up plan-mode context messages
		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (
					msg.customType === "plan-mode-context" ||
					msg.customType === "plan-execution-context"
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
