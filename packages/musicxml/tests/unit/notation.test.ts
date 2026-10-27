import { describe, expect, it } from "vitest";

import { readScore, rebeam, scoreText, setKey, setPitch, updateAccidentals, writeNote } from "../../src";
import { keyAlteration } from "../../src/edit/accidentals";
import { beamBreaks } from "../../src/edit/beams";
import { middleLine, updateStems } from "../../src/edit/stems";
import { attributes, editErrorOf, note, rest, withTie } from "../editing";
import { fixtureText, score } from "../fixtures";

const pitched = (step: string, alter: number, octave: number, duration: number, type: string, extra = "") =>
  note(step, octave, duration, type, extra).replace(
    `<step>${step}</step>`,
    alter === 0 ? `<step>${step}</step>` : `<step>${step}</step><alter>${alter}</alter>`,
  );

const accidentals = (text: string) =>
  Array.from(readScoreText(text).matchAll(/<note>.*?<\/note>/g)).map(
    ([element]) => /<accidental[^>]*>([^<]*)</.exec(element)?.[1] ?? "-",
  );
const readScoreText = (text: string) => text;

describe("accidentals", () => {
  it("knows the key's alterations", () => {
    expect(keyAlteration(2, "C")).toBe(1);
    expect(keyAlteration(2, "G")).toBe(0);
    expect(keyAlteration(-3, "A")).toBe(-1);
    expect(keyAlteration(-3, "D")).toBe(0);
    expect(keyAlteration(0, "F")).toBe(0);
  });

  it("writes them against the key and the earlier notes of the same step and octave", () => {
    const text = score(
      attributes(1, 4, 4, 1) +
        pitched("F", 0, 4, 1, "quarter") +
        pitched("F", 0, 4, 1, "quarter", "<accidental>natural</accidental>") +
        pitched("F", 1, 4, 1, "quarter") +
        pitched("F", 1, 5, 1, "quarter", "<accidental>sharp</accidental>"),
      pitched("C", 1, 4, 1, "quarter") +
        pitched("C", 1, 4, 1, "quarter") +
        pitched("B", -1, 4, 1, "quarter") +
        pitched("B", 0, 4, 1, "quarter"),
    );
    const document = readScore(text);
    updateAccidentals(document, 0);
    updateAccidentals(document, 1);
    expect(accidentals(scoreText(document))).toEqual(["natural", "-", "sharp", "-", "sharp", "-", "flat", "natural"]);
    expect(document.revision).toBe(2);
    expect(editErrorOf(() => updateAccidentals(document, 9))).toBe("not_in_score");
  });

  it("keeps courtesy accidentals that are right, and microtones' own", () => {
    const text = score(
      attributes(1) +
        pitched("F", 0, 4, 1, "quarter", `<accidental cautionary="yes">natural</accidental>`) +
        pitched("F", 0, 4, 1, "quarter", `<accidental parentheses="yes">sharp</accidental>`) +
        pitched("G", 0.5, 4, 1, "quarter", "<accidental>quarter-sharp</accidental>") +
        pitched("G", 0.5, 4, 1, "quarter", "<accidental>quarter-sharp</accidental>"),
    );
    const document = readScore(text);
    updateAccidentals(document, 0);
    expect(accidentals(scoreText(document))).toEqual(["natural", "-", "quarter-sharp", "quarter-sharp"]);
  });

  it("writes none on a tied note, which across a barline does not count for the later notes", () => {
    const text = score(
      attributes(1) +
        note("C", 4, 3, "half", "<dot/>") +
        withTie(pitched("F", 1, 4, 1, "quarter", "<accidental>sharp</accidental>"), "start"),
      withTie(pitched("F", 1, 4, 1, "quarter", "<accidental>sharp</accidental>"), "stop") +
        pitched("F", 1, 4, 3, "half", "<dot/>"),
    );
    const document = readScore(text);
    updateAccidentals(document, 1);
    expect(accidentals(scoreText(document))).toEqual(["-", "sharp", "-", "sharp"]);
  });

  it("rewrites in an edit only the notes it changed, another program's courtesy accidentals kept", () => {
    const sharp = "<accidental>sharp</accidental>";
    const text = score(
      attributes(1) +
        pitched("F", 1, 4, 1, "quarter", sharp) +
        pitched("G", 0, 4, 1, "quarter") +
        // An unmarked courtesy sharp, as another program may write it.
        pitched("F", 1, 4, 1, "quarter", sharp) +
        pitched("A", 0, 4, 1, "quarter"),
    );
    const document = readScore(text);
    const notes = Array.from(document.root.getElementsByTagName("note"));
    setPitch(document, notes[1]!, { step: "B", alter: -1, octave: 4 });
    expect(accidentals(scoreText(document))).toEqual(["sharp", "flat", "sharp", "-"]);
    writeNote(
      document,
      { measure: 0, onset: 0.75 },
      { pitch: { step: "A", alter: 0, octave: 4 }, length: { type: "quarter" } },
    );
    expect(accidentals(scoreText(document))).toEqual(["sharp", "flat", "sharp", "-"]);
    // Asked for the whole measure, the courtesy sharp goes.
    updateAccidentals(document, 0);
    expect(accidentals(scoreText(document))).toEqual(["sharp", "flat", "-", "-"]);
  });

  it("rewrites the later notes of the same step and octave that a changed pitch affects", () => {
    const text = score(
      attributes(1) +
        pitched("F", 0, 4, 1, "quarter") +
        pitched("F", 1, 4, 1, "quarter", "<accidental>sharp</accidental>") +
        pitched("F", 1, 4, 1, "quarter") +
        pitched("F", 1, 5, 1, "quarter", "<accidental>sharp</accidental>"),
    );
    const document = readScore(text);
    setPitch(document, document.root.getElementsByTagName("note")[0]!, { step: "F", alter: 1, octave: 4 });
    // The second note's sharp is no longer needed; the F sharp an octave up is another step and octave.
    expect(accidentals(scoreText(document))).toEqual(["sharp", "-", "-", "sharp"]);
  });

  it("rewrites in a new key what it makes wrong or needed, courtesy accidentals left alone", () => {
    const text = score(
      attributes(1) +
        pitched("F", 1, 4, 1, "quarter", "<accidental>sharp</accidental>") +
        pitched("F", 1, 4, 1, "quarter", "<accidental>sharp</accidental>") +
        pitched("C", 0, 4, 1, "quarter", "<accidental>natural</accidental>") +
        pitched("F", 0, 5, 1, "quarter"),
    );
    const document = readScore(text);
    setKey(document, 0, 1);
    // In G major: the needed sharp goes, the courtesy ones stay, the F an octave up now needs a natural.
    expect(accidentals(scoreText(document))).toEqual(["-", "sharp", "natural", "natural"]);
  });

  it("leaves MuseScore's measures as they are when they are right", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    for (const measure of [0, 1, 2, 3]) updateAccidentals(document, measure);
    expect(scoreText(document)).toBe(text);
  });
});

