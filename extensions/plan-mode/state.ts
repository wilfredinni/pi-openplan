/**
 * Shared state, types, and utilities for the plan-mode extension.
 *
 * All mutable state lives in PlanModeState. Modules mutate it directly.
 * PlanModeCallbacks bundles UI/persistence functions modules call into.
 * No circular imports — state.ts imports nothing from sibling modules.
 */

import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
// ── Shared Types ─────────────────────────────────────────────────────────

/** Entry shape for ctx.sessionManager.getEntries() — reused across events. */
export interface PlanModeEntry {
	type: string;
	customType?: string;
}

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
	"plan_edit",
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
	};
}

// ── Message Helpers ─────────────────────────────────────────────────────

// Minimal shape that both AgentMessage and AssistantMessage satisfy
// (avoids cross-package type narrowing issues)
interface MessageLike {
	role: string;
	content?: unknown;
}

export function isAssistantMessage(m: MessageLike): m is AssistantMessage {
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

	// Pre-filter: strip fenced code blocks, inline code, and blockquotes
	// to prevent false matches on technical discussion, bug reports, etc.
	const cleanMessage = message
		.replace(/```[\s\S]*?```/g, "") // fenced code blocks
		.replace(/`[^`]+`/g, "") // inline code
		.split("\n")
		.filter((line) => !/^\s*>/.test(line)) // blockquotes
		.join("\n");

	/** Truncate to 60 chars, appending "..." if shortened. */
	const truncate = (t: string): string =>
		t.length > 60 ? `${t.slice(0, 57)}...` : t;

	// Primary: extract phase headers (Phase N, Step N, Part N)
	// Allow optional newline between the heading and the name line.
	const phasePattern =
		/(?:#{1,6}[^\S\n]*)?\*{0,2}(?:Phase|Step|Part)[^\S\n]+(\d+)\*{0,2}[:*-]?[^\S\n]*\n?[^\S\n]*([^\n]+)/gi;
	for (const match of cleanMessage.matchAll(phasePattern)) {
		const num = parseInt(match[1], 10);
		const name = match[2].trim();
		if (name.length > 3) {
			items.push({
				step: num,
				text: truncate(name),
				completed: false,
			});
		}
	}

	// If phases found, return them (skip fallbacks)
	if (items.length > 0) return items;

	// Fallback 1: "Plan:" header with numbered list
	const planMatch = cleanMessage.match(/\*{0,2}Plan:\*{0,2}[ \t]*\n/i);
	if (planMatch) {
		const planSection = cleanMessage.slice(
			cleanMessage.indexOf(planMatch[0]) + planMatch[0].length,
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
					text: truncate(text),
					completed: false,
				});
			}
		}
		return items;
	}

	// Fallback 2: Any numbered list under Changes/Implementation/Approach/Tasks/Steps
	const changesMatch = cleanMessage.match(
		/(?:###?\s*)?(?:Changes|Implementation|Approach|Tasks|Steps)[:*]?\s*\n/i,
	);
	if (changesMatch) {
		const section = cleanMessage.slice(
			cleanMessage.indexOf(changesMatch[0]) + changesMatch[0].length,
		);
		const numPattern = /^\s*(\d+)[.)]\s+([^\n]+)/gm;
		for (const match of section.matchAll(numPattern)) {
			const text = match[2].trim();
			if (text.length > 3) {
				items.push({
					step: items.length + 1,
					text: truncate(text),
					completed: false,
				});
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

/**
 * Mark todo items as completed based on [DONE:n] markers in text.
 * Mutates `items` in-place — callers must handle persistence separately.
 * Returns the number of newly matched done steps.
 */
export function markCompletedSteps(text: string, items: TodoItem[]): number {
	const done = extractDoneSteps(text);
	for (const step of done) {
		const item = items.find((t) => t.step === step);
		if (item) item.completed = true;
	}
	return done.length;
}
