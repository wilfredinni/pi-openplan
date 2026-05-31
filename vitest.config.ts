import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		setupFiles: ["tests/setup.ts"],
		coverage: {
			provider: "v8",
			include: ["extensions/plan-mode/**/*.ts"],
			exclude: ["extensions/plan-mode/index.ts"],
			reporter: ["text", "lcov", "html"],
			thresholds: {
				lines: 50,
				branches: 45,
			},
		},
	},
	resolve: {
		conditions: ["bundler"],
	},
});
