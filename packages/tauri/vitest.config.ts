import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@donizetti/tauri",
    // Tauri's IPC mocks live on `window`.
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
