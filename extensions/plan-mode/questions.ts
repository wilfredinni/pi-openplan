/**
 * Plan Question types and TUI component for interactive clarifying questions.
 *
 * Inspired by OpenCode's QuestionPrompt.tsx and Claude Code's AskUserQuestion tool.
 * The LLM calls `plan_question` with structured questions; the user interacts
 * via a keyboard-navigable TUI overlay with options, multi-select, custom text.
 */

import { matchesKey, Key, truncateToWidth } from "@earendil-works/pi-tui";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";

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
	private tui: { requestRender: () => void };
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
		tui: { requestRender: () => void },
		theme: {
			fg: (color: ThemeColor, text: string) => string;
			bold: (text: string) => string;
		},
		done: (result: string[][] | null) => void,
	) {
		this.questions = questions;
		this.tui = tui;
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
				// Allow cursor movement within input (handled by terminal)
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
				this.currentTab =
					(this.currentTab - 1 + this.tabCount) % this.tabCount;
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
		const contentWidth = width - 4; // 2 chars padding each side

		// Top border
		lines.push(t.fg("border", `╭${"─".repeat(Math.max(0, width - 2))}╮`));

		// ── Tab bar ─────────────────────────────────────────────
		if (this.tabCount > 1) {
			const tabParts: string[] = [];
			for (let i = 0; i < this.questions.length; i++) {
				const q = this.questions[i]!;
				const answered = (this.answers[i]?.length ?? 0) > 0;
				const isActive = i === this.currentTab;
				const label = q.header.length > 12
					? `${q.header.slice(0, 10)}..`
					: q.header;

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
			lines.push(`│ ${truncateToWidth(tabLine, contentWidth)} │`);
			lines.push(`│${" ".repeat(Math.max(0, width - 2))}│`);
		}

		// ── Content ─────────────────────────────────────────────
		if (this.isReviewTab) {
			this.renderReviewTab(lines, contentWidth);
		} else {
			this.renderQuestionTab(lines, contentWidth, width);
		}

		// Bottom border
		lines.push(t.fg("border", `╰${"─".repeat(Math.max(0, width - 2))}╯`));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	/**
	 * Render a single question tab (options list).
	 */
	private renderQuestionTab(
		lines: string[],
		contentWidth: number,
		width: number,
	): void {
		const t = this.theme;
		const q = this.currentQuestion;
		if (!q) return;

		// Question text
		const questionLine = `  ${t.fg("text", q.question)}${this.isMultiSelect ? t.fg("dim", " (select all that apply)") : ""}`;
		lines.push(`│ ${truncateToWidth(questionLine, contentWidth)} │`);
		lines.push(`│${" ".repeat(Math.max(0, width - 2))}│`);

		// Options
		for (let i = 0; i < q.options.length; i++) {
			const opt = q.options[i]!;
			const isSelected = i === this.selectedIndex;
			const isPicked =
				this.answers[this.currentTab]?.includes(opt.label) ?? false;

			const prefix = isSelected ? ">" : " ";
			const number = `${i + 1}.`;
			const numStr = this.isMultiSelect
				? `[${isPicked ? "✓" : " "}]`
				: `${number}`;

			const labelStyle = isSelected
				? t.fg("accent", `${prefix} ${numStr} ${opt.label}`)
				: isPicked
					? t.fg("success", `${prefix} ${numStr} ${opt.label}`)
					: t.fg("text", `${prefix} ${numStr} ${opt.label}`);

			lines.push(`│ ${truncateToWidth(labelStyle, contentWidth)} │`);

			// Description (indented)
			if (opt.description) {
				const descStyle = isSelected
					? t.fg("muted", `   ${t.fg("accent", opt.description)}`)
					: t.fg("muted", `   ${opt.description}`);
				lines.push(`│ ${truncateToWidth(descStyle, contentWidth)} │`);
			}
		}

		// Custom "Type your own answer" option
		if (q.custom !== false) {
			const customIdx = q.options.length;
			const isSelected = this.selectedIndex === customIdx;
			const hasCustomText = !!this.customTexts[this.currentTab];
			const customText = this.customTexts[this.currentTab];

			const number = this.isMultiSelect
				? `[${hasCustomText ? "✓" : " "}]`
				: `${customIdx + 1}.`;

			const customLabel = isSelected
				? t.fg("accent", `> ${number} Type your own answer`)
				: hasCustomText
					? t.fg("success", `  ${number} ${customText}`)
					: t.fg("text", `  ${number} Type your own answer`);

			lines.push(`│ ${truncateToWidth(customLabel, contentWidth)} │`);

			// Custom text input area
			if (this.editing && isSelected) {
				const inputDisplay = this.inputBuffer || t.fg("dim", "Type your answer...");
				lines.push(`│   ${t.fg("accent", `> ${inputDisplay}${t.fg("accent", "▌")}`)} │`);
			} else if (hasCustomText && !isSelected) {
				lines.push(
					`│   ${t.fg("muted", customText)} │`,
				);
			}
		}

		// Spacer
		lines.push(`│${" ".repeat(Math.max(0, width - 2))}│`);

		// ── Help bar (inside border) ────────────────────────────
		let help = "";
		if (this.isMultiSelect) {
			help = `${t.fg("dim", "↑↓")} navigate  ${t.fg("dim", "enter")} toggle  ${t.fg("dim", "esc")} done`;
		} else if (this.tabCount > 1) {
			help = `${t.fg("dim", "⇆ tab")}  ${t.fg("dim", "↑↓")} select  ${t.fg("dim", "1-")}${Math.min(this.totalOptions, 9)}${t.fg("dim", "")} pick  ${t.fg("dim", "enter")} confirm`;
		} else {
			help = `${t.fg("dim", "↑↓")} select  ${t.fg("dim", "1-")}${Math.min(this.totalOptions, 9)}${t.fg("dim", "")} pick  ${t.fg("dim", "enter")} confirm  ${t.fg("dim", "esc")} dismiss`;
		}
		lines.push(`│ ${truncateToWidth(`  ${help}`, contentWidth)} │`);
	}

	/**
	 * Render the review tab showing all answers.
	 */
	private renderReviewTab(lines: string[], contentWidth: number): void {
		const t = this.theme;

		lines.push(
			`│ ${truncateToWidth(`  ${t.fg("text", "Review your answers:")}`, contentWidth)} │`,
		);
		lines.push(`│${" ".repeat(Math.max(0, contentWidth + 4 - 2))}│`);

		for (let i = 0; i < this.questions.length; i++) {
			const q = this.questions[i]!;
			const answer = this.answers[i] ?? [];
			const answered = answer.length > 0;
			const icon = answered ? "✓" : "✗";
			const iconColor = answered ? "success" : "warning";
			const answerText = answered ? answer.join(", ") : "(not answered)";
			const answerColor = answered ? "text" : "warning";

			const reviewLine = `    ${t.fg(iconColor, icon)} ${t.fg("muted", `${q.header}:`)} ${t.fg(answerColor, answerText)}`;
			lines.push(`│ ${truncateToWidth(reviewLine, contentWidth)} │`);
		}

		lines.push(`│${" ".repeat(Math.max(0, contentWidth + 4 - 2))}│`);

		// Help
		const help = `${t.fg("dim", "↑↓")} scroll  ${t.fg("dim", "enter")} submit  ${t.fg("dim", "esc")} cancel`;
		lines.push(`│ ${truncateToWidth(`  ${help}`, contentWidth)} │`);
	}
}
