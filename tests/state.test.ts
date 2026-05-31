import { describe, expect, it } from "vitest";
import {
	createInitialState,
	extractDoneSteps,
	extractTodosFromPlan,
	getTextContent,
	isAssistantMessage,
	markCompletedSteps,
} from "../extensions/plan-mode/state.ts";

describe("createInitialState", () => {
	it("returns plan mode disabled", () => {
		const state = createInitialState();
		expect(state.planModeEnabled).toBe(false);
	});

	it("returns execution mode disabled", () => {
		const state = createInitialState();
		expect(state.executionMode).toBe(false);
	});

	it("returns empty todoItems", () => {
		const state = createInitialState();
		expect(state.todoItems).toEqual([]);
	});

	it("returns turnCount 0", () => {
		const state = createInitialState();
		expect(state.planModeTurnCount).toBe(0);
	});
});

describe("isAssistantMessage", () => {
	it("returns true for assistant message with array content", () => {
		const msg = { role: "assistant", content: [] };
		expect(isAssistantMessage(msg)).toBe(true);
	});

	it("returns false for user message", () => {
		const msg = { role: "user", content: "hello" };
		expect(isAssistantMessage(msg)).toBe(false);
	});

	it("returns false for non-array content", () => {
		const msg = { role: "assistant", content: "string content" };
		expect(isAssistantMessage(msg)).toBe(false);
	});

	it("returns false for tool message", () => {
		const msg = { role: "tool", content: [] };
		expect(isAssistantMessage(msg)).toBe(false);
	});

	it("throws on null message", () => {
		expect(() =>
			isAssistantMessage(null as unknown as { role: string; content: unknown }),
		).toThrow();
	});
});

describe("getTextContent", () => {
	it("extracts text from single text block", () => {
		const msg = {
			role: "assistant",
			content: [{ type: "text", text: "Hello world" }],
		};
		expect(getTextContent(msg)).toBe("Hello world");
	});

	it("joins multiple text blocks with newline", () => {
		const msg = {
			role: "assistant",
			content: [
				{ type: "text", text: "Line 1" },
				{ type: "text", text: "Line 2" },
			],
		};
		expect(getTextContent(msg)).toBe("Line 1\nLine 2");
	});

	it("filters out non-text blocks", () => {
		const msg = {
			role: "assistant",
			content: [
				{ type: "text", text: "Text only" },
				{ type: "tool_use", id: "1", name: "read", input: {} },
			],
		};
		expect(getTextContent(msg)).toBe("Text only");
	});

	it("returns empty string for no text blocks", () => {
		const msg = {
			role: "assistant",
			content: [{ type: "tool_use", id: "1", name: "read", input: {} }],
		};
		expect(getTextContent(msg)).toBe("");
	});

	it("returns empty string for empty content", () => {
		const msg = { role: "assistant", content: [] };
		expect(getTextContent(msg)).toBe("");
	});
});

