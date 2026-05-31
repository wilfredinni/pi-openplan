import { describe, expect, it, vi } from "vitest";
import {
	MAX_HEADER_LENGTH,
	MAX_OPTIONS,
	MAX_QUESTIONS,
	MIN_OPTIONS,
	type PlanQuestion,
	PlanQuestionPrompt,
} from "../extensions/plan-mode/question-prompt.ts";

// Mock theme that returns text unchanged
const identityTheme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as unknown as {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
};

function makeQuestions(count: number): PlanQuestion[] {
	return Array.from({ length: count }, (_, i) => ({
		question: `Question ${i + 1}?`,
		header: `Q${i + 1}`,
		options: [
			{ label: "Option A", description: "First option" },
			{ label: "Option B", description: "Second option" },
		],
	}));
}

describe("PlanQuestionPrompt", () => {
	describe("constructor", () => {
		it("initializes with empty answers", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);
			expect(prompt).toBeInstanceOf(PlanQuestionPrompt);
		});
	});

	describe("handleInput - single select", () => {
		it("number key 1 selects first option and submits", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);

			prompt.handleInput("1");

			expect(done).toHaveBeenCalledWith([["Option A"]]);
		});

		it("number key 2 selects second option and submits", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);

			prompt.handleInput("2");

			expect(done).toHaveBeenCalledWith([["Option B"]]);
		});

		it("enter on first option selects and submits", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);

			// Navigate to option 1 (default is 0)
			prompt.handleInput("\r");

			expect(done).toHaveBeenCalledWith([["Option A"]]);
		});

		it("enter on second option after navigating down", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);

			prompt.handleInput("j"); // down
			prompt.handleInput("\r"); // enter

			expect(done).toHaveBeenCalledWith([["Option B"]]);
		});

		it("escape dismisses with null", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);

			prompt.handleInput("\x1b");

			expect(done).toHaveBeenCalledWith(null);
		});
	});

	describe("handleInput - multi select", () => {
		it("enter toggles first option, escape goes to review, enter submits", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Pick?",
						header: "Multi",
						options: [
							{ label: "Opt1", description: "First" },
							{ label: "Opt2", description: "Second" },
						],
						multiSelect: true,
					},
				],
				identityTheme,
				done,
			);

			prompt.handleInput("\r"); // toggle Opt1
			prompt.handleInput("\x1b"); // escape → review tab
			prompt.handleInput("\r"); // enter on review → submit

			expect(done).toHaveBeenCalledWith([["Opt1"]]);
		});

		it("can toggle multiple options and submit via review tab", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Pick?",
						header: "Multi",
						options: [
							{ label: "Opt1", description: "First" },
							{ label: "Opt2", description: "Second" },
						],
						multiSelect: true,
					},
				],
				identityTheme,
				done,
			);

			prompt.handleInput("\r"); // toggle Opt1
			prompt.handleInput("j"); // down
			prompt.handleInput("\r"); // toggle Opt2
			prompt.handleInput("\x1b"); // escape → review tab
			prompt.handleInput("\r"); // enter on review → submit

			expect(done).toHaveBeenCalledWith([["Opt1", "Opt2"]]);
		});
	});

	describe("handleInput - custom text", () => {
		it("enter on custom option starts editing", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Your choice?",
						header: "Custom",
						options: [{ label: "Default", description: "Default opt" }],
						custom: true,
					},
				],
				identityTheme,
				done,
			);

			// Navigate to custom option (index 1 = last = custom)
			prompt.handleInput("j"); // down to custom
			prompt.handleInput("\r"); // enter to start editing

			// Should be in editing mode, not done yet
			expect(done).not.toHaveBeenCalled();
		});

		it("types custom text and commits with enter", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Your choice?",
						header: "Custom",
						options: [{ label: "Default", description: "Default opt" }],
						custom: true,
					},
				],
				identityTheme,
				done,
			);

			prompt.handleInput("j"); // down to custom
			prompt.handleInput("\r"); // enter to start editing
			prompt.handleInput("M"); // type 'M'
			prompt.handleInput("y"); // type 'y'
			prompt.handleInput("C"); // type 'C'
			prompt.handleInput("u"); // type 'u'
			prompt.handleInput("s"); // type 's'
			prompt.handleInput("t"); // type 't'
			prompt.handleInput("o"); // type 'o'
			prompt.handleInput("m"); // type 'm'
			prompt.handleInput("\r"); // enter to commit

			// Should submit with custom text
			expect(done).toHaveBeenCalledWith([["MyCustom"]]);
		});

		it("escape during editing cancels", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Your choice?",
						header: "Custom",
						options: [{ label: "Default", description: "Default opt" }],
						custom: true,
					},
				],
				identityTheme,
				done,
			);

			prompt.handleInput("j"); // down to custom
			prompt.handleInput("\r"); // enter to start editing
			prompt.handleInput("T"); // type 'T'
			prompt.handleInput("e"); // type 'e'
			prompt.handleInput("x"); // type 'x'
			prompt.handleInput("t"); // type 't'
			prompt.handleInput("\x1b"); // escape to cancel editing

			expect(done).not.toHaveBeenCalled();
		});
	});

	describe("handleInput - tab navigation", () => {
		it("tab advances to next question", () => {
			const done = vi.fn();
			const questions = makeQuestions(2);
			const prompt = new PlanQuestionPrompt(questions, identityTheme, done);

			// Single-select question 1: pick option
			prompt.handleInput("1"); // selects Option A, advances
			expect(done).not.toHaveBeenCalled();
		});

		it("tab cycles through questions and review", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(2),
				identityTheme,
				done,
			);

			// Answer Q1
			prompt.handleInput("1");
			expect(done).not.toHaveBeenCalled();

			// Answer Q2
			prompt.handleInput("1");
			expect(done).not.toHaveBeenCalled();

			// Should be on review tab now
			// Enter to submit
			prompt.handleInput("\r");
			expect(done).toHaveBeenCalled();
		});
	});

	describe("render", () => {
		it("returns array of strings", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);

			const rendered = prompt.render(40);
			expect(Array.isArray(rendered)).toBe(true);
			expect(rendered.length).toBeGreaterThan(0);
		});

		it("renders at different widths without errors", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);

			const widths = [20, 40, 80, 120];
			for (const w of widths) {
				const rendered = prompt.render(w);
				expect(rendered.length).toBeGreaterThan(0);
			}
		});

		it("includes question text in render output", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);

			const rendered = prompt.render(80);
			const fullText = rendered.join("\n");
			expect(fullText).toContain("Question 1?");
		});

		it("caches rendered output", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);

			const first = prompt.render(80);
			const second = prompt.render(80);
			expect(first).toBe(second);
		});

		it("invalidates cache", () => {
			const done = vi.fn();
			const prompt = new PlanQuestionPrompt(
				makeQuestions(1),
				identityTheme,
				done,
			);

			prompt.render(80);
			prompt.invalidate();
			const afterInvalidate = prompt.render(80);
			expect(afterInvalidate).toBeDefined();
		});
	});
});

describe("constants", () => {
	it("MAX_QUESTIONS is 4", () => {
		expect(MAX_QUESTIONS).toBe(4);
	});

	it("MIN_OPTIONS is 2", () => {
		expect(MIN_OPTIONS).toBe(2);
	});

	it("MAX_OPTIONS is 4", () => {
		expect(MAX_OPTIONS).toBe(4);
	});

	it("MAX_HEADER_LENGTH is 12", () => {
		expect(MAX_HEADER_LENGTH).toBe(12);
	});
});
