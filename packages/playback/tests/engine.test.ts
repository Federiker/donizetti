import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createScoreEngine, type ScoreEngineOptions } from "../src/engine";
import { PREVIEW_CHANNEL } from "../src/preview";

// SpessaSynth needs a real AudioWorklet: its synthesiser and sequencer are stood in for by fakes that record calls.
const made = vi.hoisted(() => ({ synths: [] as FakeSynth[], sequencers: [] as FakeSequencer[] }));

type FakeSynth = {
  [name in "connect" | "destroy" | "noteOn" | "noteOff" | "programChange"]: ReturnType<typeof vi.fn>;
} & { soundBankManager: { addSoundBank: ReturnType<typeof vi.fn> }; context: unknown };
type FakeSequencer = {
  synth: unknown;
  options: unknown;
  loadNewSongList: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  loopCount: number;
  currentTime: number;
  currentHighResolutionTime: number;
  paused: boolean;
};

vi.mock("spessasynth_lib", () => {
  class WorkletSynthesizer {
    isReady = Promise.resolve();
    connect = vi.fn();
    destroy = vi.fn();
    noteOn = vi.fn();
    noteOff = vi.fn();
    programChange = vi.fn();
    soundBankManager = { addSoundBank: vi.fn(async () => {}) };
    constructor(public context: unknown) {
      made.synths.push(this as never);
    }
  }
  class Sequencer {
    loopCount = 1;
    currentTime = 3;
    currentHighResolutionTime = 1.25;
    paused = true;
    loadNewSongList = vi.fn();
    play = vi.fn(() => {
      this.paused = false;
    });
    pause = vi.fn(() => {
      this.paused = true;
    });
    constructor(
      public synth: unknown,
      public options: unknown,
    ) {
      made.sequencers.push(this as never);
    }
  }
  return { WorkletSynthesizer, Sequencer };
});

