import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [react()],
  test: {
    name: "@donizetti/react",
    // jsdom for its XML DOM (the score is a MusicXML document); OSMD's drawing is replaced in these tests,
    // and checked in a real browser by the end-to-end tests.
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
  },
});