describe("extractTodosFromPlan", () => {
	it("extracts phases with **Phase N** on its own line, name on next", () => {
		const plan = "# Plan\n\n**Phase 1**\nSetup app\n\n**Phase 2**\nBuild tests";
		const todos = extractTodosFromPlan(plan);
		expect(todos).toHaveLength(2);
		expect(todos[0].step).toBe(1);
		expect(todos[0].text).toBe("Setup app");
		expect(todos[0].completed).toBe(false);
		expect(todos[1].step).toBe(2);
		expect(todos[1].text).toBe("Build tests");
	});

	it("extracts phases with colon then newline immediately", () => {
		const plan = "# Plan\n\nPhase 1:\nInit\n\nPhase 2:\nDeploy";
		const todos = extractTodosFromPlan(plan);
		expect(todos).toHaveLength(2);
		expect(todos[0].step).toBe(1);
		expect(todos[0].text).toBe("Init");
		expect(todos[1].step).toBe(2);
		expect(todos[1].text).toBe("Deploy");
	});

	it("truncates long phase names to 60 chars", () => {
		const longName = "A".repeat(100);
		const plan = `# Plan\n\n**Phase 1**\n${longName}`;
		const todos = extractTodosFromPlan(plan);
		expect(todos).toHaveLength(1);
		expect(todos[0].text).toBe(`${"A".repeat(57)}...`);
	});

	it("returns empty array when no phases found", () => {
		const plan = "Just some text without any phase markers.";
		const todos = extractTodosFromPlan(plan);
		expect(todos).toEqual([]);
	});

	it("returns empty array for empty string", () => {
		expect(extractTodosFromPlan("")).toEqual([]);
	});

	it("extracts numbered list from Plan: section as fallback", () => {
		const plan = "## Plan:\n1. First item\n2. Second item\n3. Third item";
		const todos = extractTodosFromPlan(plan);
		expect(todos).toHaveLength(3);
		expect(todos[0].text).toBe("First item");
		expect(todos[1].text).toBe("Second item");
		expect(todos[2].text).toBe("Third item");
	});

	it("returns empty for Changes section without Phase headers", () => {
		const plan = "## Changes:\n1. Change one\n2. Change two";
		const todos = extractTodosFromPlan(plan);
		expect(todos).toHaveLength(0);
	});

	it("filters out items with length <= 3 in Plan: fallback", () => {
		const plan = "## Plan:\n1. ab\n2. def";
		const todos = extractTodosFromPlan(plan);
		expect(todos).toHaveLength(0);
	});

	it("returns empty for **Phase with ** on same line (headerMatch fails)", () => {
		const plan = "# Plan\n\n**Phase 1** **Setup**\n\n**Phase 2** **Build**";
		const todos = extractTodosFromPlan(plan);
		expect(todos).toHaveLength(0);
	});

	it("extracts numbered list from Plan: with items longer than 3 chars", () => {
		const plan = "## Plan:\n1. abcd\n2. efgh";
		const todos = extractTodosFromPlan(plan);
		expect(todos).toHaveLength(2);
		expect(todos[0].text).toBe("abcd");
		expect(todos[1].text).toBe("efgh");
	});

	it("extracts phases with ### headers (no colon)", () => {
		const plan = "# Plan\n\n### Phase 1\nSetup\n\n### Phase 2\nBuild";
		const todos = extractTodosFromPlan(plan);
		expect(todos).toHaveLength(2);
	});

	it("extracts phases with dash separator on next line", () => {
		const plan = "# Plan\n\n**Phase 1**\n- Init\n\n**Phase 2**\n- Deploy";
		const todos = extractTodosFromPlan(plan);
		expect(todos).toHaveLength(2);
		expect(todos[0].text).toBe("- Init");
	});
});

describe("extractDoneSteps", () => {
	it("returns numbers from [DONE:n] markers", () => {
		expect(extractDoneSteps("Step [DONE:1] done and [DONE:2] too")).toEqual([
			1, 2,
		]);
	});

	it("supports lowercase done markers", () => {
		expect(extractDoneSteps("Step [done:1] done")).toEqual([1]);
	});

	it("supports mixed case done markers", () => {
		expect(extractDoneSteps("Step [Done:1] done")).toEqual([1]);
	});

	it("returns empty array when no markers", () => {
		expect(extractDoneSteps("No markers here")).toEqual([]);
	});

	it("returns empty array for empty string", () => {
		expect(extractDoneSteps("")).toEqual([]);
	});

	it("ignores invalid numbers", () => {
		expect(extractDoneSteps("[DONE:abc]")).toEqual([]);
	});

	it("handles multiple markers on same line", () => {
		expect(extractDoneSteps("[DONE:1][DONE:2][DONE:3]")).toEqual([1, 2, 3]);
	});
});

describe("markCompletedSteps", () => {
	it("marks matching steps as completed", () => {
		const items = [
			{ step: 1, text: "Setup", completed: false },
			{ step: 2, text: "Build", completed: false },
		];
		const count = markCompletedSteps("Phase [DONE:1] done", items);
		expect(count).toBe(1);
		expect(items[0].completed).toBe(true);
		expect(items[1].completed).toBe(false);
	});

	it("returns number of DONE markers processed, not items matched", () => {
		const items = [
			{ step: 1, text: "A", completed: false },
			{ step: 2, text: "B", completed: false },
			{ step: 3, text: "C", completed: false },
		];
		const count = markCompletedSteps("[DONE:1] [DONE:3]", items);
		expect(count).toBe(2);
		expect(items[0].completed).toBe(true);
		expect(items[1].completed).toBe(false);
		expect(items[2].completed).toBe(true);
	});

	it("returns DONE count even for non-matching step numbers", () => {
		const items = [{ step: 1, text: "A", completed: false }];
		const count = markCompletedSteps("[DONE:99]", items);
		expect(count).toBe(1);
		expect(items[0].completed).toBe(false);
	});

	it("returns 0 when no DONE markers", () => {
		const items = [{ step: 1, text: "A", completed: false }];
		const count = markCompletedSteps("no markers", items);
		expect(count).toBe(0);
		expect(items[0].completed).toBe(false);
	});

	it("handles already completed items", () => {
		const items = [{ step: 1, text: "A", completed: true }];
		const count = markCompletedSteps("[DONE:1]", items);
		expect(count).toBe(1);
		expect(items[0].completed).toBe(true);
	});
});
