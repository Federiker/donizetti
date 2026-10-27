import { describe, expect, it } from "vitest";

import { type ScoreNote, type ScoreTiming, scoreNotes } from "../src/timing";
import { sheet, sheetOf } from "./sheet";

/** An invented one-part score: each measure's attributes, direction and notes as MusicXML. */
function score(...measures: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures.map((content, index) => `<measure number="${index + 1}">${content}</measure>`).join("")}</part>
</score-partwise>`;
}

const round = (note: ScoreNote) => ({
  ...note,
  time: Number(note.time.toFixed(3)),
  duration: Number(note.duration.toFixed(3)),
});

describe("playing a score", () => {
  it("times its notes in seconds by the tempo, ties sounding once, rests left out", async () => {
    const timing = scoreNotes(await sheet("simple.musicxml"));
    // 60 quarter notes a minute: a whole note lasts 4 seconds.
    expect(timing.duration).toBe(8);
    expect(timing.length).toBe(2);
    expect(timing.secondsAt(1.25)).toBe(5);
    expect(timing.notes.map(round)).toEqual([
      { time: 0, duration: 1, start: 0, length: 0.25, midi: 60, velocity: 63, channel: 0, program: 73 },
      { time: 2, duration: 3, start: 0.5, length: 0.75, midi: 69, velocity: 63, channel: 0, program: 73 },
      { time: 5, duration: 3, start: 1.25, length: 0.75, midi: 78, velocity: 63, channel: 0, program: 73 },
    ]);
    expect(timing.tempos).toEqual([{ start: 0, bpm: 60 }]);
    expect(timing.timeSignatures).toEqual([{ start: 0, beats: 4, beatType: 4 }]);
  });

  // Each measure of these scores is one whole note at 60 quarter notes a minute: four seconds.
  const order = (timing: ScoreTiming) => timing.notes.map((note) => [note.time, note.midi]);

  it("plays repeats and first and second endings as a performer reads them", async () => {
    const timing = scoreNotes(await sheet("repeats-and-endings.musicxml"));
    // |: C | 1. D :| 2. E |: F :| G
    expect(order(timing)).toEqual([
      [0, 60],
      [4, 62],
      [8, 60],
      [12, 64],
      [16, 65],
      [20, 65],
      [24, 67],
    ]);
    expect(timing.duration).toBe(28);
    // Played time goes on through the repeats: the second pass of the first measure starts at 8 seconds.
    expect(timing.secondsAt(2)).toBe(8);
    expect(timing.notes.map((note) => note.start)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // The tempo does not change, so it is written once.
    expect(timing.tempos).toEqual([{ start: 0, bpm: 60 }]);
  });

  it("goes back to the start at D.C. and stops at Fine, without taking the repeats again", async () => {
    const timing = scoreNotes(await sheet("da-capo-al-fine.musicxml"));
    // |: C :| D (Fine) | E (D.C. al Fine)
    expect(order(timing).map(([, midi]) => midi)).toEqual([60, 60, 62, 64, 60, 62]);
    expect(timing.duration).toBe(24);
  });

  it("goes back to the segno at D.S. and on to the coda at To Coda", async () => {
    const timing = scoreNotes(await sheet("dal-segno-al-coda.musicxml"));
    // C | 𝄋 D | E (To Coda) | F (D.S. al Coda) | 𝄌 G
    expect(order(timing).map(([, midi]) => midi)).toEqual([60, 62, 64, 65, 62, 64, 67]);
    expect(timing.duration).toBe(28);
  });

  it("plays unpitched percussion on channel 10 with each sound's midi-unpitched, silent without one", async () => {
    const timing = scoreNotes(await sheet("percussion.musicxml"));
    expect(timing.notes.map(({ start, length, ...note }) => note)).toEqual([
      // Bass Drum 1 is midi-unpitched 37 (counted from 1): MIDI key 36. The flute plays on its own channel.
      { time: 0, duration: 1, midi: 36, velocity: 63, channel: 9, program: 0 },
      { time: 0, duration: 4, midi: 69, velocity: 63, channel: 1, program: 73 },
      { time: 1, duration: 1, midi: 38, velocity: 63, channel: 9, program: 0 },
      // The cowbell has no midi-unpitched and the tambourine (a percussion clef, no MIDI sound) none at all.
      { time: 3, duration: 1, midi: 38, velocity: 63, channel: 9, program: 0 },
    ]);
  });

  it("follows the tempo and time signature from measure to measure, and keeps them as a map", async () => {
    const timing = scoreNotes(
      await sheetOf(
        score(
          `<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
           <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type><sound tempo="60"/></direction>
           <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><type>whole</type></note>`,
          `<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
           <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>
           <note><pitch><step>D</step><octave>4</octave></pitch><duration>6</duration><type>half</type><dot/></note>`,
          `<attributes><time><beats>6</beats><beat-type>8</beat-type></time></attributes>
           <note><pitch><step>E</step><octave>4</octave></pitch><duration>6</duration><type>half</type><dot/></note>`,
        ),
      ),
    );
    // A whole note at 60 (4 s), then three quarters at 120 (1.5 s), then six eighths at 120 (1.5 s).
    expect(timing.notes.map((note) => [note.time, note.duration, note.start, note.length, note.midi])).toEqual([
      [0, 4, 0, 1, 60],
      [4, 1.5, 1, 0.75, 62],
      [5.5, 1.5, 1.75, 0.75, 64],
    ]);
    expect(timing.duration).toBe(7);
    expect(timing.length).toBe(2.5);
    expect(timing.tempos).toEqual([
      { start: 0, bpm: 60 },
      { start: 1, bpm: 120 },
    ]);
    expect(timing.timeSignatures).toEqual([
      { start: 0, beats: 4, beatType: 4 },
      { start: 1, beats: 3, beatType: 4 },
      { start: 1.75, beats: 6, beatType: 8 },
    ]);
    // A part without a MIDI instrument plays on a piano.
    expect(timing.notes[0]).toMatchObject({ channel: 0, program: 0, velocity: 100 });
  });

  it("gives each part its own channel, leaving out the drums' and the previews'", async () => {
    const parts = Array.from({ length: 16 }, (_, index) => `P${index + 1}`);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>${parts.map((id) => `<score-part id="${id}"><part-name>${id}</part-name></score-part>`).join("")}</part-list>
  ${parts
    .map(
      (id) => `<part id="${id}"><measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
      </measure></part>`,
    )
    .join("")}
</score-partwise>`;
    const channels = scoreNotes(await sheetOf(xml)).notes.map((note) => note.channel);
    expect(channels.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 14, 14]);
  });

  it("plays a score without a tempo at 120 quarter notes a minute", async () => {
    const timing = scoreNotes(
      await sheetOf(
        score(
          `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
           <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>`,
        ),
      ),
    );
    expect(timing.tempos).toEqual([{ start: 0, bpm: 120 }]);
    expect(timing.duration).toBe(2);
  });

  it("times an empty score as nothing", async () => {
    const timing = scoreNotes(await sheetOf(score("")));
    expect(timing.notes).toEqual([]);
    expect(timing.secondsAt(1)).toBeGreaterThanOrEqual(0);
  });
});
