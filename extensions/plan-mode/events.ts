/**
 * Event handler registrations for plan-mode extension.
 *
 * Exports registerEvents() factory that registers all 6 event handlers:
 * tool_call (bash safety), before_agent_start (prompts), turn_end (DONE tracking),
 * agent_end (completion/pause), session_start (restore), context (filter stale).
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "./bash-safety.ts";
import {
	EXECUTION_MODE_SYSTEM_APPEND,
	PLAN_MODE_SYSTEM_APPEND,
} from "./prompts.ts";
import type {
	PlanModeCallbacks,
	PlanModeEntry,
	PlanModeState,
} from "./state.ts";
import {
	extractTodosFromPlan,
	getTextContent,
	isAssistantMessage,
	markCompletedSteps,
	NORMAL_MODE_TOOLS,
	PLAN_MODE_TOOLS,
	type TodoItem,
} from "./state.ts";
export function registerEvents(
	pi: ExtensionAPI,
	state: PlanModeState,
	callbacks: PlanModeCallbacks,
): void {
	// ── Block Dangerous Operations in Plan Mode ─────────────────────────

	pi.on("tool_call", async (event) => {
		if (!state.planModeEnabled) return;

		// ── Block ctx_execute / ctx_execute_file with shell language ──
		if (
			event.toolName === "ctx_execute" ||
			event.toolName === "ctx_execute_file"
		) {
			const inputObj =
				event.input && typeof event.input === "object"
					? (event.input as Record<string, unknown>)
					: null;
			const language =
				inputObj && typeof inputObj.language === "string"
					? inputObj.language
					: "";
			if (language === "shell") {
				return {
					block: true,
					reason:
						`Plan mode: ctx_execute with shell language blocked.\n` +
						`Shell commands bypass plan-mode safety checks.\n` +
						`To run: exit plan mode first with /plan, then re-run.\n` +
						`Non-shell languages (javascript, python, typescript) are allowed.`,
				};
			}
			return; // non-shell ctx_execute allowed
		}

		// ── Block Dangerous Bash ──
		if (event.toolName !== "bash") return;
		if (!event.input || typeof event.input !== "object") return;

		const inputObj = event.input as Record<string, unknown>;
		if (typeof inputObj.command !== "string") return;

		const command = inputObj.command;
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

	// ── Inject System Prompts ───────────────────────────────────────────

	pi.on("before_agent_start", async (event) => {
		if (state.planModeEnabled) {
			return {
				systemPrompt: event.systemPrompt + PLAN_MODE_SYSTEM_APPEND,
			};
		}

		if (state.executionMode) {
			return {
				systemPrompt: event.systemPrompt + EXECUTION_MODE_SYSTEM_APPEND,
			};
		}
	});

	// ── Track [DONE:n] Markers ──────────────────────────────────────────

	pi.on("turn_end", async (event, ctx) => {
		if (!event.message) return;
		if (!state.executionMode || state.todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, state.todoItems) > 0) {
			callbacks.updateUI(ctx);
		}
		callbacks.persistState();
	});

	// ── Plan Completion & Next Actions ──────────────────────────────────

	pi.on("agent_end", async (event, ctx) => {
		if (!event.messages) return;

		// Find last assistant message once (reused by execution + plan paths)
		const lastAssistant = [...event.messages]
			.reverse()
			.find(isAssistantMessage);

		// Check if execution is complete
		if (state.executionMode && state.todoItems.length > 0) {
			const allDone = state.todoItems.every((t) => t.completed);
			if (allDone) {
				const completedList = state.todoItems
					.map((t) => `~~${t.text}~~`)
					.join("\n");
				const completeContent = `**Plan Complete!** ✓\n\n${completedList}`;
				pi.sendMessage(
					{
						customType: "plan-complete",
						content: completeContent,
						display: true,
					},
					{ deliverAs: "nextTurn" },
				);
				state.executionMode = false;
				state.todoItems = [];
				pi.setActiveTools(NORMAL_MODE_TOOLS);
				callbacks.updateUI(ctx);
				callbacks.persistState();
				return;
			}

			// Partial completion — check if we're at a pause point
			if (lastAssistant) {
				const text = getTextContent(lastAssistant);
				if (text.includes("⏸") || text.includes("PAUSE")) {
					const pauseContent =
						"⏸️ **Pause point reached.** Review the completed phase before continuing.";
					pi.sendMessage(
						{
							customType: "plan-pause",
							content: pauseContent,
							display: true,
						},
						{ deliverAs: "nextTurn" },
					);
				}
			}
			return;
		}

		if (!state.planModeEnabled || !ctx.hasUI) return;

		// Extract plan steps from the last assistant message
		if (lastAssistant) {
			const text = getTextContent(lastAssistant);
			const extracted = extractTodosFromPlan(text);
			if (extracted.length > 0) {
				state.todoItems = extracted;
				callbacks.updateUI(ctx);
				callbacks.persistState();
			}
		}

		// Show plan steps if extracted
		if (state.todoItems.length > 0) {
			const todoListText = state.todoItems
				.map((t, i) => `${i + 1}. ○ ${t.text}`)
				.join("\n");
			const todoListContent = `**Plan Steps (${state.todoItems.length}):**\n\n${todoListText}`;
			pi.sendMessage(
				{
					customType: "plan-todo-list",
					content: todoListContent,
					display: true,
				},
				{ deliverAs: "nextTurn" },
			);
		}
	});

	// ── Restore State on Session Start ──────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		// Check --plan flag
		if (pi.getFlag("plan") === true && !state.planModeEnabled) {
			state.planModeEnabled = true;
		}

		// Restore persisted state
		const entries = ctx.sessionManager.getEntries();
		const planModeEntry = entries
			.filter(
				(e: PlanModeEntry) =>
					e.type === "custom" && e.customType === "plan-mode-v2",
			)
			.pop() as unknown as
			| {
					data?: {
						enabled: boolean;
						todos?: TodoItem[];
						executing?: boolean;
					};
			  }
			| undefined;

		if (planModeEntry?.data) {
			state.planModeEnabled =
				planModeEntry.data.enabled ?? state.planModeEnabled;
			state.todoItems = planModeEntry.data.todos ?? state.todoItems;
			state.executionMode = planModeEntry.data.executing ?? state.executionMode;
		}

		// On resume, re-scan messages for [DONE:n] markers
		const isResume = planModeEntry !== undefined;
		if (isResume && state.executionMode && state.todoItems.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as unknown as PlanModeEntry;
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			// Guard: only scan messages after the execute marker was found.
			// Without a marker, scanning from index 0 picks up stale [DONE:n]
			// markers from unrelated conversations.
			if (executeIndex >= 0) {
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
				markCompletedSteps(allText, state.todoItems);
			}
		}

		// Apply tool restrictions
		if (state.planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
		} else if (state.executionMode) {
			pi.setActiveTools(NORMAL_MODE_TOOLS);
		}
		callbacks.updateUI(ctx);
	});

	// ── Filter / Deduplicate Plan Context ───────────────────────────────

	pi.on("context", async (event) => {
		// Strip stale plan-mode custom messages (legacy — instructions now
		// live in stable systemPrompt blocks, not per-turn transcript messages).
		// Also strip [Plan Mode ACTIVE] user-message markers.
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
