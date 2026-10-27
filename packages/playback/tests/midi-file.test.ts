import { describe, expect, it } from "vitest";

import { exportMidi, midiFile } from "../src/midi-file";
import { midiEvents, sheet } from "./sheet";

const TEMPO = 0x51;
const TIME_SIGNATURE = 0x58;
const END_OF_TRACK = 0x2f;

describe("MIDI files", () => {
  it("writes the notes on their beats with the instrument set first", () => {
    const notes = [
      { start: 0, length: 0.25, midi: 60, velocity: 90, channel: 0, program: 73 },
      { start: 0.25, length: 0.25, midi: 60, velocity: 90, channel: 0, program: 73 },
      { start: 0.25, length: 0.5, midi: 64, velocity: 80, channel: 10, program: 0 },
    ];
    expect(midiEvents(midiFile({ notes }))).toEqual([
      [0, 0xc0, 73],
      [0, 0xca, 0],
      [0, 0x90, 60, 90],
      // The first C ends before the second begins at the same tick.
      [480, 0x80, 60, 0],
      [480, 0x90, 60, 90],
      [480, 0x9a, 64, 80],
      [960, 0x80, 60, 0],
      [1440, 0x8a, 64, 0],
      [1440, 0xff, END_OF_TRACK],
    ]);
  });

  it("writes the tempo map and time signatures, and ends the track at the end of the score", () => {
    const bytes = midiFile({
      notes: [{ start: 0, length: 0, midi: 72, velocity: 100, channel: 0, program: 0 }],
      tempos: [
        { start: 0, bpm: 60 },
        { start: 1, bpm: 90 },
      ],
      timeSignatures: [
        { start: 0, beats: 4, beatType: 4 },
        { start: 1, beats: 6, beatType: 8 },
        // MIDI cannot write a beat type that is not a power of two: left out.
        { start: 2, beats: 3, beatType: 10 },
      ],
      length: 3,
    });
    // The header: format 0, one track, 480 ticks a quarter note.
    expect([...bytes.slice(8, 14)]).toEqual([0, 0, 0, 1, 0x01, 0xe0]);
    expect(midiEvents(bytes)).toEqual([
      // 1 000 000 µs a quarter note.
      [0, 0xff, TEMPO, 0x0f, 0x42, 0x40],
      [0, 0xff, TIME_SIGNATURE, 4, 2, 24, 8],
      [0, 0xc0, 0],
      [0, 0x90, 72, 100],
      // A note of no length still lasts a tick.
      [1, 0x80, 72, 0],
      // 666 667 µs a quarter note.
      [1920, 0xff, TEMPO, 0x0a, 0x2c, 0x2b],
      [1920, 0xff, TIME_SIGNATURE, 6, 3, 12, 8],
      [5760, 0xff, END_OF_TRACK],
    ]);
  });

  it("writes long gaps as variable-length deltas", () => {
    const bytes = midiFile({ notes: [{ start: 100, length: 1, midi: 60, velocity: 1, channel: 0, program: 0 }] });
    expect(midiEvents(bytes).map(([tick]) => tick)).toEqual([0, 192_000, 193_920, 193_920]);
  });

  it("exports a score as played, with its tempo, repeats unrolled", async () => {
    const events = midiEvents(exportMidi(await sheet("repeats-and-endings.musicxml")));
    expect(events.filter((event) => event[1] === 0xff && event[2] === TEMPO)).toEqual([
      [0, 0xff, TEMPO, 0x0f, 0x42, 0x40],
    ]);
    // |: C | 1. D :| 2. E |: F :| G, a whole note (1920 ticks) each.
    expect(events.filter((event) => (event[1]! & 0xf0) === 0x90).map(([tick, , key]) => [tick, key])).toEqual([
      [0, 60],
      [1920, 62],
      [3840, 60],
      [5760, 64],
      [7680, 65],
      [9600, 65],
      [11_520, 67],
    ]);
    expect(events.at(-1)).toEqual([13_440, 0xff, END_OF_TRACK]);
  });
});
