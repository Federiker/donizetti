import { describe, expect, it } from "vitest";

import { pitchAbove, pitchForStep, readScore, scoreText, setPitch, transpose } from "../../src";
import { spell, transposedPitch } from "../../src/edit/pitch";
import { attributes, editErrorOf, note, rest, summary, withTie } from "../editing";
import { fixtureText, score } from "../fixtures";

const notesOf = (text: string) => {
  const document = readScore(text);
  return { document, notes: Array.from(document.root.getElementsByTagName("note")) };
};

describe("spelling", () => {
  it("spells Up with sharps and Down with flats, preferring the key's own and naturals", () => {
    expect(spell(61, 0, 1)).toEqual({ step: "C", alter: 1, octave: 4 });
    expect(spell(61, 0, -1)).toEqual({ step: "D", alter: -1, octave: 4 });
    expect(spell(66, 1, -1)).toEqual({ step: "F", alter: 1, octave: 4 });
    expect(spell(70, -1, 1)).toEqual({ step: "B", alter: -1, octave: 4 });
    expect(spell(65, 1, 1)).toEqual({ step: "F", alter: 0, octave: 4 });
    expect(spell(60, 0, 1)).toEqual({ step: "C", alter: 0, octave: 4 });
    expect(spell(72, 7, 1)).toEqual({ step: "B", alter: 1, octave: 4 });
    expect(spell(59, -7, -1)).toEqual({ step: "C", alter: -1, octave: 4 });
  });

  it("keeps the spelling over whole octaves", () => {
    expect(transposedPitch({ step: "E", alter: -1, octave: 4 }, 12, 0)).toEqual({ step: "E", alter: -1, octave: 5 });
    expect(transposedPitch({ step: "E", alter: -1, octave: 4 }, -24, 0)).toEqual({ step: "E", alter: -1, octave: 2 });
    expect(transposedPitch({ step: "E", alter: -1, octave: 4 }, 1, 0)).toEqual({ step: "E", alter: 0, octave: 4 });
  });
});

describe("setPitch", () => {
  it("sets a note's pitch with the accidental it needs, and the later notes' too", () => {
    const { document, notes } = notesOf(
      score(
        attributes(1, 4, 4, 1) +
          note("G", 4, 1, "quarter") +
          note("F", 4, 1, "quarter", "").replace("<step>F</step>", "<step>F</step><alter>1</alter>") +
          rest(2, "half"),
      ),
    );
    expect(setPitch(document, notes[0]!, { step: "F", alter: 0, octave: 4 })).toBe(notes[0]);
    const text = scoreText(document);
    expect(text).toContain(
      `<step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><accidental>natural</accidental>`,
    );
    expect(text).toContain(
      `<alter>1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><accidental>sharp</accidental>`,
    );
    setPitch(document, notes[0]!, { step: "B", alter: -1, octave: 4 });
    expect(scoreText(document)).toContain(
      `<step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><accidental>flat</accidental>`,
    );
    expect(scoreText(document)).not.toContain("sharp");
  });

  it("turns a rest into a note of its length", () => {
    const { document, notes } = notesOf(score(attributes(1, 3, 4) + rest(3)));
    setPitch(document, notes[0]!, { step: "C", alter: 0, octave: 5 });
    expect(summary(document)).toEqual([["C5 half."]]);
    const odd = notesOf(score(attributes(1, 5, 4) + rest(5)));
    expect(editErrorOf(() => setPitch(odd.document, odd.notes[0]!, { step: "C", alter: 0, octave: 5 }))).toBe(
      "unsupported_rhythm",
    );
  });

  it("undoes a tie at both ends when the pitch changes, and keeps it when it does not", () => {
    const text = score(
      attributes(1) + withTie(note("A", 4, 4, "whole"), "start"),
      withTie(note("A", 4, 4, "whole"), "stop"),
    );
    const { document, notes } = notesOf(text);
    setPitch(document, notes[1]!, { step: "A", alter: 0, octave: 4 });
    expect(summary(document)).toEqual([["A4 whole-"], ["~A4 whole"]]);
    setPitch(document, notes[1]!, { step: "B", alter: 0, octave: 4 });
    expect(summary(document)).toEqual([["A4 whole"], ["B4 whole"]]);
  });

  it("refuses a pitch the chord already has, or one MusicXML cannot write", () => {
    const chord = note("E", 4, 4, "whole").replace("<pitch>", "<chord/><pitch>");
    const { document, notes } = notesOf(score(attributes(1) + note("C", 4, 4, "whole") + chord));
    expect(editErrorOf(() => setPitch(document, notes[1]!, { step: "C", alter: 0, octave: 4 }))).toBe(
      "duplicate_pitch",
    );
    expect(editErrorOf(() => setPitch(document, notes[1]!, { step: "H" as "C", alter: 0, octave: 4 }))).toBe(
      "invalid_pitch",
    );
    expect(editErrorOf(() => setPitch(document, notes[1]!, { step: "G", alter: 0, octave: 10 }))).toBe("invalid_pitch");
  });

  it("changes only the pitch in MuseScore's file, and the stem a reader would draw", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    setPitch(document, document.root.getElementsByTagName("note")[0]!, { step: "E", alter: 0, octave: 5 });
    const first = `          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>`;
    expect(scoreText(document)).toBe(
      text.replace(first, first.replace("G", "E").replace("<octave>4", "<octave>5").replace("up", "down")),
    );
  });
});

