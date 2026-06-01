import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		extensions: [".ts", ".js"],
	},
	test: {
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["extensions/plan-mode/**/*.ts"],
			exclude: ["extensions/plan-mode/index.ts"],
		},
	},
});