function fakeContext() {
  return {
    destination: { kind: "speakers" },
    audioWorklet: { addModule: vi.fn(async (_url: string) => {}) },
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}
type FakeContext = ReturnType<typeof fakeContext>;

/** The audio contexts the engine made itself. */
let contexts: FakeContext[] = [];

beforeEach(() => {
  made.synths.length = 0;
  made.sequencers.length = 0;
  contexts = [];
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        const context = fakeContext();
        contexts.push(context);
        // biome-ignore lint/correctness/noConstructorReturn: the fake stands in for the browser's context.
        return context;
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const soundfontBytes = () => new Uint8Array([0x52, 0x49, 0x46, 0x46]);

function engineWith(options: Partial<ScoreEngineOptions> = {}) {
  const soundfont = vi.fn(async () => soundfontBytes() as ArrayBuffer | Uint8Array);
  const engine = createScoreEngine({ soundfont, processorUrl: "/processor.js", ...options });
  return { engine, soundfont: (options.soundfont as typeof soundfont | undefined) ?? soundfont };
}

describe("the score engine", () => {
  it("starts on first use: the worklet, the synthesiser with the host's soundfont, the sequencer", async () => {
    const host = soundfontBytes();
    const { engine } = engineWith({ soundfont: vi.fn(async () => host) });
    expect(made.synths).toHaveLength(0);
    await engine.start();
    const [context] = contexts;
    const [synth] = made.synths;
    expect(context!.audioWorklet.addModule).toHaveBeenCalledWith("/processor.js");
    expect(synth!.context).toBe(context);
    expect(synth!.connect).toHaveBeenCalledWith(context!.destination);
    const [buffer, id] = synth!.soundBankManager.addSoundBank.mock.calls[0]!;
    // SpessaSynth takes the buffer it is given: the engine gives it a copy, so the host's bytes stay usable.
    expect(buffer).not.toBe(host.buffer);
    expect([...new Uint8Array(buffer as ArrayBuffer)]).toEqual([...host]);
    expect(id).toBe("main");
    expect(made.sequencers[0]).toMatchObject({ synth, options: { skipToFirstNoteOn: false } });
  });

  it("starts once however often it is used", async () => {
    const { engine, soundfont } = engineWith();
    await Promise.all([engine.start(), engine.load(new Uint8Array([1])), engine.previewNote(60)]);
    await engine.load(new Uint8Array([2]));
    expect(soundfont).toHaveBeenCalledTimes(1);
    expect(made.synths).toHaveLength(1);
  });

  it("loads SpessaSynth's processor from where the bundler serves it by default", async () => {
    const engine = createScoreEngine({ soundfont: async () => soundfontBytes() });
    await engine.start();
    expect(contexts[0]!.audioWorklet.addModule.mock.calls[0]![0]).toMatch(/spessasynth_processor\.min\.js/);
  });

  it("plays in the host's audio context, and leaves it open when disposed", async () => {
    const context = fakeContext();
    const { engine } = engineWith({ context: context as unknown as AudioContext });
    await engine.start();
    expect(contexts).toHaveLength(0);
    expect(context.audioWorklet.addModule).toHaveBeenCalled();
    engine.dispose();
    await vi.waitFor(() => expect(made.synths[0]!.destroy).toHaveBeenCalled());
    expect(context.close).not.toHaveBeenCalled();
  });

  it("forgets a failed start, so the next use starts again", async () => {
    const soundfont = vi
      .fn<() => Promise<Uint8Array>>()
      .mockRejectedValueOnce(new Error("no soundfont"))
      .mockResolvedValue(soundfontBytes());
    const { engine } = engineWith({ soundfont });
    await expect(engine.load(new Uint8Array([1]))).rejects.toThrow("no soundfont");
    // What the failed start made is released.
    expect(made.synths[0]!.destroy).toHaveBeenCalled();
    expect(contexts[0]!.close).toHaveBeenCalled();
    await engine.load(new Uint8Array([1]));
    expect(soundfont).toHaveBeenCalledTimes(2);
    expect(made.synths).toHaveLength(2);
  });

  it("reports a soundfont function that throws as a failed start", async () => {
    const { engine } = engineWith({
      soundfont: () => {
        throw new Error("not downloaded");
      },
    });
    await expect(engine.start()).rejects.toThrow("not downloaded");
  });

  describe("a loaded score", () => {
    it("is loaded paused at its start, with its name", async () => {
      const { engine } = engineWith();
      const midi = new Uint8Array([9, 8, 7, 6]).subarray(1, 3);
      await engine.load(midi, "song");
      const [sequencer] = made.sequencers;
      const [[[{ binary, fileName }]]] = sequencer!.loadNewSongList.mock.calls as [
        [{ binary: ArrayBuffer; fileName: string }],
      ][];
      expect([...new Uint8Array(binary)]).toEqual([8, 7]);
      expect(fileName).toBe("song.mid");
      expect(sequencer).toMatchObject({ loopCount: 0, paused: true, currentTime: 0 });
    });

    it("plays, pauses, stops, moves and tells where it is", async () => {
      const { engine } = engineWith();
      const playback = await engine.load(new Uint8Array([1]));
      const [sequencer] = made.sequencers;
      await playback.play();
      expect(contexts[0]!.resume).toHaveBeenCalled();
      expect(playback.paused()).toBe(false);
      playback.seek(12.5);
      expect(sequencer!.currentTime).toBe(12.5);
      expect(playback.time()).toBe(1.25);
      playback.pause();
      expect(playback.paused()).toBe(true);
      await playback.play();
      playback.stop();
      expect(sequencer).toMatchObject({ paused: true, currentTime: 0 });
    });

    it("is over once another score is loaded", async () => {
      const { engine } = engineWith();
      const first = await engine.load(new Uint8Array([1]), "first");
      const second = await engine.load(new Uint8Array([2]), "second");
      await second.play();
      const [sequencer] = made.sequencers;
      sequencer!.currentTime = 4;
      first.pause();
      first.stop();
      first.seek(1);
      expect(sequencer).toMatchObject({ paused: false, currentTime: 4 });
      expect(first.paused()).toBe(true);
      expect(first.time()).toBe(0);
      await expect(first.play()).rejects.toMatchObject({ name: "AbortError" });
    });
  });

  describe("note previews", () => {
    it("sound one note on the preview channel once the engine has started", async () => {
      const { engine } = engineWith();
      await engine.previewNote(60, { velocity: 80, program: 73 });
      const [synth] = made.synths;
      expect(contexts[0]!.resume).toHaveBeenCalled();
      expect(synth!.programChange).toHaveBeenCalledWith(PREVIEW_CHANNEL, 73);
      expect(synth!.noteOn).toHaveBeenCalledWith(PREVIEW_CHANNEL, 60, 80);
    });

    it("refuse a key out of range without starting the engine", async () => {
      const { engine, soundfont } = engineWith();
      await expect(engine.previewNote(200)).rejects.toThrow(RangeError);
      expect(soundfont).not.toHaveBeenCalled();
    });
  });

  describe("disposing", () => {
    it("stops the sound and releases the synthesiser and its own audio context; the next use starts again", async () => {
      vi.useFakeTimers();
      try {
        const { engine } = engineWith();
        const playback = await engine.load(new Uint8Array([1]));
        await engine.previewNote(64);
        await playback.play();
        engine.dispose();
        await vi.waitFor(() => expect(made.synths[0]!.destroy).toHaveBeenCalled());
        expect(made.synths[0]!.noteOff).toHaveBeenCalledWith(PREVIEW_CHANNEL, 64);
        expect(made.sequencers[0]!.paused).toBe(true);
        expect(contexts[0]!.close).toHaveBeenCalled();
        expect(playback.paused()).toBe(true);
        await expect(playback.play()).rejects.toMatchObject({ name: "AbortError" });
        await engine.start();
        expect(made.synths).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("ends a start under way with an AbortError and releases what it made", async () => {
      let deliver: (bytes: Uint8Array) => void = () => {};
      const { engine } = engineWith({
        soundfont: () =>
          new Promise<Uint8Array>((resolve) => {
            deliver = resolve;
          }),
      });
      const loading = engine.load(new Uint8Array([1]));
      await vi.waitFor(() => expect(made.synths).toHaveLength(1));
      engine.dispose();
      deliver(soundfontBytes());
      await expect(loading).rejects.toMatchObject({ name: "AbortError" });
      expect(made.synths[0]!.destroy).toHaveBeenCalledTimes(1);
      expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
    });

    it("ends a call that was waiting for the started engine", async () => {
      const { engine } = engineWith();
      await engine.start();
      const loading = engine.load(new Uint8Array([1]));
      engine.dispose();
      await expect(loading).rejects.toMatchObject({ name: "AbortError" });
      expect(made.sequencers[0]!.loadNewSongList).not.toHaveBeenCalled();
    });

    it("does nothing before the engine has started", () => {
      const { engine } = engineWith();
      expect(() => engine.dispose()).not.toThrow();
      expect(contexts).toHaveLength(0);
    });
  });
});