describe("beams", () => {
  const eighths = (count: number, beats = 4, beatType = 4) =>
    score(attributes(2, beats, beatType) + note("C", 5, 1, "eighth", "<stem>down</stem>").repeat(count));
  const beamsOf = (text: string) =>
    Array.from(text.matchAll(/<note>.*?<\/note>/g)).map(([element]) =>
      Array.from(element.matchAll(/<beam number="(\d)">([^<]*)<\/beam>/g))
        .map(([, number, value]) => `${number}:${value}`)
        .join(" "),
    );

  it("groups MuseScore's way: eighths by half bar in 4/4, by bar in 3/4, by dotted quarter in 6/8", () => {
    expect(beamBreaks({ beats: 4, beatType: 4 })).toEqual([1 / 2, 1 / 4, 1 / 8]);
    expect(beamBreaks({ beats: 2, beatType: 2 })).toEqual([1 / 2, 1 / 4, 1 / 8]);
    expect(beamBreaks({ beats: 2, beatType: 4 })).toEqual([1 / 2, 1 / 4, 1 / 8]);
    expect(beamBreaks({ beats: 3, beatType: 4 })).toEqual([3 / 4, 1 / 4, 1 / 8]);
    expect(beamBreaks({ beats: 12, beatType: 8 })).toEqual([3 / 8, 3 / 8, 1 / 8]);
    expect(beamBreaks({ beats: 5, beatType: 4 })).toEqual([1 / 4, 1 / 4, 1 / 8]);
    expect(beamBreaks({ beats: 7, beatType: 16 })).toEqual([1 / 16, 1 / 16, 1 / 16]);
    expect(beamBreaks(null)).toEqual([1 / 4, 1 / 4, 1 / 8]);
    const common = readScore(eighths(8));
    rebeam(common, 0);
    expect(beamsOf(scoreText(common))).toEqual([
      "1:begin",
      "1:continue",
      "1:continue",
      "1:end",
      "1:begin",
      "1:continue",
      "1:continue",
      "1:end",
    ]);
    const waltz = readScore(eighths(6, 3, 4));
    rebeam(waltz, 0);
    expect(beamsOf(scoreText(waltz))).toEqual([
      "1:begin",
      "1:continue",
      "1:continue",
      "1:continue",
      "1:continue",
      "1:end",
    ]);
    const jig = readScore(score(attributes(2, 6, 8) + note("C", 5, 1, "eighth").repeat(6)));
    rebeam(jig, 0);
    expect(beamsOf(scoreText(jig))).toEqual(["1:begin", "1:continue", "1:end", "1:begin", "1:continue", "1:end"]);
  });

  it("breaks at rests and longer notes, and leaves a lone eighth unbeamed", () => {
    const text = score(
      attributes(2) +
        note("C", 5, 1, "eighth", `<beam number="1">begin</beam>`) +
        rest(1, "eighth") +
        note("C", 5, 1, "eighth") +
        note("C", 5, 1, "eighth") +
        note("C", 5, 2, "quarter") +
        note("C", 5, 1, "eighth") +
        note("C", 5, 1, "eighth"),
    );
    const document = readScore(text);
    rebeam(document, 0);
    expect(beamsOf(scoreText(document))).toEqual(["", "", "1:begin", "1:end", "", "1:begin", "1:end"]);
  });

  it("beams 16ths and 32nds by their own breaks, with hooks", () => {
    const text = score(
      attributes(8) +
        note("C", 5, 6, "eighth", "<dot/>") +
        note("C", 5, 2, "16th") +
        note("C", 5, 1, "32nd") +
        note("C", 5, 1, "32nd") +
        note("C", 5, 2, "16th") +
        note("C", 5, 4, "eighth") +
        note("C", 5, 2, "16th") +
        note("C", 5, 6, "eighth", "<dot/>") +
        rest(8, "quarter"),
    );
    const document = readScore(text);
    rebeam(document, 0);
    expect(beamsOf(scoreText(document))).toEqual([
      "1:begin",
      "1:continue 2:backward hook",
      "1:continue 2:begin 3:begin",
      "1:continue 2:continue 3:end",
      "1:continue 2:end",
      "1:end",
      // A new group at the half bar: the 16th's own beam hooks towards the dotted eighth after it.
      "1:begin 2:forward hook",
      "1:end",
      "",
    ]);
  });

  it("writes beams on a chord's first note, and on its others where the file does", () => {
    const chord = (extra: string) => note("E", 5, 1, "eighth", extra).replace("<pitch>", "<chord/><pitch>");
    const text = score(
      attributes(2) +
        note("C", 5, 1, "eighth") +
        chord("") +
        note("C", 5, 1, "eighth") +
        chord(`<beam number="1">x</beam>`) +
        rest(6, "half."),
    );
    const document = readScore(text);
    rebeam(document, 0);
    expect(beamsOf(scoreText(document))).toEqual(["1:begin", "", "1:end", "1:end", ""]);
  });

  it("leaves measures with tuplets as they are, and MuseScore's beams as they are when right", () => {
    const triplet = `<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>`;
    const text = score(attributes(3) + note("C", 4, 1, "eighth", triplet).repeat(3) + rest(9, "half."));
    const document = readScore(text);
    rebeam(document, 0);
    expect(scoreText(document)).toBe(text);
    const musescore = fixtureText("musescore/lead-sheet.musicxml");
    const lead = readScore(musescore);
    for (const measure of [0, 1, 2, 3]) rebeam(lead, measure);
    expect(scoreText(lead)).toBe(musescore);
    expect(editErrorOf(() => rebeam(lead, -1))).toBe("not_in_score");
  });
});

