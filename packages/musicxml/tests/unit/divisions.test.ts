import { describe, expect, it } from "vitest";

import { readScore, ScoreEditError, scoreText, writeNote } from "../../src";
import { divisionsFactor, scaleDivisions, toDivisions } from "../../src/edit/divisions";
import { attributes, note, summary } from "../editing";
import { score } from "../fixtures";

describe("divisions", () => {
  it("counts whole notes in divisions of a quarter", () => {
    expect(toDivisions(1 / 4, 1)).toBe(1);
    expect(toDivisions(3 / 8, 2)).toBe(3);
    expect(toDivisions(1 / 8, 1)).toBeNull();
    expect(toDivisions(1 / 3, 3)).toBe(4);
  });

  it("finds the power of two the divisions must rise by", () => {
    expect(divisionsFactor([{ wholeNotes: 1 / 4, divisions: 1 }], 0)).toBe(1);
    expect(divisionsFactor([{ wholeNotes: 1 / 32, divisions: 1 }], 0)).toBe(8);
    expect(divisionsFactor([{ wholeNotes: 1 / 8, divisions: 3 }], 0)).toBe(2);
    expect(() => divisionsFactor([{ wholeNotes: 1 / 3, divisions: 1 }], 2)).toThrow(ScoreEditError);
  });

  it("rescales every duration, backup, forward and offset with the divisions", () => {
    const text = score(
      `<attributes><divisions>1</divisions></attributes>` +
        `<harmony><root><root-step>C</root-step></root><kind>major</kind><offset>1</offset></harmony>` +
        `<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>` +
        `<backup><duration>2</duration></backup><forward><duration>1</duration></forward>`,
      `<attributes><divisions>2</divisions></attributes><note><rest/><duration>8</duration></note>`,
    );
    const document = readScore(text);
    scaleDivisions(document.root.getElementsByTagName("part")[0]!, 4);
    expect(scoreText(document)).toBe(
      text
        .replace("<divisions>1</divisions>", "<divisions>4</divisions>")
        .replace("<divisions>2</divisions>", "<divisions>8</divisions>")
        .replace("<offset>1</offset>", "<offset>4</offset>")
        .replace("<duration>2</duration></note>", "<duration>8</duration></note>")
        .replace("<backup><duration>2</duration>", "<backup><duration>8</duration>")
        .replace("<forward><duration>1</duration>", "<forward><duration>4</duration>")
        .replace("<duration>8</duration></note></measure></part>", "<duration>32</duration></note></measure></part>"),
    );
  });

  it("writes divisions into a part that had none", () => {
    const withAttributes = readScore(score(`<attributes><key><fifths>0</fifths></key></attributes>`));
    scaleDivisions(withAttributes.root.getElementsByTagName("part")[0]!, 2);
    expect(scoreText(withAttributes)).toContain("<attributes><divisions>2</divisions><key>");
    const without = readScore(score(`<print/><note><rest/><duration>1</duration></note>`));
    scaleDivisions(without.root.getElementsByTagName("part")[0]!, 2);
    expect(scoreText(without)).toContain(
      `<print/><attributes><divisions>2</divisions></attributes><note><rest/><duration>2</duration>`,
    );
    scaleDivisions(without.root.getElementsByTagName("part")[0]!, 1);
  });

  it("raises them when a note is written that they cannot count", () => {
    const text = score(
      attributes(1) +
        `<direction><direction-type><words>Gently</words></direction-type><offset>1</offset></direction>` +
        note("C", 4, 4, "whole"),
    );
    const document = readScore(text);
    writeNote(
      document,
      { measure: 0, onset: 0 },
      { pitch: { step: "D", alter: 0, octave: 4 }, length: { type: "32nd" } },
    );
    expect(summary(document)).toEqual([["D4 32nd", "r 32nd", "r 16th", "r eighth", "r quarter", "r half"]]);
    expect(scoreText(document)).toContain("<divisions>8</divisions>");
    // The direction keeps its time, a quarter in: a rest now starts there, so it needs no offset.
    expect(scoreText(document)).toContain(
      `<direction><direction-type><words>Gently</words></direction-type></direction><note><rest/><duration>8</duration>`,
    );
  });
});
