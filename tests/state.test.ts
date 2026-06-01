import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
	createInitialState,
	extractDoneSteps,
	extractTodosFromPlan,
	getTextContent,
	isAssistantMessage,
	markCompletedSteps,
} from "../extensions/plan-mode/state.ts";

function makeAssistant(content: unknown[]): AssistantMessage {
	return {
		role: "assistant",
		content: content as AssistantMessage["content"],
		api: "test" as AssistantMessage["api"],
		provider: "test" as AssistantMessage["provider"],
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

describe("state", () => {
	describe("createInitialState", () => {
		it("returns default state", () => {
			const state = createInitialState();
			expect(state.planModeEnabled).toBe(false);
			expect(state.executionMode).toBe(false);
			expect(state.todoItems).toEqual([]);
			expect(state.planModeTurnCount).toBe(0);
		});
	});

	describe("isAssistantMessage", () => {
		it("returns true for assistant role with array content", () => {
			expect(isAssistantMessage(makeAssistant([]))).toBe(true);
		});

		it("returns false for user role", () => {
			expect(
				isAssistantMessage({
					role: "user",
					content: [],
				} as unknown as AssistantMessage),
			).toBe(false);
		});

		it("returns false for assistant with string content", () => {
			expect(
				isAssistantMessage({
					role: "assistant",
					content: "text",
				} as unknown as AssistantMessage),
			).toBe(false);
		});

		it("returns false for missing role", () => {
			expect(
				isAssistantMessage({ content: [] } as unknown as AssistantMessage),
			).toBe(false);
		});

		it("returns false for missing content", () => {
			const msg = {
				role: "assistant" as const,
				api: "test" as AssistantMessage["api"],
				provider: "test" as AssistantMessage["provider"],
				model: "test",
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: Date.now(),
			} as AssistantMessage;
			expect(isAssistantMessage(msg)).toBe(false);
		});
	});

	describe("getTextContent", () => {
		it("extracts single text block", () => {
			const msg = makeAssistant([
				{ type: "text" as const, text: "hello" } as TextContent,
			]);
			expect(getTextContent(msg)).toBe("hello");
		});

		it("joins multiple text blocks with newline", () => {
			const msg = makeAssistant([
				{ type: "text" as const, text: "hello" } as TextContent,
				{ type: "text" as const, text: "world" } as TextContent,
			]);
			expect(getTextContent(msg)).toBe("hello\nworld");
		});

		it("filters out non-text blocks", () => {
			const msg = makeAssistant([
				{ type: "text" as const, text: "hello" } as TextContent,
				{ type: "tool_use" as const, id: "x", name: "x", input: {} },
				{ type: "text" as const, text: "world" } as TextContent,
			] as AssistantMessage["content"]);
			expect(getTextContent(msg)).toBe("hello\nworld");
		});

		it("returns empty string for empty content array", () => {
			const msg = makeAssistant([]);
			expect(getTextContent(msg)).toBe("");
		});
	});

	describe("extractTodosFromPlan", () => {
		it("extracts Phase 1 with newline after colon", () => {
			const plan = "## Phase 1:\nSetup\nDo the thing.";
			const todos = extractTodosFromPlan(plan);
			expect(todos).toHaveLength(1);
			expect(todos[0].step).toBe(1);
			expect(todos[0].text).toBe("Setup");
			expect(todos[0].completed).toBe(false);
		});

		it("extracts multiple phases", () => {
			const plan =
				"## Phase 1:\nSetup\n## Phase 2:\nBuild\n## Phase 3:\nDeploy";
			const todos = extractTodosFromPlan(plan);
			expect(todos).toHaveLength(3);
			expect(todos[0].text).toBe("Setup");
			expect(todos[1].text).toBe("Build");
			expect(todos[2].text).toBe("Deploy");
		});

		it("handles ### Phase 1: headers", () => {
			const plan = "### Phase 1:\nSetup\nContent";
			const todos = extractTodosFromPlan(plan);
			expect(todos).toHaveLength(1);
			expect(todos[0].text).toBe("Setup");
		});

		it("uses Plan: fallback when no Phase headers", () => {
			const plan = "**Plan:**\n1. First step\n2. Second step";
			const todos = extractTodosFromPlan(plan);
			expect(todos).toHaveLength(2);
			expect(todos[0].text).toBe("First step");
			expect(todos[1].text).toBe("Second step");
		});

		it("returns empty array when no Phase or Plan headers exist", () => {
			const plan = "Just some text without any structure.";
			expect(extractTodosFromPlan(plan)).toEqual([]);
		});

		it("truncates long phase names to 60 chars", () => {
			const longName = "A".repeat(100);
			const plan = `## Phase 1:\n${longName}`;
			const todos = extractTodosFromPlan(plan);
			expect(todos[0].text.length).toBeLessThanOrEqual(60);
			expect(todos[0].text).toMatch(/\.\.\.$/);
		});

		it("skips phase names <= 3 chars", () => {
			const plan = "## Phase 1:\nAB";
			const todos = extractTodosFromPlan(plan);
			expect(todos).toHaveLength(0);
		});

		it("handles parenthesized step numbers (1) pattern)", () => {
			const plan = "**Plan:**\n1) First step\n2) Second step";
			const todos = extractTodosFromPlan(plan);
			expect(todos).toHaveLength(2);
		});
	});

	describe("extractDoneSteps", () => {
		it("extracts single DONE marker", () => {
			expect(extractDoneSteps("[DONE:1]")).toEqual([1]);
		});

		it("extracts multiple DONE markers", () => {
			expect(extractDoneSteps("[DONE:1][DONE:2]")).toEqual([1, 2]);
		});

		it("handles lowercase done markers", () => {
			expect(extractDoneSteps("[done:3]")).toEqual([3]);
		});

		it("handles mixed case", () => {
			expect(extractDoneSteps("[Done:4]")).toEqual([4]);
		});

		it("ignores invalid DONE markers with non-numeric", () => {
			expect(extractDoneSteps("[DONE:abc]")).toEqual([]);
		});

		it("ignores DONE markers with empty value", () => {
			expect(extractDoneSteps("[DONE:]")).toEqual([]);
		});

		it("ignores negative step numbers", () => {
			expect(extractDoneSteps("[DONE:-1]")).toEqual([]);
		});

		it("returns empty array for no matches", () => {
			expect(extractDoneSteps("just some text")).toEqual([]);
		});
	});

	describe("markCompletedSteps", () => {
		it("marks matching item completed", () => {
			const items = [{ step: 1, text: "Setup", completed: false }];
			const count = markCompletedSteps("[DONE:1]", items);
			expect(count).toBe(1);
			expect(items[0].completed).toBe(true);
		});

		it("marks non-matching step without affecting existing items", () => {
			const items = [{ step: 1, text: "Setup", completed: false }];
			const count = markCompletedSteps("[DONE:2]", items);
			expect(count).toBe(1);
			expect(items[0].completed).toBe(false);
		});

		it("marks multiple steps from one message", () => {
			const items = [
				{ step: 1, text: "Setup", completed: false },
				{ step: 2, text: "Build", completed: false },
			];
			const count = markCompletedSteps("[DONE:1][DONE:2]", items);
			expect(count).toBe(2);
			expect(items[0].completed).toBe(true);
			expect(items[1].completed).toBe(true);
		});

		it("handles empty todoItems array", () => {
			const count = markCompletedSteps("[DONE:1]", []);
			expect(count).toBe(1);
		});
	});
});
