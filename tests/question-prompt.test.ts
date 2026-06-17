/**
 * Tests for PlanQuestionPrompt class.
 *
 * handlesInput uses matchesKey() which expects real terminal keycodes:
 *   Enter  → \r
 *   Escape → \x1b
 *   Tab    → \t
 *   Up     → \x1b[A
 *   Down   → \x1b[B
 *   Backspace → \x7f
 *
 * Vim-style navigation (j/k/l/h) uses direct string comparison.
 */

import { describe, expect, it, vi } from "vitest";
import { PlanQuestionPrompt } from "../extensions/plan-mode/question-prompt.ts";

function mockTheme() {
	return {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
}

function makeDone() {
	return vi.fn();
}

describe("PlanQuestionPrompt", () => {
	describe("constructor", () => {
		it("initializes state correctly", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "What is your favorite color?",
						header: "Color",
						options: [
							{ label: "Red", description: "Like fire" },
							{ label: "Blue", description: "Like sky" },
						],
					},
				],
				mockTheme(),
				done,
			);
			expect(prompt).toBeInstanceOf(PlanQuestionPrompt);
		});
	});

	describe("single-select auto-submit", () => {
		it("number key selects option and auto-submits", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Pick one",
						header: "Pick",
						options: [
							{ label: "Option A", description: "First" },
							{ label: "Option B", description: "Second" },
						],
					},
				],
				mockTheme(),
				done,
			);

			// Number key 2 selects Option B, auto-submits single-select
			prompt.handleInput("2");
			expect(done).toHaveBeenCalledWith([["Option B"]]);
		});

		it("enter with default selection auto-submits first option", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Pick one",
						header: "Pick",
						options: [
							{ label: "Option A", description: "First" },
							{ label: "Option B", description: "Second" },
						],
					},
				],
				mockTheme(),
				done,
			);

			// Enter on default-selected first option (\r = terminal enter)
			prompt.handleInput("\r");
			expect(done).toHaveBeenCalledWith([["Option A"]]);
		});
	});

	describe("multi-select", () => {
		it("enter toggles selection, escape advances to review, enter on review submits", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Pick multiple",
						header: "Multi",
						options: [
							{ label: "Option 1", description: "First" },
							{ label: "Option 2", description: "Second" },
						],
						multiSelect: true,
					},
				],
				mockTheme(),
				done,
			);

			// Enter toggles Option 1 on
			prompt.handleInput("\r");
			// Navigate down (vim-style j)
			prompt.handleInput("j");
			// Enter toggles Option 2 on
			prompt.handleInput("\r");
			// Escape advances to review tab
			prompt.handleInput("\x1b");
			// Enter on review tab submits
			prompt.handleInput("\r");
			expect(done).toHaveBeenCalledWith([["Option 1", "Option 2"]]);
		});

		it("escape from multi-select advances to review, then enter submits empty", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Pick multiple",
						header: "Multi",
						options: [
							{ label: "Option 1", description: "First" },
							{ label: "Option 2", description: "Second" },
						],
						multiSelect: true,
					},
				],
				mockTheme(),
				done,
			);

			// Escape from single question multi-select → review tab
			prompt.handleInput("\x1b");
			// Enter on review tab submits
			prompt.handleInput("\r");
			expect(done).toHaveBeenCalledWith([[]]);
		});
	});

	describe("tab navigation (multi-question)", () => {
		it("tab advances to next tab, does not call done", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Q1?",
						header: "First",
						options: [
							{ label: "A", description: "a" },
							{ label: "B", description: "b" },
						],
					},
					{
						question: "Q2?",
						header: "Second",
						options: [
							{ label: "C", description: "c" },
							{ label: "D", description: "d" },
						],
					},
				],
				mockTheme(),
				done,
			);

			// Tab to advance (\t)
			prompt.handleInput("\t");
			expect(done).not.toHaveBeenCalled();
		});

		it("vim-style 'l' advances to next tab", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Q1?",
						header: "First",
						options: [{ label: "A", description: "a" }],
					},
					{
						question: "Q2?",
						header: "Second",
						options: [{ label: "B", description: "b" }],
					},
				],
				mockTheme(),
				done,
			);

			// 'l' to advance
			prompt.handleInput("l");
			expect(done).not.toHaveBeenCalled();
		});

		it("vim-style 'h' goes back to previous tab", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Q1?",
						header: "First",
						options: [{ label: "A", description: "a" }],
					},
					{
						question: "Q2?",
						header: "Second",
						options: [{ label: "B", description: "b" }],
					},
				],
				mockTheme(),
				done,
			);

			// Advance to second tab
			prompt.handleInput("l");
			// Go back
			prompt.handleInput("h");
			expect(done).not.toHaveBeenCalled();
		});
	});

	describe("custom text input", () => {
		it("selecting custom option, entering text, and committing", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Pick one?",
						header: "Pick",
						options: [{ label: "Predefined", description: "Fixed choice" }],
						custom: true,
					},
				],
				mockTheme(),
				done,
			);

			// Navigate down to custom option (index 1)
			prompt.handleInput("j");
			// Enter to start editing
			prompt.handleInput("\r");
			// Type some characters
			prompt.handleInput("c");
			prompt.handleInput("a");
			prompt.handleInput("t");
			// Enter to commit
			prompt.handleInput("\r");
			expect(done).toHaveBeenCalledWith([["cat"]]);
		});

		it("escape cancels custom text editing", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Pick one?",
						header: "Pick",
						options: [{ label: "Predefined", description: "Fixed choice" }],
						custom: true,
					},
				],
				mockTheme(),
				done,
			);

			// Navigate to custom option
			prompt.handleInput("j");
			// Enter editing
			prompt.handleInput("\r");
			// Type something
			prompt.handleInput("text");
			// Escape to cancel editing
			prompt.handleInput("\x1b");
			// Done should NOT have been called
			expect(done).not.toHaveBeenCalled();
		});
	});

	describe("escape dismissal", () => {
		it("single-select: escape calls done(null)", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Pick one",
						header: "Pick",
						options: [{ label: "Option A", description: "First" }],
					},
				],
				mockTheme(),
				done,
			);

			// \x1b is terminal escape sequence
			prompt.handleInput("\x1b");
			expect(done).toHaveBeenCalledWith(null);
		});
	});

	describe("render output", () => {
		it("returns string array with border characters", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "What is your favorite?",
						header: "Fav",
						options: [
							{ label: "Option A", description: "First option" },
							{ label: "Option B", description: "Second option" },
						],
					},
				],
				mockTheme(),
				done,
			);

			const lines = prompt.render(60);
			expect(Array.isArray(lines)).toBe(true);
			expect(lines.length).toBeGreaterThan(3);

			const topBorder = lines[0];
			expect(topBorder.startsWith("╭")).toBe(true);
			expect(topBorder.endsWith("╮")).toBe(true);

			const bottomBorder = lines[lines.length - 1];
			expect(bottomBorder.startsWith("╰")).toBe(true);
			expect(bottomBorder.endsWith("╯")).toBe(true);

			const allText = lines.join("\n");
			expect(allText).toContain("Option A");
			expect(allText).toContain("Option B");
			expect(allText).toContain("enter");
			expect(allText).toContain("dismiss");
		});

		it("render includes question text", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "What is your favorite color?",
						header: "Color",
						options: [{ label: "Red", description: "Like fire" }],
					},
				],
				mockTheme(),
				done,
			);

			const allText = prompt.render(60).join("\n");
			expect(allText).toContain("What is your favorite color?");
		});
	});

	describe("header truncation", () => {
		it("truncates headers exceeding MAX_HEADER_LENGTH in tab rendering", () => {
			const done = makeDone();
			const longHeader = "Implementation Strategy"; // 21 chars > 16
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Q1?",
						header: longHeader,
						options: [
							{ label: "A", description: "a" },
							{ label: "B", description: "b" },
						],
					},
					{
						question: "Q2?",
						header: "Short",
						options: [
							{ label: "C", description: "c" },
							{ label: "D", description: "d" },
						],
					},
				],
				mockTheme(),
				done,
			);

			const allText = prompt.render(80).join("\n");
			// Full 21-char header should NOT appear in tabs
			expect(allText).not.toContain(longHeader);
			// Truncated version (first 14 chars + "..") should appear
			expect(allText).toContain("Implementation..");
		});

		it("passes through headers within MAX_HEADER_LENGTH unchanged", () => {
			const done = makeDone();
			const shortHeader = "Approach"; // 8 chars ≤ 16
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Q1?",
						header: shortHeader,
						options: [
							{ label: "A", description: "a" },
							{ label: "B", description: "b" },
						],
					},
					{
						question: "Q2?",
						header: "Other",
						options: [
							{ label: "C", description: "c" },
							{ label: "D", description: "d" },
						],
					},
				],
				mockTheme(),
				done,
			);

			const allText = prompt.render(80).join("\n");
			expect(allText).toContain(shortHeader);
		});
	});

	describe("invalidation", () => {
		it("invalidate clears cache so render regenerates", () => {
			const done = makeDone();
			const prompt = new PlanQuestionPrompt(
				[
					{
						question: "Q?",
						header: "Q",
						options: [
							{ label: "A", description: "a" },
							{ label: "B", description: "b" },
						],
					},
				],
				mockTheme(),
				done,
			);

			const first = prompt.render(60);
			const second = prompt.render(60);
			expect(second).toBe(first); // cached

			prompt.invalidate();
			const third = prompt.render(60);
			expect(third).not.toBe(first); // regenerated
		});
	});
});
