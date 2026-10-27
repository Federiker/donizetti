import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@donizetti/musicxml",
    // jsdom's DOMParser and XMLSerializer follow the XML rules the browsers do (happy-dom's do not).
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
