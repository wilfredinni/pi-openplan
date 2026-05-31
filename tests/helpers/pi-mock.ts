import { vi } from "vitest";

/**
 * Shared factory functions for pi API integration tests.
 *
 * Provides:
 * - createMockPi()   — mock ExtensionAPI with vi.fn() surface
 * - createMockCtx()  — mock ExtensionContext with default values
 * - createCallbacks() — mock PlanModeCallbacks with vi.fn()
 */

export function createMockPi(overrides: Record<string, unknown> = {}) {
	return {
		registerCommand: vi.fn(),
		registerTool: vi.fn(),
		registerShortcut: vi.fn(),
		registerFlag: vi.fn(),
		registerMessageRenderer: vi.fn(),
		on: vi.fn(),
		setActiveTools: vi.fn(),
		getFlag: vi.fn().mockReturnValue(false),
		appendEntry: vi.fn(),
		sendMessage: vi.fn(),
		sendUserMessage: vi.fn(),
		...overrides,
	};
}

export function createMockCtx(overrides: Record<string, unknown> = {}) {
	return {
		cwd: "/test",
		hasUI: false,
		ui: {
			notify: vi.fn(),
			setStatus: vi.fn(),
			setWidget: vi.fn(),
			theme: {
				fg: vi.fn((_color: string, text: string) => text),
				strikethrough: vi.fn((text: string) => text),
			},
			custom: vi.fn(),
		},
		sessionManager: {
			getEntries: vi.fn().mockReturnValue([]),
		},
		...overrides,
	};
}

export function createCallbacks(overrides: Record<string, unknown> = {}) {
	return {
		updateUI: vi.fn(),
		persistState: vi.fn(),
		togglePlanMode: vi.fn(),
		enterPlanMode: vi.fn(),
		exitPlanMode: vi.fn(),
		...overrides,
	};
}
