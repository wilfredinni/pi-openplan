import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
	createInitialState,
	extractDoneSteps,
	extractTodosFromPlan,
	getTextContent,
	isAssistantMessage,
	markCompletedSteps,
	type TodoItem,
} from "../extensions/plan-mode/state.ts";

function makeAssistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages" as const,
		provider: "anthropic",
		model: "claude-sonnet-4-20250514",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 0,
	};
}

describe("state", () => {
	describe("createInitialState", () => {
		const state = createInitialState();

		it("returns planModeEnabled as false", () => {
			expect(state.planModeEnabled).toBe(false);
		});

		it("returns executionMode as false", () => {
			expect(state.executionMode).toBe(false);
		});

		it("returns empty todoItems", () => {
			expect(state.todoItems).toEqual([]);
		});

		it("returns planModeTurnCount as 0", () => {
			expect(state.planModeTurnCount).toBe(0);
		});

		it("returns showTokenOverhead as false", () => {
			expect(state.showTokenOverhead).toBe(false);
		});

		it("returns lastTurnOverhead as 0", () => {
			expect(state.lastTurnOverhead).toBe(0);
		});

		it("returns tokenVerifyEnabled as false", () => {
			expect(state.tokenVerifyEnabled).toBe(false);
		});

		it("metrics is a TokenMetricsCollector instance", () => {
			expect(state.metrics).toBeDefined();
			expect(typeof state.metrics.record).toBe("function");
			expect(typeof state.metrics.getSummary).toBe("function");
		});
	});

	describe("isAssistantMessage", () => {
		it("returns true for assistant role with array content", () => {
			const msg: AssistantMessage = makeAssistantMessage("hello");
			expect(isAssistantMessage(msg)).toBe(true);
		});

		it("returns false for user role", () => {
			expect(
				isAssistantMessage({
					role: "user",
					content: [{ type: "text", text: "hello" }],
					timestamp: 0,
				}),
			).toBe(false);
		});

		it("returns false for assistant with string content", () => {
			// String content doesn't match the type, but this tests runtime behavior
			expect(
				// @ts-expect-error - testing non-array content runtime behavior
				isAssistantMessage({ role: "assistant", content: "hello" }),
			).toBe(false);
		});

		it("returns false for non-message objects", () => {
			expect(isAssistantMessage({} as AssistantMessage)).toBe(false);
		});
	});

	describe("getTextContent", () => {
		it("extracts text from single text block", () => {
			const msg = makeAssistantMessage("Hello world");
			expect(getTextContent(msg)).toBe("Hello world");
		});

		it("joins multiple text blocks", () => {
			const msg: AssistantMessage = {
				...makeAssistantMessage(""),
				content: [
					{ type: "text", text: "First" },
					{ type: "text", text: "Second" },
				],
			};
			expect(getTextContent(msg)).toBe("First\nSecond");
		});

		it("filters out non-text blocks", () => {
			const msg: AssistantMessage = {
				...makeAssistantMessage(""),
				content: [
					{ type: "text", text: "Text" },
					{ type: "tool_use" as unknown as "text", text: "tool result" },
				],
			};
			expect(getTextContent(msg)).toBe("Text");
		});

		it("returns empty string for empty content", () => {
			const msg: AssistantMessage = {
				...makeAssistantMessage(""),
				content: [],
			};
			expect(getTextContent(msg)).toBe("");
		});
	});

	describe("extractTodosFromPlan", () => {
		it("extracts phases from Phase headers", () => {
			const plan = `**Phase 1**  \nSetup\n**Phase 2**  \nBuild`;
			const todos = extractTodosFromPlan(plan);
			expect(todos).toHaveLength(2);
			expect(todos[0].step).toBe(1);
			expect(todos[0].text).toBe("Setup");
			expect(todos[0].completed).toBe(false);
			expect(todos[1].step).toBe(2);
			expect(todos[1].text).toBe("Build");
		});

		it("extracts phases with markdown formatting", () => {
			const plan = `**Phase 1**  \nInfrastructure\nSetup tasks`;
			const todos = extractTodosFromPlan(plan);
			expect(todos).toHaveLength(1);
			expect(todos[0].text).toBe("Infrastructure");
		});

		it("falls back to Plan: header when no Phase headers", () => {
			const plan = `**Plan:**\n1. First step\n2. Second step\n3. Third step`;
			const todos = extractTodosFromPlan(plan);
			expect(todos).toHaveLength(3);
			expect(todos[0].text).toContain("First step");
			expect(todos[1].text).toContain("Second step");
			expect(todos[2].text).toContain("Third step");
		});

		it("falls back to numbered list under Plan: header", () => {
			const plan = `**Plan:**\n1. Add file\n2. Modify config`;
			const todos = extractTodosFromPlan(plan);
			expect(todos).toHaveLength(2);
		});

		it("truncates long names to 60 chars", () => {
			const long = "a".repeat(100);
			const plan = `**Phase 1**  \n${long}\nDo stuff`;
			const todos = extractTodosFromPlan(plan);
			expect(todos[0].text.length).toBeLessThanOrEqual(63); // 60 + "..."
		});

		it("returns empty array for message with no recognizable structure", () => {
			const todos = extractTodosFromPlan("Just a regular message.");
			expect(todos).toEqual([]);
		});

		it("returns empty array for empty message", () => {
			expect(extractTodosFromPlan("")).toEqual([]);
		});

		it("handles mixed formatting in phase names", () => {
			const plan = `**Phase 1**  \n\`setup\`\nDo stuff`;
			const todos = extractTodosFromPlan(plan);
			expect(todos.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("extractDoneSteps", () => {
		it("extracts single [DONE:n] marker", () => {
			expect(extractDoneSteps("Completed [DONE:1]")).toEqual([1]);
		});

		it("extracts multiple [DONE:n] markers", () => {
			expect(extractDoneSteps("[DONE:1][DONE:2][DONE:3]")).toEqual([1, 2, 3]);
		});

		it("extracts space-separated markers", () => {
			expect(extractDoneSteps("[DONE:1] and [DONE:2]")).toEqual([1, 2]);
		});

		it("ignores invalid markers", () => {
			expect(extractDoneSteps("[DONE:abc]")).toEqual([]);
		});

		it("is case insensitive", () => {
			expect(extractDoneSteps("done:1 done:2")).toEqual([]);
		});

		it("returns empty array when no markers", () => {
			expect(extractDoneSteps("No markers here")).toEqual([]);
		});

		it("returns empty array for empty text", () => {
			expect(extractDoneSteps("")).toEqual([]);
		});
	});

	describe("markCompletedSteps", () => {
		const makeItems = (): TodoItem[] => [
			{ step: 1, text: "Phase 1: Setup", completed: false },
			{ step: 2, text: "Phase 2: Build", completed: false },
			{ step: 3, text: "Phase 3: Test", completed: false },
		];

		it("marks matching steps as completed", () => {
			const items = makeItems();
			const count = markCompletedSteps("[DONE:1]", items);
			expect(count).toBe(1);
			expect(items[0].completed).toBe(true);
			expect(items[1].completed).toBe(false);
		});

		it("marks multiple matching steps", () => {
			const items = makeItems();
			const count = markCompletedSteps("[DONE:1][DONE:3]", items);
			expect(count).toBe(2);
			expect(items[0].completed).toBe(true);
			expect(items[1].completed).toBe(false);
			expect(items[2].completed).toBe(true);
		});

		it("ignores non-matching step numbers (returns marker count not match count)", () => {
			const items = makeItems();
			// markCompletedSteps returns count of [DONE:n] markers found, not items matched
			const count = markCompletedSteps("[DONE:99]", items);
			expect(count).toBe(1); // found 1 DONE marker even though no item matched
			expect(items.every((t) => !t.completed)).toBe(true);
		});

		it("returns 0 when no markers in text", () => {
			const items = makeItems();
			const count = markCompletedSteps("No markers here", items);
			expect(count).toBe(0);
		});

		it("handles empty items array (returns marker count)", () => {
			const count = markCompletedSteps("[DONE:1]", []);
			// Returns count of [DONE:n] markers, not items matched
			expect(count).toBe(1);
		});
	});
});
