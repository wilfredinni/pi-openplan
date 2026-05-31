/**
 * Shared test infrastructure for pi-openplan.
 *
 * Mock factories for pi ExtensionAPI, ExtensionContext, Theme, SessionManager.
 * Reusable across all integration tests. Pure function tests don't need this.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";
import {
	createInitialState,
	type PlanModeState,
} from "../extensions/plan-mode/state.ts";

// ── Mock Theme ──────────────────────────────────────────────────────────

export function createMockTheme() {
	return {
		fg: vi.fn((_color: string, text: string) => text),
		bold: vi.fn((text: string) => text),
		dim: vi.fn((text: string) => text),
		strikethrough: vi.fn((text: string) => text),
	};
}

// ── Mock UI ─────────────────────────────────────────────────────────────

export function createMockUI() {
	const theme = createMockTheme();
	return {
		notify: vi.fn(),
		setStatus: vi.fn(),
		setWidget: vi.fn(),
		custom: vi.fn(),
		theme,
	};
}

// ── Mock Session Manager ────────────────────────────────────────────────

export function createMockSessionManager(entries: unknown[] = []) {
	return {
		getEntries: vi.fn(() => entries),
	};
}

// ── Mock ExtensionContext ───────────────────────────────────────────────

export function createMockCtx(
	overrides: Partial<{
		cwd: string;
		hasUI: boolean;
		entries: unknown[];
	}> = {},
) {
	const ui = createMockUI();
	return {
		cwd: overrides.cwd ?? "/test/project",
		hasUI: overrides.hasUI ?? true,
		ui,
		sessionManager: createMockSessionManager(overrides.entries),
		...overrides,
	};
}

// ── Mock ExtensionAPI ───────────────────────────────────────────────────

export function createMockPi(): ExtensionAPI {
	const pi = {
		registerCommand: vi.fn() as unknown as ExtensionAPI["registerCommand"],
		registerTool: vi.fn() as unknown as ExtensionAPI["registerTool"],
		registerShortcut: vi.fn() as unknown as ExtensionAPI["registerShortcut"],
		registerFlag: vi.fn() as unknown as ExtensionAPI["registerFlag"],
		registerMessageRenderer:
			vi.fn() as unknown as ExtensionAPI["registerMessageRenderer"],
		on: vi.fn() as unknown as ExtensionAPI["on"],
		setActiveTools: vi.fn() as unknown as ExtensionAPI["setActiveTools"],
		sendMessage: vi.fn() as unknown as ExtensionAPI["sendMessage"],
		sendUserMessage: vi.fn() as unknown as ExtensionAPI["sendUserMessage"],
		appendEntry: vi.fn() as unknown as ExtensionAPI["appendEntry"],
		getFlag: vi.fn() as unknown as ExtensionAPI["getFlag"],
		// Stub methods not directly tested:
		setSessionName: vi.fn() as unknown as ExtensionAPI["setSessionName"],
		getSessionName: vi.fn() as unknown as ExtensionAPI["getSessionName"],
		setLabel: vi.fn() as unknown as ExtensionAPI["setLabel"],
		exec: vi.fn() as unknown as ExtensionAPI["exec"],
		getActiveTools: vi.fn() as unknown as ExtensionAPI["getActiveTools"],
		getAllTools: vi.fn() as unknown as ExtensionAPI["getAllTools"],
		getCommands: vi.fn() as unknown as ExtensionAPI["getCommands"],
		setModel: vi.fn() as unknown as ExtensionAPI["setModel"],
		getThinkingLevel: vi.fn() as unknown as ExtensionAPI["getThinkingLevel"],
		setThinkingLevel: vi.fn() as unknown as ExtensionAPI["setThinkingLevel"],
		registerProvider: vi.fn() as unknown as ExtensionAPI["registerProvider"],
		unregisterProvider:
			vi.fn() as unknown as ExtensionAPI["unregisterProvider"],
		events: vi.fn() as unknown as ExtensionAPI["events"],
	};
	return pi;
}

// ── Test State Factory ──────────────────────────────────────────────────

export function createTestState(): PlanModeState {
	return createInitialState();
}
