import { describe, expect, it, type vi } from "vitest";
import { createMockPi } from "./helpers.ts";

describe("extension bootstrap", () => {
	it("registers all components without throwing", async () => {
		const pi = createMockPi();
		// Dynamic import to get fresh state each test
		const mod = await import("../extensions/plan-mode/index.ts");
		expect(() => mod.default(pi)).not.toThrow();
	});

	it("registers message renderer for plan-content", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/plan-mode/index.ts");
		mod.default(pi);

		expect(pi.registerMessageRenderer).toHaveBeenCalledWith(
			"plan-content",
			expect.any(Function),
		);
	});

	it("registers --plan CLI flag", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/plan-mode/index.ts");
		mod.default(pi);

		expect(pi.registerFlag).toHaveBeenCalledWith(
			"plan",
			expect.objectContaining({ type: "boolean" }),
		);
	});

	it("registers Ctrl+Alt+P shortcut", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/plan-mode/index.ts");
		mod.default(pi);

		expect(pi.registerShortcut).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				description: expect.stringContaining("plan mode"),
			}),
		);
	});

	it("registers all three commands", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/plan-mode/index.ts");
		mod.default(pi);

		const commandNames = (
			pi.registerCommand as ReturnType<typeof vi.fn>
		).mock.calls.map((c: unknown[]) => c[0]);
		expect(commandNames).toContain("plan");
		expect(commandNames).toContain("plans");
		expect(commandNames).toContain("execute_plan");
	});

	it("registers all four tools", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/plan-mode/index.ts");
		mod.default(pi);

		const toolNames = (
			pi.registerTool as ReturnType<typeof vi.fn>
		).mock.calls.map((c: unknown[]) => (c[0] as { name: string }).name);
		expect(toolNames).toContain("plan_write");
		expect(toolNames).toContain("plan_read");
		expect(toolNames).toContain("plan_list");
		expect(toolNames).toContain("plan_question");
	});

	it("registers all six event hooks", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/plan-mode/index.ts");
		mod.default(pi);

		const eventNames = (pi.on as ReturnType<typeof vi.fn>).mock.calls.map(
			(c: unknown[]) => c[0],
		);
		expect(eventNames).toContain("tool_call");
		expect(eventNames).toContain("before_agent_start");
		expect(eventNames).toContain("turn_end");
		expect(eventNames).toContain("agent_end");
		expect(eventNames).toContain("session_start");
		expect(eventNames).toContain("context");
	});
});
