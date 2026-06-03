/**
 * Plan Question types and TUI component for interactive clarifying questions.
 *
 * Inspired by OpenCode's QuestionPrompt.tsx and Claude Code's AskUserQuestion tool.
 * The LLM calls `plan_question` with structured questions; the user interacts
 * via a keyboard-navigable TUI overlay with options, multi-select, custom text.
 */

import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";
// ── Constants ─────────────────────────────────────────────────────

export const MAX_QUESTIONS = 4;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MAX_HEADER_LENGTH = 12;

// ── Types ─────────────────────────────────────────────────────────

export interface QuestionOption {
	label: string;
	description: string;
}

export interface PlanQuestion {
	/** Full question text to display */
	question: string;
	/** Short label for tab display (max 12 chars) */
	header: string;
	/** 2-4 predefined options */
	options: QuestionOption[];
	/** Allow multiple selections (checkboxes). Default: false */
	multiSelect?: boolean;
	/** Allow free-text "Other" answer. Default: true */
	custom?: boolean;
}

export interface PlanQuestionInput {
	questions: PlanQuestion[];
}

/** answers[i] = selected label(s) for questions[i] */
export type PlanQuestionOutput = string[][];

// ── TUI Component ─────────────────────────────────────────────────

export class PlanQuestionPrompt {
	private questions: PlanQuestion[];
	private done: (result: string[][] | null) => void;
	private theme: {
		fg: (color: ThemeColor, text: string) => string;
		bold: (text: string) => string;
	};

