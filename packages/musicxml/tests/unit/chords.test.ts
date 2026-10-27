import { describe, expect, it } from "vitest";

import { addChordNote, readScore, removeChordNote, scoreText, toRest } from "../../src";
import { attributes, editErrorOf, note, rest, summary, withTie } from "../editing";
import { fixtureText, score } from "../fixtures";

const E4 = { step: "E", alter: 0, octave: 4 } as const;
const chordNote = (step: string, extra = "") => note(step, 4, 4, "whole", extra).replace("<pitch>", "<chord/><pitch>");

const notesOf = (text: string) => {
  const document = readScore(text);
  return { document, notes: Array.from(document.root.getElementsByTagName("note")) };
};

describe("addChordNote", () => {
  it("adds a note to the chord after its last note, with its length", () => {
    const { document, notes } = notesOf(score(attributes(1) + note("C", 4, 4, "whole") + chordNote("G")));
    const added = addChordNote(document, notes[0]!, E4);
    expect(summary(document)).toEqual([["C4+G4+E4 whole"]]);
    expect(added.previousElementSibling).toBe(notes[1]);
    expect(scoreText(document)).toContain(
      `<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure>`,
    );
  });

  it("copies the chord's stem and tuplet, and the accidental it needs", () => {
    const triplet = `<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>`;
    const { document, notes } = notesOf(
      score(attributes(3) + note("C", 4, 2, "quarter", `${triplet}<stem>up</stem>`).repeat(3) + rest(6, "half")),
    );
    const added = addChordNote(document, notes[0]!, { step: "E", alter: -1, octave: 4 });
    expect(added.getElementsByTagName("time-modification")).toHaveLength(1);
    expect(scoreText(document)).toContain(
      `<type>quarter</type><accidental>flat</accidental>${triplet}<stem>up</stem></note>`,
    );
  });

  it("refuses rests, grace notes and pitches already in the chord", () => {
    const grace = `<note><grace/><pitch><step>B</step><octave>3</octave></pitch><voice>1</voice><type>eighth</type></note>`;
    const { document, notes } = notesOf(score(attributes(1) + grace + note("C", 4, 2, "half") + rest(2, "half")));
    expect(editErrorOf(() => addChordNote(document, notes[2]!, E4))).toBe("not_a_note");
    expect(editErrorOf(() => addChordNote(document, notes[0]!, E4))).toBe("not_a_note");
    expect(editErrorOf(() => addChordNote(document, notes[1]!, { step: "B", alter: 1, octave: 3 }))).toBe(
      "duplicate_pitch",
    );
    expect(editErrorOf(() => addChordNote(document, notes[1]!, { step: "B", alter: 3, octave: 3 }))).toBe(
      "invalid_pitch",
    );
  });

  it("adds only the new note to MuseScore's file", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    addChordNote(document, document.root.getElementsByTagName("note")[0]!, { step: "B", alter: 0, octave: 4 });
    const end = `<text>Hap</text>\n          </lyric>\n        </note>`;
    const added = `
      <note>
        <chord/>
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>`;
    expect(scoreText(document)).toBe(text.replace(end, `${end}${added}`));
  });
});

describe("removeChordNote and toRest", () => {
  it("removes a note from its chord, leaving the others", () => {
    const { document, notes } = notesOf(
      score(attributes(1) + note("C", 4, 4, "whole") + chordNote("E") + chordNote("G")),
    );
    expect(removeChordNote(document, notes[1]!)).toBe(notes[0]);
    expect(summary(document)).toEqual([["C4+G4 whole"]]);
    expect(editErrorOf(() => removeChordNote(document, readScore(score()).root as unknown as Element))).toBe(
      "not_in_score",
    );
  });

  it("hands the chord's lyrics and notations to the next note when its first is removed", () => {
    const lyric = `<lyric number="1"><text>la</text></lyric>`;
    const fermata = `<notations><fermata/></notations>`;
    const { document, notes } = notesOf(
      score(
        attributes(1) +
          note("C", 4, 4, "whole", fermata + lyric) +
          chordNote("E") +
          chordNote("G", '<notations><slur type="start"/></notations>'),
      ),
    );
    expect(toRest(document, notes[0]!)).toBe(notes[1]);
    expect(summary(document)).toEqual([["E4+G4 whole"]]);
    const text = scoreText(document);
    expect(text).toContain(
      `<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><notations><fermata/></notations>${lyric}</note>`,
    );
    removeChordNote(document, notes[1]!);
    expect(scoreText(document)).toContain(`<notations><slur type="start"/><fermata/></notations>${lyric}</note>`);
    expect(editErrorOf(() => removeChordNote(document, notes[2]!))).toBe("not_a_chord");
  });

  it("turns a note into a rest of its length, its ties undone and the measure beamed again", () => {
    const eighth = (step: string) => note(step, 4, 1, "eighth", `<stem>up</stem><beam number="1">${"x"}</beam>`);
    const text = score(
      attributes(2) +
        eighth("C").replace("x", "begin") +
        eighth("D").replace("x", "continue") +
        eighth("E").replace("x", "continue") +
        eighth("F").replace("x", "end") +
        withTie(note("A", 4, 4, "half", "<stem>up</stem><lyric><text>la</text></lyric>"), "start"),
      withTie(note("A", 4, 8, "whole"), "stop"),
    );
    const { document, notes } = notesOf(text);
    const rested = toRest(document, notes[4]!);
    expect(rested).toBe(notes[4]);
    expect(summary(document)).toEqual([["C4 eighth", "D4 eighth", "E4 eighth", "F4 eighth", "r half"], ["A4 whole"]]);
    expect(scoreText(document)).toContain(
      `<note><rest/><duration>4</duration><voice>1</voice><type>half</type></note></measure>`,
    );
    toRest(document, notes[1]!);
    const written = scoreText(document);
    expect(written).toContain(
      `<step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><stem>up</stem></note>`,
    );
    expect(written).toContain(`<beam number="1">begin</beam></note><note><pitch><step>F</step>`);
    expect(editErrorOf(() => toRest(document, notes[1]!))).toBe("not_a_note");
  });
});
