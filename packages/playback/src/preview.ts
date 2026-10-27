import type { WorkletSynthesizer } from "spessasynth_lib";

/** How a note entered or selected in the editor is sounded. */
export type PreviewOptions = {
  /** How loud, 1 to 127; 100 by default (a part at full volume). */
  velocity?: number;
  /** How long it sounds, in milliseconds; half a second by default. */
  durationMs?: number;
  /** The General MIDI instrument, 0 to 127 (the part's `<midi-program>` less one); a piano by default. */
  program?: number;
  /**
   * The synthesiser channel, 0 to 15, for a note that must sound on the score's own channel (9 for General
   * MIDI's drums); its instrument is then changed only when `program` is given. Without it the note sounds on
   * the preview channel, which no score uses, so a preview never changes how the score plays.
   */
  channel?: number;
};

/**
 * The channel previews sound on: the last of the synthesiser's 16 (numbered 15 from 0), which `scoreNotes` leaves
 * out, so the fifteenth part and those after it share the fourteenth part's channel. A 17th channel would keep all
 * 16 for the score, but SpessaSynth 4.4 reports a new channel's settings before the channel itself, and the page
 * then throws for each one.
 */
export const PREVIEW_CHANNEL = 15;

const DEFAULT_VELOCITY = 100;
const DEFAULT_DURATION_MS = 500;

/** A preview with its options checked and filled in. */
export type PreviewSettings = { midi: number; velocity: number; durationMs: number; program?: number; channel: number };

function checkInteger(name: string, value: number, low: number, high: number): number {
  if (!Number.isInteger(value) || value < low || value > high)
    throw new RangeError(`A note preview's ${name} must be a whole number from ${low} to ${high}, not ${value}.`);
  return value;
}

/** The preview a call asks for, or a `RangeError` naming the value out of range. */
export function previewSettings(midi: number, options: PreviewOptions = {}): PreviewSettings {
  const ownChannel = options.channel === undefined;
  const channel = ownChannel ? PREVIEW_CHANNEL : checkInteger("channel", options.channel!, 0, 15);
  const program = options.program ?? (ownChannel ? 0 : undefined);
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    throw new RangeError(`A note preview's durationMs must be more than 0, not ${durationMs}.`);
  return {
    midi: checkInteger("key", midi, 0, 127),
    velocity: checkInteger("velocity", options.velocity ?? DEFAULT_VELOCITY, 1, 127),
    durationMs,
    ...(program === undefined ? {} : { program: checkInteger("program", program, 0, 127) }),
    channel,
  };
}

/** What a preview needs of the synthesiser. */
type PreviewSynth = Pick<WorkletSynthesizer, "noteOn" | "noteOff" | "programChange">;

/** Sounds notes on the synthesiser, apart from the sequencer, each stopped after its time. */
export type NotePreviewer = {
  play: (note: PreviewSettings) => void;
  /** Stops every note still sounding. */
  stop: () => void;
};

/**
 * Plays previews: note on, then note off after its time. The same key played again on the same channel before
 * it ends starts again, so the earlier note's end does not cut the later one short.
 */
export function notePreviewer(synth: PreviewSynth): NotePreviewer {
  /** The timer that ends each sounding note, by channel and key. */
  const sounding = new Map<number, { channel: number; midi: number; timer: ReturnType<typeof setTimeout> }>();
  const end = (channel: number, midi: number) => {
    const key = channel * 128 + midi;
    const note = sounding.get(key);
    if (!note) return;
    clearTimeout(note.timer);
    sounding.delete(key);
    synth.noteOff(channel, midi);
  };
  return {
    play: ({ midi, velocity, durationMs, program, channel }) => {
      end(channel, midi);
      if (program !== undefined) synth.programChange(channel, program);
      synth.noteOn(channel, midi, velocity);
      sounding.set(channel * 128 + midi, { channel, midi, timer: setTimeout(() => end(channel, midi), durationMs) });
    },
    stop: () => {
      for (const { channel, midi } of [...sounding.values()]) end(channel, midi);
    },
  };
}
