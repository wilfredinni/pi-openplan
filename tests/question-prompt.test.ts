import { describe, expect, it, vi } from "vitest";
import {
	type PlanQuestion,
	PlanQuestionPrompt,
} from "../extensions/plan-mode/question-prompt.ts";

// Terminal input codes:
const ENTER = "\r";
const ESCAPE = "\x1b";
const _UP = "\x1b[A";
const DOWN = "\x1b[B";
const RIGHT = "\x1b[C";
const LEFT = "\x1b[D";
const TAB = "\t";
const SHIFT_TAB = "\x1b[Z";
const _BACKSPACE = "\x7f";

function createTheme() {
	return {
		fg: vi.fn((_color: string, text: string) => text),
		bold: vi.fn((text: string) => text),
	};
}

function makeQuestions(): PlanQuestion[] {
	return [
		{
			question: "Which database?",
			header: "Database",
			options: [
				{ label: "PostgreSQL", description: "Relational, ACID compliant" },
				{ label: "SQLite", description: "Embedded, zero config" },
				{ label: "MongoDB", description: "Document store" },
			],
			multiSelect: false,
			custom: true,
		},
	];
}

function makeMultiQuestion(): PlanQuestion[] {
	return [
		{
			question: "Pick languages",
			header: "Languages",
			options: [
				{ label: "TypeScript", description: "Static typed JS" },
				{ label: "Python", description: "General purpose" },
				{ label: "Go", description: "Systems language" },
			],
			multiSelect: true,
			custom: false,
		},
	];
}

function makeTwoQuestions(): PlanQuestion[] {
	return [
		{
			question: "First question?",
			header: "First",
			options: [
				{ label: "A", description: "Option A" },
				{ label: "B", description: "Option B" },
			],
			multiSelect: false,
			custom: false,
		},
		{
			question: "Second question?",
			header: "Second",
			options: [
				{ label: "X", description: "Option X" },
				{ label: "Y", description: "Option Y" },
			],
			multiSelect: false,
			custom: false,
		},
	];
}

