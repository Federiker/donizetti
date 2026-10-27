import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@donizetti/playback",
    // OpenSheetMusicDisplay reads a score with the DOM; the engine's tests mock SpessaSynth and the audio context.
    environment: "happy-dom",
    restoreMocks: true,
  },
});
