import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    // The scripts' pure parts (the release's versions), in the root's run (`mise run test`).
    name: "scripts",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