describe("question-prompt", () => {
	describe("PlanQuestionPrompt", () => {
		describe("constructor", () => {
			it("initializes with 1 question, answers ready", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				expect(prompt).toBeDefined();
			});
		});

		describe("single-select", () => {
			it("selects option via Enter and auto-submits", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				// For single-select with 1 question: Enter on option auto-submits
				prompt.handleInput(DOWN); // Move to SQLite
				prompt.handleInput(ENTER);
				expect(done).toHaveBeenCalledWith([["SQLite"]]);
			});

			it("selects option via number key and auto-submits", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput("2");
				expect(done).toHaveBeenCalledWith([["SQLite"]]);
			});

			it("selects first option via number key 1", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput("1");
				expect(done).toHaveBeenCalledWith([["PostgreSQL"]]);
			});

			it("number key beyond options does nothing", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput("9");
				expect(done).not.toHaveBeenCalled();
			});
		});

		describe("multi-select", () => {
			it("toggles options with Enter, submits via review tab", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeMultiQuestion(),
					createTheme(),
					done,
				);
				// Toggle TypeScript on, then off
				prompt.handleInput(ENTER);
				prompt.handleInput(ENTER);
				// Move to Python and toggle on
				prompt.handleInput(DOWN);
				prompt.handleInput(ENTER);
				// Escape advances to review tab, Enter submits
				prompt.handleInput(ESCAPE);
				prompt.handleInput(ENTER);
				expect(done).toHaveBeenCalledWith([["Python"]]);
			});

			it("submits multiple selections via review tab", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeMultiQuestion(),
					createTheme(),
					done,
				);
				prompt.handleInput(ENTER); // TypeScript on
				prompt.handleInput(DOWN);
				prompt.handleInput(ENTER); // Python on
				// Escape → review, Enter → submit
				prompt.handleInput(ESCAPE);
				prompt.handleInput(ENTER);
				expect(done).toHaveBeenCalledWith([
					expect.arrayContaining(["TypeScript", "Python"]),
				]);
			});

			it("selects all options and submits via review", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeMultiQuestion(),
					createTheme(),
					done,
				);
				prompt.handleInput(ENTER); // TypeScript
				prompt.handleInput(DOWN);
				prompt.handleInput(ENTER); // Python
				prompt.handleInput(DOWN);
				prompt.handleInput(ENTER); // Go
				prompt.handleInput(ESCAPE); // Review
				prompt.handleInput(ENTER); // Submit
				expect(done).toHaveBeenCalledWith([["TypeScript", "Python", "Go"]]);
			});
		});

		describe("custom text", () => {
			it("enters custom text editing mode on last option", () => {
				const done = vi.fn();
				const questions = [
					{
						question: "Custom?",
						header: "Custom",
						options: [{ label: "Default", description: "Default option" }],
						multiSelect: false,
						custom: true,
					},
				];
				const prompt = new PlanQuestionPrompt(questions, createTheme(), done);
				// Navigate to last option (custom text = index 1 for 1 option + custom)
				prompt.handleInput(DOWN);
				prompt.handleInput(ENTER); // Start editing
				// Type some text
				prompt.handleInput("h");
				prompt.handleInput("i");
				// Commit and auto-submit (single-select)
				prompt.handleInput(ENTER);
				expect(done).toHaveBeenCalledWith([["hi"]]);
			});

			it("cancels custom editing with Escape", () => {
				const done = vi.fn();
				const questions = [
					{
						question: "Custom?",
						header: "Custom",
						options: [{ label: "Default", description: "Default option" }],
						multiSelect: false,
						custom: true,
					},
				];
				const prompt = new PlanQuestionPrompt(questions, createTheme(), done);
				prompt.handleInput(DOWN);
				prompt.handleInput(ENTER); // Start editing
				prompt.handleInput(ESCAPE); // Cancel editing
				expect(done).not.toHaveBeenCalled();
			});
		});

		describe("navigation", () => {
			it("navigates options with up/down arrow keys", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput(DOWN);
				prompt.handleInput(DOWN);
				prompt.handleInput(ENTER);
				expect(done).toHaveBeenCalledWith([["MongoDB"]]);
			});

			it("navigates with j/k vim keys", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput("j"); // down
				prompt.handleInput("j"); // down
				prompt.handleInput(ENTER);
				expect(done).toHaveBeenCalledWith([["MongoDB"]]);
			});
		});

		describe("multi-question navigation", () => {
			it("navigates between questions with tab", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeTwoQuestions(),
					createTheme(),
					done,
				);
				// Tab to Q2
				prompt.handleInput(TAB);
				// Select Y on Q2 (single-select, advances to review tab)
				prompt.handleInput("2");
				// Submit on review tab
				prompt.handleInput(ENTER);
				expect(done).toHaveBeenCalledWith([expect.arrayContaining([]), ["Y"]]);
			});

			it("navigates with shift+tab", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeTwoQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput(TAB); // Q2
				prompt.handleInput(SHIFT_TAB); // Back to Q1
				prompt.handleInput("1"); // Select A → advances to Q2
				prompt.handleInput(ENTER); // Select X on Q2 → advances to review
				prompt.handleInput(ENTER); // Submit on review
				expect(done).toHaveBeenCalledWith([["A"], ["X"]]);
			});

			it("navigates with right/left arrow keys", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeTwoQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput(RIGHT); // Q2
				prompt.handleInput(LEFT); // Q1
				prompt.handleInput(ENTER); // A → advances to Q2
				prompt.handleInput(ENTER); // X → advances to review
				prompt.handleInput(ENTER); // Submit on review
				expect(done).toHaveBeenCalledWith([["A"], ["X"]]);
			});

			it("navigates with l/h vim keys", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeTwoQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput("l"); // Q2
				prompt.handleInput("h"); // Q1
				prompt.handleInput(ENTER); // A → advances to Q2
				prompt.handleInput(ENTER); // X → advances to review
				prompt.handleInput(ENTER); // Submit
				expect(done).toHaveBeenCalledWith([["A"], ["X"]]);
			});
		});

		describe("review tab", () => {
			it("submits from review with Enter", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeTwoQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput(ENTER); // Q1: A (advances to Q2)
				prompt.handleInput(ENTER); // Q2: X (advances to review)
				prompt.handleInput(ENTER); // Submit on review
				expect(done).toHaveBeenCalledWith([["A"], ["X"]]);
			});

			it("cancels from review with Escape", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeTwoQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput(ENTER); // Q1: A (advances to Q2)
				prompt.handleInput(TAB); // Skip Q2 to review
				prompt.handleInput(ESCAPE); // Cancel on review
				expect(done).toHaveBeenCalledWith(null);
			});
		});

		describe("escape handling", () => {
			it("cancels single-select with escape", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				prompt.handleInput(ESCAPE);
				expect(done).toHaveBeenCalledWith(null);
			});
		});

		describe("render", () => {
			it("returns lines array with expected borders", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				const lines = prompt.render(80);
				expect(lines.length).toBeGreaterThan(3);
				expect(lines[0]).toContain("╭");
				expect(lines[0]).toContain("╮");
				const last = lines[lines.length - 1];
				expect(last).toContain("╰");
				expect(last).toContain("╯");
			});

			it("includes question text in output", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				const lines = prompt.render(80);
				const joined = lines.join("\n");
				expect(joined).toContain("Which database?");
			});

			it("includes option labels in output", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				const lines = prompt.render(80);
				const joined = lines.join("\n");
				expect(joined).toContain("PostgreSQL");
				expect(joined).toContain("SQLite");
				expect(joined).toContain("MongoDB");
			});

			it("includes help bar", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				const lines = prompt.render(80);
				const joined = lines.join("\n");
				expect(joined).toContain("select");
				expect(joined).toContain("pick");
			});

			it("caches render output", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				const lines1 = prompt.render(80);
				const lines2 = prompt.render(80);
				expect(lines1).toBe(lines2);
			});

			it("invalidates cache", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				prompt.render(80);
				prompt.invalidate();
				const lines = prompt.render(80);
				expect(lines.length).toBeGreaterThan(3);
			});

			it("handles different widths", () => {
				const done = vi.fn();
				const prompt = new PlanQuestionPrompt(
					makeQuestions(),
					createTheme(),
					done,
				);
				const narrow = prompt.render(40);
				const wide = prompt.render(100);
				expect(narrow.length).toBeGreaterThanOrEqual(3);
				expect(wide.length).toBeGreaterThanOrEqual(3);
			});
		});
	});
});
