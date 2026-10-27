import { describe, expect, it, vi } from "vitest";

import { createScoreEngine } from "../src/engine";

// Vite's dev server serves the processor itself for a `?url` it refuses (outside `server.fs.allow`): the page
// then runs it as a module, where the worklet's globals are missing.
vi.mock("spessasynth_lib/dist/spessasynth_processor.min.js?url", () => {
  throw new ReferenceError("AudioWorkletProcessor is not defined");
});
vi.mock("spessasynth_lib", () => ({ WorkletSynthesizer: class {}, Sequencer: class {} }));

describe("the score engine's processor", () => {
  it("says what to do when the bundler cannot give the processor's address", async () => {
    const engine = createScoreEngine({ soundfont: async () => new Uint8Array(4) });
    const failure = await engine.start().then(
      () => null,
      (error: unknown) => error as Error,
    );
    expect(failure?.message).toMatch(/server\.fs\.allow.*processorUrl/);
    // The import's own error is kept as the cause (Vitest wraps a mock's error in its own).
    expect(failure?.cause).toBeInstanceOf(Error);
  });
});