	// State
	private currentTab = 0;
	private answers: string[][] = [];
	private customTexts: string[] = [];
	private selectedIndex = 0;
	private editing = false;
	private inputBuffer = "";
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		questions: PlanQuestion[],
		theme: {
			fg: (color: ThemeColor, text: string) => string;
			bold: (text: string) => string;
		},
		done: (result: string[][] | null) => void,
	) {
		this.questions = questions;
		this.theme = theme;
		this.done = done;
		this.answers = questions.map(() => []);
		this.customTexts = questions.map(() => "");
	}

	// ── Derived state ──────────────────────────────────────────────

	/** Number of tabs: questions + review/confirm (if needed) */
	private get tabCount(): number {
		if (this.questions.length === 1 && !this.questions[0]?.multiSelect) {
			return 1; // single-select auto-submits, no review tab
		}
		return this.questions.length + 1; // +1 for review/confirm
	}

	private get currentQuestion(): PlanQuestion | undefined {
		return this.questions[this.currentTab];
	}

	private get totalOptions(): number {
		const q = this.currentQuestion;
		if (!q) return 0;
		return q.options.length + (q.custom !== false ? 1 : 0);
	}

	private get isReviewTab(): boolean {
		if (this.questions.length === 1 && !this.questions[0]?.multiSelect) {
			return false;
		}
		return this.currentTab >= this.questions.length;
	}

	private get isMultiSelect(): boolean {
		return this.currentQuestion?.multiSelect === true;
	}

	private get isCustomOption(): boolean {
		return (
			this.selectedIndex === this.totalOptions - 1 &&
			this.currentQuestion?.custom !== false
		);
	}

	// ── Input handling ─────────────────────────────────────────────

	handleInput(data: string): void {
		// ── Custom text editing mode ──────────────────────────
		if (this.editing) {
			if (matchesKey(data, Key.escape)) {
				this.editing = false;
				this.inputBuffer = "";
				this.invalidate();
				return;
			}
			if (matchesKey(data, Key.enter)) {
				const text = this.inputBuffer.trim();
				if (text) {
					this.commitCustomAnswer(text);
				}
				this.editing = false;
				this.inputBuffer = "";
				this.tryAdvance();
				this.invalidate();
				return;
			}
			if (matchesKey(data, Key.backspace)) {
				this.inputBuffer = this.inputBuffer.slice(0, -1);
				this.invalidate();
				return;
			}
			if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
				return;
			}
			// Printable character
			if (data.length === 1 && data.charCodeAt(0) >= 32) {
				this.inputBuffer += data;
				this.invalidate();
				return;
			}
			return;
		}

		// ── Tab navigation (multi-question / review) ───────────
		if (this.tabCount > 1) {
			if (
				matchesKey(data, Key.tab) ||
				matchesKey(data, Key.right) ||
				data === "l"
			) {
				this.currentTab = (this.currentTab + 1) % this.tabCount;
				this.selectedIndex = 0;
				this.invalidate();
				return;
			}
			if (
				matchesKey(data, "shift+tab") ||
				matchesKey(data, Key.left) ||
				data === "h"
			) {
				this.currentTab = (this.currentTab - 1 + this.tabCount) % this.tabCount;
				this.selectedIndex = 0;
				this.invalidate();
				return;
			}
		}

		// ── Review tab ─────────────────────────────────────────
		if (this.isReviewTab) {
			if (matchesKey(data, Key.enter)) {
				this.done(this.answers);
				return;
			}
			if (matchesKey(data, Key.escape)) {
				this.done(null);
				return;
			}
			// Allow scrolling through review items
			if (matchesKey(data, Key.up) || data === "k") {
				if (this.selectedIndex > 0) {
					this.selectedIndex--;
					this.invalidate();
				}
				return;
			}
			if (matchesKey(data, Key.down) || data === "j") {
				if (this.selectedIndex < this.questions.length - 1) {
					this.selectedIndex++;
					this.invalidate();
				}
				return;
			}
			return;
		}

		// ── Question tab: option navigation ────────────────────
		const total = this.totalOptions;
		if (total === 0) return;

		// Number keys (1-9) for quick selection
		const digit = Number(data);
		if (!Number.isNaN(digit) && digit >= 1 && digit <= Math.min(total, 9)) {
			this.selectedIndex = digit - 1;
			this.selectCurrentOption();
			return;
		}

		if (matchesKey(data, Key.up) || data === "k") {
			this.selectedIndex = (this.selectedIndex - 1 + total) % total;
			this.invalidate();
			return;
		}
		if (matchesKey(data, Key.down) || data === "j") {
			this.selectedIndex = (this.selectedIndex + 1) % total;
			this.invalidate();
			return;
		}

		// Enter: pick / toggle / start editing
		if (matchesKey(data, Key.enter)) {
			this.selectCurrentOption();
			return;
		}

		// Escape: for multi-select, submit; for single-select, dismiss
		if (matchesKey(data, Key.escape)) {
			if (this.isMultiSelect) {
				// Submit current selections
				this.tryAdvance();
			} else {
				this.done(null);
			}
			return;
		}
	}

	/**
	 * Handle selection of the currently highlighted option.
	 */
	private selectCurrentOption(): void {
		const q = this.currentQuestion;
		if (!q) return;

		const isCustom = this.isCustomOption && q.custom !== false;

		if (isCustom) {
			// Start editing custom text
			this.editing = true;
			this.inputBuffer = this.customTexts[this.currentTab] || "";
			this.invalidate();
			return;
		}

		const opt = q.options[this.selectedIndex];
		if (!opt) return;

		if (this.isMultiSelect) {
			this.toggleAnswer(opt.label);
			this.invalidate();
			return;
		}

		// Single-select: pick and advance
		this.answers[this.currentTab] = [opt.label];
		this.tryAdvance();
		this.invalidate();
	}

	/**
	 * Commit custom text answer and advance.
	 */
	private commitCustomAnswer(text: string): void {
		this.customTexts[this.currentTab] = text;
		// For multi-select, add to selected answers
		if (this.isMultiSelect) {
			const existing = this.answers[this.currentTab] ?? [];
			if (!existing.includes(text)) {
				this.answers[this.currentTab] = [...existing, text];
			}
		} else {
			this.answers[this.currentTab] = [text];
		}
	}

	/**
	 * Toggle a multi-select answer.
	 */
	private toggleAnswer(label: string): void {
		const existing = this.answers[this.currentTab] ?? [];
		const index = existing.indexOf(label);
		if (index === -1) {
			this.answers[this.currentTab] = [...existing, label];
		} else {
			this.answers[this.currentTab] = existing.filter((a) => a !== label);
		}
	}

	/**
	 * Advance to next tab or submit if on last question (multi-question mode only).
	 */
	private tryAdvance(): void {
		if (this.tabCount <= 1) {
			// Single-select, auto-submit
			this.done(this.answers);
			return;
		}
		if (this.currentTab < this.questions.length - 1) {
			// Not the last question: advance to next
			this.currentTab++;
			this.selectedIndex = 0;
		} else {
			// Last question: advance to review
			this.currentTab = this.questions.length;
			this.selectedIndex = 0;
		}
	}

	/**
	 * Pad styled content to full line width, wrapped in │ ... │ border.
	 * Truncates if content exceeds the available width, pads with spaces
	 * if shorter — guaranteeing the right border │ always aligns at the
	 * same terminal column.
	 */
	private contentLine(content: string, width: number): string {
		const contentWidth = width - 4; // │ + space (2) + space + │ (2)
		const truncated = truncateToWidth(content, contentWidth);
		const visible = visibleWidth(truncated);
		const padding = " ".repeat(Math.max(0, contentWidth - visible));
		return `│ ${truncated}${padding} │`;
	}

	/** Full-width empty spacer line between sections. */
	private spacerLine(width: number): string {
		return `│${" ".repeat(Math.max(0, width - 2))}│`;
	}

	// ── Rendering ─────────────────────────────────────────────────

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const t = this.theme;
		const lines: string[] = [];

		// Top border
		lines.push(t.fg("border", `╭${"─".repeat(Math.max(0, width - 2))}╮`));

		// ── Tab bar ─────────────────────────────────────────────
		if (this.tabCount > 1) {
			const tabParts: string[] = [];
			for (const [i, q] of this.questions.entries()) {
				const answered = (this.answers[i]?.length ?? 0) > 0;
				const isActive = i === this.currentTab;
				const label =
					q.header.length > 12 ? `${q.header.slice(0, 10)}..` : q.header;

				if (isActive) {
					tabParts.push(t.fg("accent", `[${label}]`));
				} else if (answered) {
					tabParts.push(t.fg("success", `✓${label}`));
				} else {
					tabParts.push(t.fg("dim", ` ${label} `));
				}
			}
			// Review tab
			const reviewLabel = "Review";
			if (this.currentTab >= this.questions.length) {
				tabParts.push(t.fg("accent", `[${reviewLabel}]`));
			} else {
				const allAnswered = this.answers.every((a) => (a?.length ?? 0) > 0);
				tabParts.push(
					allAnswered
						? t.fg("success", `✓${reviewLabel}`)
						: t.fg("dim", ` ${reviewLabel} `),
				);
			}

			const tabLine = `  ${tabParts.join(" ")}`;
			lines.push(this.contentLine(tabLine, width));
			lines.push(this.spacerLine(width));
		}

		// ── Content ─────────────────────────────────────────────
		if (this.isReviewTab) {
			this.renderReviewTab(lines, width);
		} else {
			this.renderQuestionTab(lines, width);
		}

		// Bottom border
		lines.push(t.fg("border", `╰${"─".repeat(Math.max(0, width - 2))}╯`));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	/**
	 * Render a single question tab (options list).
	 * Uses contentLine() for all bordered lines to guarantee right-border alignment.
	 */
	private renderQuestionTab(lines: string[], width: number): void {
		const t = this.theme;
		const q = this.currentQuestion;
		if (!q) return;

		// ── Margin constants ────────────────────────────────────
		const MARGIN = 2;
		const NESTED_MARGIN = 4;
		const NUM_WIDTH = this.isMultiSelect ? 3 : 2;

		// Prefix for an option line (selected vs unselected)
		const optPrefix = (sel: boolean) => (sel ? "  > " : "    ");

		// Number/checkbox part, right-padded for consistent width
		const optNumber = (idx: number, picked: boolean) => {
			const raw = this.isMultiSelect
				? `[${picked ? "✓" : " "}]`
				: `${idx + 1}.`;
			return raw;
		};

		// Description indent: same column as where the label text starts
		const descIndent = " ".repeat(NESTED_MARGIN + NUM_WIDTH + 2);

		// ── Question text (wrapped) ─────────────────────────────
		const questionContent = `${t.fg("text", q.question)}${this.isMultiSelect ? t.fg("dim", " (select all that apply)") : ""}`;
		const innerWidth = Math.max(1, width - 4 - MARGIN);
		const wrappedLines = wrapTextWithAnsi(questionContent, innerWidth);
		for (const line of wrappedLines) {
			lines.push(this.contentLine(" ".repeat(MARGIN) + line, width));
		}
		lines.push(this.spacerLine(width));

		// ── Options ─────────────────────────────────────────────
		for (const [i, opt] of q.options.entries()) {
			const isSel = i === this.selectedIndex;
			const isPicked =
				this.answers[this.currentTab]?.includes(opt.label) ?? false;

			const number = optNumber(i, isPicked);
			const prefix = optPrefix(isSel);
			// prefix + number + 2 spaces + label
			const labelContent = `${prefix}${number}  ${opt.label}`;

			const styled = isSel
				? t.fg("accent", labelContent)
				: isPicked
					? t.fg("success", labelContent)
					: t.fg("text", labelContent);

			lines.push(this.contentLine(styled, width));

			// Description (indented to align with the label text)
			if (opt.description) {
				const descContent = isSel
					? `${descIndent}${t.fg("accent", opt.description)}`
					: `${descIndent}${t.fg("muted", opt.description)}`;
				lines.push(this.contentLine(descContent, width));
			}
		}

		// ── Custom "Type your own answer" option ────────────────
		if (q.custom !== false) {
			const customIdx = q.options.length;
			const isSel = this.selectedIndex === customIdx;
			const hasCustomText = !!this.customTexts[this.currentTab];
			const customText = this.customTexts[this.currentTab];

			const number = optNumber(customIdx, hasCustomText);
			const prefix = optPrefix(isSel);

			const customLabel = hasCustomText
				? `${prefix}${number}  ${customText}`
				: `${prefix}${number}  Type your own answer`;

			const styledLabel = isSel
				? t.fg("accent", customLabel)
				: hasCustomText
					? t.fg("success", customLabel)
					: t.fg("text", customLabel);

			lines.push(this.contentLine(styledLabel, width));

			// Custom text input area (when user is actively typing)
			if (this.editing && isSel) {
				const inputDisplay =
					this.inputBuffer || t.fg("dim", "Type your answer...");
				const inputPrefix = " ".repeat(NESTED_MARGIN);
				const inputContent = `${inputPrefix}${t.fg("accent", `> ${inputDisplay}${t.fg("accent", "▌")}`)}`;
				lines.push(this.contentLine(inputContent, width));
			} else if (hasCustomText && !isSel) {
				const inputPrefix = " ".repeat(NESTED_MARGIN);
				lines.push(
					this.contentLine(`${inputPrefix}${t.fg("muted", customText)}`, width),
				);
			}
		}

		// Spacer before help bar
		lines.push(this.spacerLine(width));

		// ── Help bar (inside border) ────────────────────────────
		let help = "";
		if (this.isMultiSelect) {
			help = `${t.fg("dim", "↑↓")} navigate  ${t.fg("dim", "enter")} toggle  ${t.fg("dim", "esc")} done`;
		} else if (this.tabCount > 1) {
			help = `${t.fg("dim", "⇆ tab")}  ${t.fg("dim", "↑↓")} select  ${t.fg("dim", "1-")}${Math.min(this.totalOptions, 9)}${t.fg("dim", "")} pick  ${t.fg("dim", "enter")} confirm`;
		} else {
			help = `${t.fg("dim", "↑↓")} select  ${t.fg("dim", "1-")}${Math.min(this.totalOptions, 9)}${t.fg("dim", "")} pick  ${t.fg("dim", "enter")} confirm  ${t.fg("dim", "esc")} dismiss`;
		}
		lines.push(this.contentLine(" ".repeat(MARGIN) + help, width));
	}

	/**
	 * Render the review tab showing all answers.
	 */
	private renderReviewTab(lines: string[], width: number): void {
		const t = this.theme;
		const MARGIN = 2;
		const NESTED_MARGIN = 4;

		lines.push(
			this.contentLine(
				" ".repeat(MARGIN) + t.fg("text", "Review your answers:"),
				width,
			),
		);
		lines.push(this.spacerLine(width));

		for (const [i, q] of this.questions.entries()) {
			const answer = this.answers[i] ?? [];
			const answered = answer.length > 0;
			const icon = answered ? "✓" : "✗";
			const iconColor = answered ? "success" : "warning";
			const answerText = answered ? answer.join(", ") : "(not answered)";
			const answerColor = answered ? "text" : "warning";

			const reviewLine =
				" ".repeat(NESTED_MARGIN) +
				t.fg(iconColor, icon) +
				" " +
				t.fg("muted", `${q.header}:`) +
				" " +
				t.fg(answerColor, answerText);
			lines.push(this.contentLine(reviewLine, width));
		}

		lines.push(this.spacerLine(width));

		// Help
		const help = `${t.fg("dim", "↑↓")} scroll  ${t.fg("dim", "enter")} submit  ${t.fg("dim", "esc")} cancel`;
		lines.push(this.contentLine(" ".repeat(MARGIN) + help, width));
	}
}

