import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      // Product logic must stay covered. UI and route wiring are covered by
      // e2e tests; repo tooling in scripts/ is tested but not gated.
      include: ["src/**/*.ts"],
      exclude: ["src/app/**", "**/*.test.*", "**/*.d.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