describe("transpose", () => {
  it("moves a note by semitones, spelt as MuseScore does", () => {
    const { document, notes } = notesOf(score(attributes(1, 4, 4, 1) + note("E", 4, 4, "whole")));
    transpose(document, notes[0]!, 1);
    expect(summary(document)).toEqual([["F4 whole"]]);
    expect(scoreText(document)).toContain("<accidental>natural</accidental>");
    transpose(document, notes[0]!, 1);
    expect(summary(document)).toEqual([["F#4 whole"]]);
    expect(scoreText(document)).not.toContain("accidental");
    transpose(document, notes[0]!, -12);
    expect(summary(document)).toEqual([["F#3 whole"]]);
  });

  it("moves the notes tied to it too, so the tie stays", () => {
    const text = score(
      attributes(1) + withTie(note("A", 4, 4, "whole"), "start"),
      withTie(note("A", 4, 4, "whole"), "stop"),
    );
    const { document, notes } = notesOf(text);
    transpose(document, notes[1]!, -1);
    expect(summary(document)).toEqual([["Ab4 whole-"], ["~Ab4 whole"]]);
    expect(scoreText(document).match(/<accidental>flat<\/accidental>/g)).toHaveLength(1);
  });

  it("refuses rests, fractions of a semitone and pitches out of range", () => {
    const { document, notes } = notesOf(score(attributes(1) + rest(2, "half") + note("G", 9, 2, "half")));
    expect(editErrorOf(() => transpose(document, notes[0]!, 1))).toBe("not_a_note");
    expect(editErrorOf(() => transpose(document, notes[1]!, 0.5))).toBe("invalid_pitch");
    expect(editErrorOf(() => transpose(document, notes[1]!, 1))).toBe("invalid_pitch");
  });
});

describe("pitches for the keys", () => {
  const text = score(
    attributes(1, 4, 4, 1) +
      note("A", 4, 1, "quarter") +
      note("F", 4, 1, "quarter", "<accidental>natural</accidental>") +
      rest(2, "half"),
    rest(4),
  );

  it("gives A–G in the octave nearest the note before, altered as the key and the measure have it", () => {
    const document = readScore(text);
    expect(pitchForStep(document, { measure: 0, onset: 0.5 }, "C")).toEqual({ step: "C", alter: 0, octave: 4 });
    expect(pitchForStep(document, { measure: 0, onset: 0.5 }, "F")).toEqual({ step: "F", alter: 0, octave: 4 });
    expect(pitchForStep(document, { measure: 0, onset: 0.5 }, "G")).toEqual({ step: "G", alter: 0, octave: 4 });
    expect(pitchForStep(document, { measure: 1, onset: 0 }, "F")).toEqual({ step: "F", alter: 1, octave: 4 });
    expect(pitchForStep(document, { measure: 0, onset: 1 }, "B")).toEqual({ step: "B", alter: 0, octave: 4 });
    expect(pitchForStep(document, { measure: 2, onset: 0 }, "F")).toEqual({ step: "F", alter: 1, octave: 4 });
    expect(
      pitchForStep(document, { measure: 0, onset: 0.5 }, "D", { above: { step: "F", alter: 0, octave: 4 } }),
    ).toEqual({ step: "D", alter: 0, octave: 5 });
    // The natural was on F4: F5 is still sharp in G major.
    expect(
      pitchForStep(document, { measure: 0, onset: 0.5 }, "F", { above: { step: "F", alter: 0, octave: 4 } }),
    ).toEqual({ step: "F", alter: 1, octave: 5 });
    expect(editErrorOf(() => pitchForStep(document, { measure: 0, onset: 0 }, "X" as "C"))).toBe("invalid_pitch");
  });

  it("starts from the clef's middle line before the first note", () => {
    const document = readScore(score(attributes(1) + rest(4)));
    expect(pitchForStep(document, { measure: 0, onset: 0 }, "C")).toEqual({ step: "C", alter: 0, octave: 5 });
    expect(pitchForStep(document, { measure: 0, onset: 0 }, "E")).toEqual({ step: "E", alter: 0, octave: 5 });
    expect(pitchForStep(document, { measure: 0, onset: 0 }, "F")).toEqual({ step: "F", alter: 0, octave: 4 });
    const bass = readScore(
      score(attributes(1).replace("<sign>G</sign><line>2</line>", "<sign>F</sign><line>4</line>") + rest(4)),
    );
    expect(pitchForStep(bass, { measure: 0, onset: 0 }, "C")).toEqual({ step: "C", alter: 0, octave: 3 });
  });

  it("gives the note an interval above, on the key's scale", () => {
    const document = readScore(text);
    const notes = Array.from(document.root.getElementsByTagName("note"));
    expect(pitchAbove(document, notes[0]!, 3)).toEqual({ step: "C", alter: 0, octave: 5 });
    expect(pitchAbove(document, notes[0]!, 6)).toEqual({ step: "F", alter: 1, octave: 5 });
    expect(pitchAbove(document, notes[1]!, 8)).toEqual({ step: "F", alter: 1, octave: 5 });
    expect(pitchAbove(document, notes[1]!, 1)).toEqual({ step: "F", alter: 1, octave: 4 });
    expect(editErrorOf(() => pitchAbove(document, notes[2]!, 3))).toBe("not_a_note");
    expect(editErrorOf(() => pitchAbove(document, notes[0]!, 0))).toBe("invalid_pitch");
  });
});