describe("stems", () => {
  const clef = (sign: string, line: number, change = "") =>
    readScore(
      score(
        `<attributes><divisions>1</divisions><clef><sign>${sign}</sign><line>${line}</line>${change}</clef></attributes>` +
          note("C", 4, 4, "whole"),
      ),
    ).root.getElementsByTagName("note")[0]!;

  it("finds the middle line of the clef in force", () => {
    expect(middleLine(clef("G", 2))).toBe(34);
    expect(middleLine(clef("F", 4))).toBe(22);
    expect(middleLine(clef("C", 3))).toBe(28);
    expect(middleLine(clef("C", 4))).toBe(26);
    expect(middleLine(clef("G", 2, "<clef-octave-change>-1</clef-octave-change>"))).toBe(27);
    expect(middleLine(clef("percussion", 3))).toBeNull();
    expect(middleLine(readScore(score(note("C", 4, 4, "whole"))).root.getElementsByTagName("note")[0]!)).toBe(34);
    const loose = readScore(score()).xml.createElementNS(null, "note");
    expect(middleLine(loose)).toBeNull();
  });

  it("points stems as a reader would, a chord and a beamed group by their farthest note", () => {
    const stem = (step: string, octave: number, beam?: string, chord = false) => {
      const text = note(step, octave, 1, "eighth", `<stem>none</stem>${beam ? `<beam number="1">${beam}</beam>` : ""}`);
      return (chord ? text.replace("<pitch>", "<chord/><pitch>") : text).replace(
        "<stem>none</stem>",
        "<stem>up</stem>",
      );
    };
    const text = score(
      attributes(2) +
        stem("A", 4, "begin") +
        stem("F", 5, "end") +
        stem("C", 4) +
        stem("A", 5, undefined, true) +
        stem("B", 4) +
        rest(4, "half") +
        note("C", 5, 1, "eighth", "<stem>double</stem>"),
    );
    const document = readScore(text);
    const notes = Array.from(document.root.getElementsByTagName("note"));
    updateStems([notes[0]!, notes[2]!, notes[4]!, notes[5]!, notes[6]!]);
    const directions = notes.map((element) => element.getElementsByTagName("stem")[0]?.textContent ?? "-");
    expect(directions).toEqual(["down", "down", "down", "down", "down", "-", "double"]);
  });
});
