import { describe, expect, it } from "vitest";

import { isNoteLength, MAX_DOTS, NOTE_TYPES, noteLengthOf, readScore, splitLength, wholeNotesOf } from "../../src";
import { beatOf, isCompound, restLengths, typeLength, writtenLength } from "../../src/edit/lengths";
import { score } from "../fixtures";

describe("note lengths", () => {
  it("turns types and dots into whole notes", () => {
    expect(NOTE_TYPES).toHaveLength(14);
    expect(typeLength("whole")).toBe(1);
    expect(typeLength("1024th")).toBe(1 / 1024);
    expect(typeLength("maxima")).toBe(8);
    expect(wholeNotesOf({ type: "quarter" })).toBe(1 / 4);
    expect(wholeNotesOf({ type: "quarter", dots: 1 })).toBe(3 / 8);
    expect(wholeNotesOf({ type: "half", dots: 2 })).toBe(7 / 8);
    expect(wholeNotesOf({ type: "breve", dots: MAX_DOTS })).toBe(2 * (2 - 1 / 16));
  });

  it("finds the one written length of a duration, or none", () => {
    expect(noteLengthOf(3 / 8)).toEqual({ type: "quarter", dots: 1 });
    expect(noteLengthOf(1)).toEqual({ type: "whole" });
    expect(noteLengthOf(7 / 16)).toEqual({ type: "quarter", dots: 2 });
    expect(noteLengthOf(5 / 8)).toBeNull();
    expect(noteLengthOf(1 / 3)).toBeNull();
  });

  it("tells MusicXML's lengths from anything else", () => {
    expect(isNoteLength({ type: "eighth" })).toBe(true);
    expect(isNoteLength({ type: "eighth", dots: 4 })).toBe(true);
    expect(isNoteLength({ type: "eighth", dots: 5 })).toBe(false);
    expect(isNoteLength({ type: "eighth", dots: 0.5 })).toBe(false);
    expect(isNoteLength({ type: "crotchet" })).toBe(false);
    expect(isNoteLength(null)).toBe(false);
    expect(isNoteLength("quarter")).toBe(false);
  });

  it("splits any length into tied notes, the longest first", () => {
    expect(splitLength(5 / 8)).toEqual([{ type: "half" }, { type: "eighth" }]);
    expect(splitLength(7 / 8)).toEqual([{ type: "half", dots: 1 }, { type: "eighth" }]);
    expect(splitLength(3)).toEqual([{ type: "breve", dots: 1 }]);
    expect(splitLength(1 / 4)).toEqual([{ type: "quarter" }]);
    expect(splitLength(1 / 3)).toBeNull();
  });

  it("reads a note's written length", () => {
    const root = readScore(
      score(
        `<note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><type>quarter</type><dot/></note>` +
          `<note><rest measure="yes"/><duration>8</duration></note><note><rest/><duration>1</duration><type>semiquaver</type></note>`,
      ),
    ).root;
    const notes = Array.from(root.getElementsByTagName("note"));
    expect(writtenLength(notes[0]!)).toEqual({ type: "quarter", dots: 1 });
    expect(writtenLength(notes[1]!)).toBeNull();
    expect(writtenLength(notes[2]!)).toBeNull();
  });
});

describe("rests filling a gap", () => {
  const common = { beats: 4, beatType: 4 };
  const waltz = { beats: 3, beatType: 4 };
  const jig = { beats: 6, beatType: 8 };

  it("starts each rest on a multiple of its length and keeps it within the beat", () => {
    expect(restLengths(1 / 4, 1, common)).toEqual([{ type: "quarter" }, { type: "half" }]);
    expect(restLengths(1 / 8, 1, common)).toEqual([{ type: "eighth" }, { type: "quarter" }, { type: "half" }]);
    expect(restLengths(3 / 8, 1, common)).toEqual([{ type: "eighth" }, { type: "half" }]);
    expect(restLengths(0, 3 / 4, common)).toEqual([{ type: "half" }, { type: "quarter" }]);
    expect(restLengths(1 / 4, 3 / 4, waltz)).toEqual([{ type: "quarter" }, { type: "quarter" }]);
  });

  it("writes dotted rests of a beat or more in compound time", () => {
    expect(isCompound(jig)).toBe(true);
    expect(isCompound(waltz)).toBe(false);
    expect(isCompound(null)).toBe(false);
    expect(beatOf(jig)).toBe(3 / 8);
    expect(beatOf(waltz)).toBe(1 / 4);
    expect(beatOf(null)).toBe(1 / 4);
    expect(restLengths(1 / 4, 3 / 4, jig)).toEqual([{ type: "eighth" }, { type: "quarter", dots: 1 }]);
    expect(restLengths(0, 3 / 8, jig)).toEqual([{ type: "quarter", dots: 1 }]);
    expect(restLengths(1 / 8, 1 / 2, null)).toEqual([{ type: "eighth" }, { type: "quarter" }]);
  });

  it("is one measure rest for a whole empty measure, and nothing off the grid", () => {
    expect(restLengths(0, 1, common, true)).toEqual([null]);
    expect(restLengths(1 / 3, 1, common)).toBeNull();
  });
});
