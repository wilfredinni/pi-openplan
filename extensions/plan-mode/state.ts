/**
 * Shared state, types, and utilities for the plan-mode extension.
 *
 * All mutable state lives in PlanModeState. Modules mutate it directly.
 * PlanModeCallbacks bundles UI/persistence functions modules call into.
 * No circular imports — state.ts imports nothing from sibling modules.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
// ── Tool Sets ───────────────────────────────────────────────────────────

/** Tools allowed in plan mode (read-only + plan management) */
export const PLAN_MODE_TOOLS = [
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
export const NORMAL_MODE_TOOLS = [...PLAN_MODE_TOOLS, "edit", "write"];

// ── Todo Item ───────────────────────────────────────────────────────────

export interface TodoItem {
	step: number;
	text: string;
	completed: boolean;
}

// ── Shared State ────────────────────────────────────────────────────────

export interface PlanModeState {
	planModeEnabled: boolean;
	executionMode: boolean;
	todoItems: TodoItem[];
	planModeTurnCount: number;
}

// ── Callbacks (UI / persistence) ────────────────────────────────────────

export interface PlanModeCallbacks {
	updateUI(ctx: ExtensionContext): void;
	persistState(): void;
	togglePlanMode(ctx: ExtensionContext): void;
	enterPlanMode(ctx: ExtensionContext): void;
	exitPlanMode(ctx: ExtensionContext): void;
}

// ── State Factory ───────────────────────────────────────────────────────

export function createInitialState(): PlanModeState {
	return {
		planModeEnabled: false,
		executionMode: false,
		todoItems: [],
		planModeTurnCount: 0,
	};
}

// ── Message Helpers ─────────────────────────────────────────────────────

export function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

export function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

// ── Todo Extraction ─────────────────────────────────────────────────────

export function extractTodosFromPlan(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	const headerMatch = message.match(/\*{0,2}Phase\s+\d+\*{0,2}[*:-]?\s*\n/i);
	if (!headerMatch) {
		// Fallback: look for "Plan:" header
		const planMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
		if (!planMatch) return items;

		const planSection = message.slice(
			message.indexOf(planMatch[0]) + planMatch[0].length,
		);
		const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^\n]+)/gm;
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
		/(?:###?\s*)?\*{0,2}Phase\s+(\d+)\*{0,2}[*:-]?\s*([^\n]+)/gi;
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

export function extractDoneSteps(text: string): number[] {
	const steps: number[] = [];
	for (const match of text.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
	const done = extractDoneSteps(text);
	for (const step of done) {
		const item = items.find((t) => t.step === step);
		if (item) item.completed = true;
	}
	return done.length;
}