// ── Tool Factory ────────────────────────────────────────────────────────

export function registerPlanQuestionTool(pi: ExtensionAPI): void {
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

			// Validate input — throw to signal errors (per pi docs: returning isError:true has no effect)
			for (const q of input.questions) {
				if (!q.question?.trim()) {
					throw new Error(
						"Error: question text is empty. Each question must have non-empty text.",
					);
				}
				if (!q.header?.trim()) {
					throw new Error(
						`Error: header is empty for question "${q.question.slice(0, 40)}...". Each question needs a short header label.`,
					);
				}
				if (q.header.length > MAX_HEADER_LENGTH) {
					throw new Error(
						`Error: header "${q.header}" exceeds max length of ${MAX_HEADER_LENGTH} characters. Please shorten it.`,
					);
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

				// Build formatted markdown summary
				const questionsLines = input.questions.map((q, i) => {
					const answers_i = result[i] ?? [];
					const answerText =
						answers_i.length > 0 ? answers_i.join(", ") : "*(no preference)*";
					return `> ${q.question}\n→ **${answerText}**`;
				});
				const md = `## Q&A Complete\n\n${questionsLines.join("\n\n")}`;

				pi.sendMessage(
					{
						customType: "plan-answers",
						content: md,
						display: true,
					},
					{ triggerTurn: false },
				);

				return {
					content: [{ type: "text", text: "Answers recorded." }],
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
}
