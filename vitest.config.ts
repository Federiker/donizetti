import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every package's tests in one run (`mise run test`); each package keeps its own config for its
    // environment and setup, and `bun run --filter <package> test` still runs one package alone.
    projects: ["packages/*"],
    // `mise run coverage` (and CI): the packages' sources must stay at 80% or more on every measure
    // (owner decision, 27 October 2026; see docs/development.md, decision 13).
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      // The demo app is exercised by the end-to-end tests, not counted here.
      exclude: ["packages/app/**", "packages/*/src/index.ts"],
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
