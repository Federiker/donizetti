import type { Sequencer, WorkletSynthesizer } from "spessasynth_lib";

import { type NotePreviewer, notePreviewer, type PreviewOptions, previewSettings } from "./preview";

export type ScoreEngineOptions = {
  /**
   * The soundfont's bytes (SF2, SF3 or DLS), from the host (decision 10): called once, when the engine first
   * starts, and again only if that start failed. The bytes are copied, so the host may keep them.
   */
  soundfont: () => Promise<ArrayBuffer | Uint8Array>;
  /**
   * Where SpessaSynth's AudioWorklet processor (`spessasynth_lib/dist/spessasynth_processor.min.js`) is served.
   * By default the bundler serves it beside the app (Vite's `?url` import); a host that serves the file itself,
   * or whose bundler has no `?url`, gives its address here.
   */
  processorUrl?: string;
  /** The audio context to play in; by default the engine makes its own when it starts and closes it when disposed. */
  context?: AudioContext;
};

/** A score loaded into the engine: start, pause, go back to the beginning, move to a moment, and where it is. */
export type ScorePlayback = {
  /** Plays from where it is (resuming the audio context, so call it from a user's gesture). */
  play: () => Promise<void>;
  pause: () => void;
  /** Pauses and goes back to the start. */
  stop: () => void;
  /** Moves to this many seconds from the start, playing on if it was playing. */
  seek: (seconds: number) => void;
  /** Seconds from the start, smoothed for following with a cursor. */
  time: () => number;
  paused: () => boolean;
};

/**
 * The sound of scores: SpessaSynth in an AudioWorklet with the host's soundfont. Nothing starts until it is
 * first used (`start`, `load` or `previewNote`); a failed start is forgotten so the next call tries again.
 */
export type ScoreEngine = {
  /** Starts the engine now (loading the soundfont), rather than on first use. */
  start: () => Promise<void>;
  /**
   * Loads a MIDI file (from `midiFile` or `exportMidi`) to play, paused at its start. One score plays at a time:
   * loading another, or disposing the engine, ends this one, whose `play` then rejects and which stays paused at 0.
   */
  load: (midi: Uint8Array, name?: string) => Promise<ScorePlayback>;
  /**
   * Sounds one note, as when the user enters or selects it, apart from the score being played. Resolves when the
   * note starts; rejects with a `RangeError` for a key or option out of range.
   */
  previewNote: (midi: number, options?: PreviewOptions) => Promise<void>;
  /**
   * Stops the sound and releases the synthesiser, and the audio context when the engine made it. A start under
   * way rejects with an `AbortError`. The next call starts the engine again.
   */
  dispose: () => void;
};

/** The engine once started. */
type Running = {
  context: AudioContext;
  synth: WorkletSynthesizer;
  sequencer: Sequencer;
  preview: NotePreviewer;
};

/**
 * The processor's address as Vite serves it: emitted as an asset in a build, served from `node_modules` by the
 * dev server. Vite's dev server refuses `?url` for a file outside `server.fs.allow` (a Donizetti checkout linked
 * from outside the app's workspace) and serves the processor itself instead, which then fails to run as a module
 * of the page; the error says what to do.
 */
async function bundledProcessorUrl(): Promise<string> {
  try {
    return (await import("spessasynth_lib/dist/spessasynth_processor.min.js?url")).default;
  } catch (cause) {
    throw new Error(
      "SpessaSynth's AudioWorklet processor could not be found with Vite's `?url` import: in Vite's dev server, " +
        "add the folder Donizetti is installed from to `server.fs.allow`, or give the engine a `processorUrl`.",
      { cause },
    );
  }
}

/** The soundfont's bytes in an `ArrayBuffer` of their own: SpessaSynth takes the buffer it is given. */
function ownBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).slice().buffer;
}

function disposed(): DOMException {
  return new DOMException("The score engine was disposed while it started.", "AbortError");
}

/** Makes the score engine; see `ScoreEngine`. Nothing is loaded until it is first used. */
export function createScoreEngine(options: ScoreEngineOptions): ScoreEngine {
  let engine: Promise<Running> | null = null;
  /** Counts disposals, so a start that finishes after one knows it is no longer wanted. */
  let generation = 0;
  /** The playback of the score loaded last; earlier ones are over. */
  let current: object | null = null;

  /** Closes the audio context if the engine made it. */
  const release = (context: AudioContext) => {
    if (!options.context) context.close().catch(() => undefined);
  };
  const teardown = (running: Running) => {
    running.preview.stop();
    running.sequencer.pause();
    running.synth.destroy();
    release(running.context);
  };

  async function boot(): Promise<Running> {
    // The soundfont is fetched while the worklet loads; a failure is reported where it is awaited.
    const soundfont = Promise.resolve().then(options.soundfont);
    soundfont.catch(() => undefined);
    const [{ WorkletSynthesizer: Synthesizer, Sequencer: Player }, processorUrl] = await Promise.all([
      import("spessasynth_lib"),
      options.processorUrl ?? bundledProcessorUrl(),
    ]);
    const context = options.context ?? new AudioContext();
    let synth: WorkletSynthesizer | null = null;
    try {
      await context.audioWorklet.addModule(processorUrl);
      synth = new Synthesizer(context);
      synth.connect(context.destination);
      await synth.isReady;
      await synth.soundBankManager.addSoundBank(ownBuffer(await soundfont), "main");
      return {
        context,
        synth,
        sequencer: new Player(synth, { skipToFirstNoteOn: false }),
        preview: notePreviewer(synth),
      };
    } catch (cause) {
      synth?.destroy();
      release(context);
      throw cause;
    }
  }

  /** The running engine, started on first use; rejects with an `AbortError` when disposed meanwhile. */
  async function ready(): Promise<Running> {
    const asked = generation;
    if (!engine) {
      const starting: Promise<Running> = boot().then(
        (started) => {
          if (generation === asked) return started;
          teardown(started);
          throw disposed();
        },
        (cause: unknown) => {
          if (engine === starting) engine = null;
          throw cause;
        },
      );
      engine = starting;
    }
    const started = await engine;
    if (generation !== asked) throw disposed();
    return started;
  }

  return {
    start: async () => {
      await ready();
    },
    load: async (midi, name = "score") => {
      const { context, sequencer } = await ready();
      const token = {};
      current = token;
      const live = () => current === token;
      sequencer.loadNewSongList([{ binary: ownBuffer(midi), fileName: `${name}.mid` }]);
      sequencer.loopCount = 0;
      sequencer.pause();
      sequencer.currentTime = 0;
      return {
        play: async () => {
          if (!live()) throw new DOMException("Another score was loaded, or the engine was disposed.", "AbortError");
          await context.resume();
          sequencer.play();
        },
        pause: () => {
          if (live()) sequencer.pause();
        },
        stop: () => {
          if (!live()) return;
          sequencer.pause();
          sequencer.currentTime = 0;
        },
        seek: (seconds) => {
          if (live()) sequencer.currentTime = seconds;
        },
        time: () => (live() ? sequencer.currentHighResolutionTime : 0),
        paused: () => !live() || sequencer.paused,
      };
    },
    previewNote: async (midi, previewOptions) => {
      const note = previewSettings(midi, previewOptions);
      const { context, preview } = await ready();
      await context.resume();
      preview.play(note);
    },
    dispose: () => {
      generation += 1;
      current = null;
      const was = engine;
      engine = null;
      void was?.then(teardown, () => undefined);
    },
  };
}
