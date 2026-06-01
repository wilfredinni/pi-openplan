/**
 * Shared mock factories for pi-openplan test suite.
 *
 * Provides typed mocks for ExtensionAPI, ExtensionContext, PlanModeState,
 * and PlanModeCallbacks. All methods return vi.fn() stubs by default.
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

let ctxCounter = 0;

import {
	createInitialState,
	type PlanModeCallbacks,
	type PlanModeState,
} from "../extensions/plan-mode/state.ts";

/** Create a minimal ExtensionAPI mock. Only methods actually used by the extension are stubbed. */
export function createMockPi(): ExtensionAPI {
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
	} as unknown as ExtensionAPI;
}

/** Create a minimal ExtensionContext mock. Override specific fields via `overrides`.
 * Each call gets a unique cwd to prevent cross-test filesystem pollution. */
export function createMockCtx(
	overrides: Partial<ExtensionContext> = {},
): ExtensionContext {
	ctxCounter++;
	const notifications: string[] = [];
	return {
		cwd: `/tmp/test-${ctxCounter}`,
		hasUI: true,
		ui: {
			notify: vi.fn((msg: string) => {
				notifications.push(msg);
			}) as unknown as ExtensionContext["ui"]["notify"],
			setStatus: vi.fn(),
			setWidget: vi.fn(),
			theme: {
				fg: vi.fn(
					(_color: string, text: string) => text,
				) as unknown as ExtensionContext["ui"]["theme"]["fg"],
				bold: vi.fn(
					(text: string) => text,
				) as unknown as ExtensionContext["ui"]["theme"]["bold"],
				strikethrough: vi.fn(
					(text: string) => text,
				) as unknown as ExtensionContext["ui"]["theme"]["strikethrough"],
			},
			confirm: async () => true,
			select: async (_title: string, items: string[]) => items[0] ?? "",
			input: async () => "",
			editor: async () => "",
			hasUI: true,
		} as unknown as ExtensionContext["ui"],
		sessionManager: {
			getEntries: vi.fn().mockReturnValue([]),
			getBranch: vi.fn().mockReturnValue([]),
		} as unknown as ExtensionContext["sessionManager"],
		_notifications: notifications,
		...overrides,
	} as unknown as ExtensionContext;
}

/** Create a fresh PlanModeState. */
export function createTestState(): PlanModeState {
	return createInitialState();
}

/** Create PlanModeCallbacks with vi.fn() for all callbacks. */
export function createCallbacks(): PlanModeCallbacks {
	return {
		updateUI: vi.fn(),
		persistState: vi.fn(),
		togglePlanMode: vi.fn(),
		enterPlanMode: vi.fn(),
		exitPlanMode: vi.fn(),
	};
}
