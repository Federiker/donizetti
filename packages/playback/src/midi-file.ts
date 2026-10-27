import type { MusicSheet } from "opensheetmusicdisplay";

import { type ScoreNote, scoreNotes, type TempoChange, type TimeSignatureChange } from "./timing";

/** What a MIDI file is written from: the notes in whole notes as played, the tempo map and the time signatures. */
export type MidiScore = {
  notes: readonly Pick<ScoreNote, "start" | "length" | "midi" | "velocity" | "channel" | "program">[];
  /** Quarter notes a minute from each point; 120 (MIDI's default) without any. */
  tempos?: readonly TempoChange[];
  timeSignatures?: readonly TimeSignatureChange[];
  /** The length of the score in whole notes, so the file ends with it, rests and all; else at the last note. */
  length?: number;
};

/** Ticks per quarter note. */
const PPQ = 480;
const TICKS_PER_WHOLE_NOTE = 4 * PPQ;

/** A whole-note position as a tick. */
function tickOf(whole: number): number {
  return Math.round(whole * TICKS_PER_WHOLE_NOTE);
}

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

function word(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** A Set Tempo meta event: microseconds a quarter note. */
function tempoEvent(bpm: number): number[] {
  const microseconds = Math.min(0xffffff, Math.max(1, Math.round(60_000_000 / bpm)));
  return [0xff, 0x51, 0x03, (microseconds >> 16) & 0xff, (microseconds >> 8) & 0xff, microseconds & 0xff];
}

/**
 * A Time Signature meta event, or null for one MIDI cannot write (its beat type must be a power of two): a
 * metronome click each beat type, eight 32nd notes a quarter.
 */
function timeSignatureEvent({ beats, beatType }: TimeSignatureChange): number[] | null {
  const power = Math.log2(beatType);
  if (!Number.isInteger(power) || power < 0 || power > 255 || !Number.isInteger(beats) || beats < 1 || beats > 255)
    return null;
  return [0xff, 0x58, 0x04, beats, power, Math.max(1, Math.round(96 / beatType)), 8];
}

/**
 * A standard MIDI file (format 0, one track) that plays the notes as the score times them: its tempo map and
 * time signatures as meta events, each channel set to its instrument at the start, the notes on their beats
 * (480 ticks a quarter note), and the end of the track at the end of the score.
 */
export function midiFile(score: MidiScore): Uint8Array {
  type Event = { tick: number; order: number; bytes: number[] };
  const events: Event[] = [];
  for (const tempo of score.tempos ?? [])
    events.push({ tick: tickOf(tempo.start), order: 0, bytes: tempoEvent(tempo.bpm) });
  for (const signature of score.timeSignatures ?? []) {
    const bytes = timeSignatureEvent(signature);
    if (bytes) events.push({ tick: tickOf(signature.start), order: 0, bytes });
  }
  const programs = new Map<number, number>();
  for (const note of score.notes) if (!programs.has(note.channel)) programs.set(note.channel, note.program);
  for (const [channel, program] of programs) events.push({ tick: 0, order: 0, bytes: [0xc0 | channel, program] });
  let end = tickOf(score.length ?? 0);
  for (const note of score.notes) {
    const on = tickOf(note.start);
    const off = Math.max(on + 1, tickOf(note.start + note.length));
    events.push({ tick: on, order: 2, bytes: [0x90 | note.channel, note.midi, note.velocity] });
    // A note ends before the next one starts at the same moment, so repeated notes are heard.
    events.push({ tick: off, order: 1, bytes: [0x80 | note.channel, note.midi, 0] });
    end = Math.max(end, off);
  }
  // Sorting is stable: events at the same tick and order keep the order they were added in.
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track: number[] = [];
  let last = 0;
  for (const event of events) {
    track.push(...variableLength(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  track.push(...variableLength(end - last), 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x68, 0x64, ...word(6), 0, 0, 0, 1, PPQ >> 8, PPQ & 0xff];
  return new Uint8Array([...header, 0x4d, 0x54, 0x72, 0x6b, ...word(track.length), ...track]);
}

/**
 * The whole score as a standard MIDI file, as it is played: repeats, endings, D.C. and D.S. unrolled, with the
 * score's tempo map, time signatures and instruments (`scoreNotes`).
 */
export function exportMidi(sheet: MusicSheet): Uint8Array {
  return midiFile(scoreNotes(sheet));
}
