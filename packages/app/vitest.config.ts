import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@donizetti/app",
    // Tauri's IPC mocks live on `window`. The app as a whole is tested end to end, in the browser; these
    // tests cover the Tauri host, which only the native window runs.
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
