import { describe, expect, it } from "vitest";

import { mapScore, midiOf, noteAt, readScore } from "../../src";
import { fixture, score } from "../fixtures";

const note = (step: string, duration: number, extra = "") =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration>${extra}</note>`;

describe("mapScore", () => {
  it("maps the lead sheet's measures, keys, times and notes", () => {
    for (const path of ["invented/lead-sheet.musicxml", "musescore/lead-sheet.musicxml"]) {
      const map = mapScore(readScore(fixture(path)).root)!;
      expect(map.partId).toBe("P1");
      expect(map.measures).toHaveLength(4);
      const [first, second, third] = map.measures;
      expect(first!.fifths).toBe(1);
      expect(first!.time).toEqual({ beats: 4, beatType: 4 });
      expect(first!.expectedLength).toBe(1);
      expect(first!.length).toBe(1);
      expect(first!.notes.map((mapped) => mapped.onset)).toEqual([0, 0.25, 0.375, 0.5]);
      expect(second!.notes[1]!.pitch).toEqual({ step: "F", alter: 1, octave: 4 });
      expect(third!.notes[1]!.rest).toBe(true);
      expect(third!.notes[2]!.length).toBe(0.375);
    }
  });

  it("follows chords, grace notes, backup and forward", () => {
    const map = mapScore(
      readScore(
        score(
          `<attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>` +
            note("C", 1) +
            note("E", 1, "<chord/>") +
            `<note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>` +
            note("F", 2) +
            `<backup><duration>3</duration></backup>` +
            `<forward><duration>1</duration></forward>` +
            note("G", 2, "<voice>2</voice>"),
        ),
      ).root,
    )!;
    const notes = map.measures[0]!.notes;
    expect(notes.map((mapped) => [mapped.pitch!.step, mapped.onset, mapped.chord, mapped.grace])).toEqual([
      ["C", 0, false, false],
      ["E", 0, true, false],
      ["D", 0.25, false, true],
      ["F", 0.25, false, false],
      ["G", 0.25, false, false],
    ]);
    expect(notes[4]!.voice).toBe("2");
    expect(map.measures[0]!.expectedLength).toBe(0.75);
  });

  it("reads composite time signatures, senza misura and pickups", () => {
    const text = score(
      `<attributes><divisions>1</divisions><time><beats>3+2</beats><beat-type>8</beat-type></time></attributes>`,
      `<attributes><time><beats>2</beats><beat-type>4</beat-type><beats>3</beats><beat-type>8</beat-type></time></attributes>`,
      `<attributes><time><senza-misura/></time></attributes>`,
    ).replace(`<measure number="1">`, `<measure number="0" implicit="yes">`);
    const map = mapScore(readScore(text).root)!;
    expect(map.measures.map((measure) => measure.expectedLength)).toEqual([5 / 8, 7 / 8, null]);
    expect(map.measures[0]!.implicit).toBe(true);
    expect(map.measures[0]!.number).toBe("0");
    expect(map.measures[2]!.time).toBeNull();
  });

  it("is null without the part asked for", () => {
    expect(mapScore(readScore(score()).root, 3)).toBeNull();
  });
});

describe("noteAt", () => {
  const map = mapScore(
    readScore(
      score(
        `<attributes><divisions>1</divisions></attributes>` +
          `<note><grace/><pitch><step>B</step><octave>3</octave></pitch></note>` +
          note("C", 1) +
          note("G", 1, "<chord/>") +
          `<note><rest/><duration>1</duration></note>`,
      ),
    ).root,
  )!;

  it("finds the note starting at a moment, a timed note before a grace note", () => {
    expect(noteAt(map, 0, 0)!.pitch!.step).toBe("C");
    expect(noteAt(map, 0, 0.25)!.rest).toBe(true);
    expect(noteAt(map, 0, 0.1)).toBeNull();
    expect(noteAt(map, 9, 0)).toBeNull();
  });

  it("picks the nearest pitch in a chord, and filters by voice and staff", () => {
    expect(noteAt(map, 0, 0, { midi: 66 })!.pitch!.step).toBe("G");
    expect(noteAt(map, 0, 0, { midi: 61 })!.pitch!.step).toBe("C");
    expect(noteAt(map, 0, 0.25, { midi: 61 })!.rest).toBe(true);
    expect(noteAt(map, 0, 0, { voice: "2" })).toBeNull();
    expect(noteAt(map, 0, 0, { staff: 1, voice: "1" })!.pitch!.step).toBe("C");
  });

  it("numbers pitches as MIDI does", () => {
    expect(midiOf({ step: "C", alter: 0, octave: 4 })).toBe(60);
    expect(midiOf({ step: "F", alter: 1, octave: 5 })).toBe(78);
    expect(midiOf({ step: "B", alter: -1, octave: 3 })).toBe(58);
  });
});
