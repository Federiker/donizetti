import { describe, expect, it } from "vitest";

import { mapScore, readScore, scoreText, setLength, writeNote } from "../../src";
import { attributes, editErrorOf, note, rest, summary } from "../editing";
import { fixtureText, score } from "../fixtures";

const C4 = { step: "C", alter: 0, octave: 4 } as const;
const D4 = { step: "D", alter: 0, octave: 4 } as const;
const quarter = { type: "quarter" } as const;
const eighth = { type: "eighth" } as const;

const notesOf = (text: string) => {
  const document = readScore(text);
  return { document, notes: Array.from(document.root.getElementsByTagName("note")) };
};

const harmony = (step: string, offset = "") =>
  `<harmony><root><root-step>${step}</root-step></root><kind>major</kind>${offset}</harmony>`;

describe("writeNote", () => {
  it("writes over a measure rest, leaving rests aligned to the beat, and moves the cursor on", () => {
    const document = readScore(score(attributes(2) + rest(8)));
    const edit = writeNote(document, { measure: 0, onset: 0 }, { pitch: C4, length: quarter });
    expect(summary(document)).toEqual([["C4 quarter", "r quarter", "r half"]]);
    expect(edit.next).toEqual({ measure: 0, onset: 0.25 });
    expect(document.revision).toBe(1);
    const again = writeNote(document, edit.next, { pitch: D4, length: eighth });
    expect(summary(document)).toEqual([["C4 quarter", "D4 eighth", "r eighth", "r half"]]);
    expect(again.next).toEqual({ measure: 0, onset: 0.375 });
    expect(again.notes[0]!.parentElement).toBe(document.root.getElementsByTagName("measure")[0]);
  });

  it("writes rests (0 in note input) the same way", () => {
    const document = readScore(score(attributes(1) + note("C", 4, 4, "whole")));
    writeNote(document, { measure: 0, onset: 0.5 }, { pitch: null, length: quarter });
    expect(summary(document)).toEqual([["C4 half", "r quarter", "r quarter"]]);
  });

  it("cuts short a note begun before the cursor and leaves the rest of one reaching past it as rests", () => {
    const document = readScore(score(attributes(2) + note("C", 4, 4, "half") + note("E", 4, 4, "half")));
    writeNote(document, { measure: 0, onset: 1 / 8 }, { pitch: D4, length: eighth });
    expect(summary(document)).toEqual([["C4 eighth", "D4 eighth", "r quarter", "E4 half"]]);
    const whole = readScore(score(attributes(2) + note("C", 4, 8, "whole")));
    writeNote(whole, { measure: 0, onset: 5 / 8 }, { pitch: D4, length: eighth });
    expect(summary(whole)).toEqual([["C4 half-", "~C4 eighth", "D4 eighth", "r quarter"]]);
  });

  it("splits a note at the barline, tied into the next measure or one added at the end", () => {
    const document = readScore(score(attributes(1) + note("C", 4, 2, "half") + note("D", 4, 2, "half")));
    const edit = writeNote(document, { measure: 0, onset: 0.5 }, { pitch: D4, length: { type: "whole" } });
    expect(summary(document)).toEqual([
      ["C4 half", "D4 half-"],
      ["~D4 half", "r half"],
    ]);
    expect(edit.notes).toHaveLength(2);
    expect(edit.next).toEqual({ measure: 1, onset: 0.5 });
    expect(mapScore(document.root)!.measures[1]!.number).toBe("2");
    const long = readScore(score(attributes(1) + note("C", 4, 4, "whole"), rest(4)));
    writeNote(long, { measure: 0, onset: 0.25 }, { pitch: D4, length: { type: "whole", dots: 1 } });
    expect(summary(long)).toEqual([
      ["C4 quarter", "D4 half.-"],
      ["~D4 half.", "r quarter"],
    ]);
  });

  it("writes at the end of the score into a new measure", () => {
    const document = readScore(score(attributes(1, 3, 4) + note("C", 4, 3, "half", "<dot/>")));
    const edit = writeNote(document, { measure: 1, onset: 0 }, { pitch: D4, length: quarter });
    expect(summary(document)).toEqual([["C4 half."], ["D4 quarter", "r quarter", "r quarter"]]);
    expect(edit.next).toEqual({ measure: 1, onset: 0.25 });
    const full = writeNote(document, { measure: 1, onset: 0.25 }, { pitch: D4, length: { type: "half" } });
    expect(full.next).toEqual({ measure: 2, onset: 0 });
    expect(writeNote(document, full.next, { pitch: C4, length: { type: "half", dots: 1 } }).next).toEqual({
      measure: 3,
      onset: 0,
    });
    expect(summary(document)[2]).toEqual(["C4 half."]);
  });

  it("fills a measure that stops short with rests before the note", () => {
    const document = readScore(score(attributes(1) + note("C", 4, 1, "quarter")));
    writeNote(document, { measure: 0, onset: 0.75 }, { pitch: D4, length: quarter });
    expect(summary(document)).toEqual([["C4 quarter", "r quarter", "r quarter", "D4 quarter"]]);
  });

  it("undoes the ties of the notes it replaces, at both ends", () => {
    const tied = (type: string) => `<tie type="${type}"/>`;
    const text = score(
      attributes(1) + note("C", 4, 2, "half") + note("A", 4, 2, "half").replace("<voice>", `${tied("start")}<voice>`),
      note("A", 4, 4, "whole").replace("<voice>", `${tied("stop")}<voice>`),
    );
    const second = readScore(text);
    writeNote(second, { measure: 1, onset: 0 }, { pitch: D4, length: quarter });
    expect(summary(second)).toEqual([
      ["C4 half", "A4 half"],
      ["D4 quarter", "r quarter", "r half"],
    ]);
    const first = readScore(text);
    writeNote(first, { measure: 0, onset: 0.75 }, { pitch: D4, length: quarter });
    expect(summary(first)).toEqual([["C4 half", "A4 quarter", "D4 quarter"], ["A4 whole"]]);
  });

  it("keeps the lyrics of a note replaced at the same onset, on a note but not on a rest", () => {
    const lyric = (text: string) => `<lyric number="1"><syllabic>single</syllabic><text>${text}</text></lyric>`;
    const text = score(attributes(1) + note("C", 4, 2, "half", lyric("la")) + note("E", 4, 2, "half", lyric("di")));
    const document = readScore(text);
    const edit = writeNote(document, { measure: 0, onset: 0 }, { pitch: D4, length: { type: "half", dots: 1 } });
    expect(scoreText(document)).toContain(`<type>half</type><dot/>${lyric("la")}</note>`);
    expect(scoreText(document)).not.toContain(">di<");
    expect(edit.notes[0]!.getElementsByTagName("lyric")).toHaveLength(1);
    const resting = readScore(text);
    writeNote(resting, { measure: 0, onset: 0 }, { pitch: null, length: { type: "half" } });
    expect(scoreText(resting)).not.toContain(">la<");
  });

  it("keeps chord symbols and directions at their times, with an offset inside a note", () => {
    const text = score(attributes(1) + harmony("C") + note("C", 4, 2, "half") + harmony("G") + note("E", 4, 2, "half"));
    const document = readScore(text);
    writeNote(document, { measure: 0, onset: 0 }, { pitch: D4, length: { type: "whole" } });
    expect(scoreText(document)).toContain(
      `${harmony("C")}${harmony("G", "<offset>2</offset>")}<note><pitch><step>D</step>`,
    );
    // Written over again, the chord symbol's time is a note's start once more: no offset.
    writeNote(document, { measure: 0, onset: 0.5 }, { pitch: C4, length: { type: "half" } });
    expect(scoreText(document)).toContain(`</note>${harmony("G")}<note><pitch><step>C</step>`);
  });

  it("gives a sound its own offset, and refuses a measure whose divisions change inside it", () => {
    const text = score(`${attributes(1)}${note("C", 4, 2, "half")}<sound tempo="90"/>${note("E", 4, 2, "half")}`);
    const document = readScore(text);
    writeNote(document, { measure: 0, onset: 0 }, { pitch: D4, length: { type: "whole" } });
    expect(scoreText(document)).toContain(`<sound tempo="90"><offset>2</offset></sound><note>`);
    writeNote(document, { measure: 0, onset: 0 }, { pitch: D4, length: { type: "whole" } });
    expect(scoreText(document)).toContain(`<sound tempo="90"><offset>2</offset></sound><note>`);
    writeNote(document, { measure: 0, onset: 0.5 }, { pitch: C4, length: { type: "half" } });
    expect(scoreText(document)).toContain(`</note><sound tempo="90"/><note>`);
    const changing = readScore(
      score(
        attributes(1) +
          note("C", 4, 2, "half") +
          `<attributes><divisions>2</divisions></attributes>` +
          note("E", 4, 4, "half"),
      ),
    );
    expect(editErrorOf(() => writeNote(changing, { measure: 0, onset: 0 }, { pitch: D4, length: quarter }))).toBe(
      "unsupported_rhythm",
    );
  });

  it("keeps grace notes, attributes and barlines where they belong", () => {
    const grace = `<note><grace/><pitch><step>B</step><octave>3</octave></pitch><voice>1</voice><type>eighth</type></note>`;
    const text = score(
      `<barline location="left"><repeat direction="forward"/></barline>${attributes(1)}${note("C", 4, 2, "half")}${grace}${note("E", 4, 2, "half")}<barline location="right"><repeat direction="backward"/></barline>`,
    );
    const document = readScore(text);
    writeNote(document, { measure: 0, onset: 0 }, { pitch: D4, length: quarter });
    const written = scoreText(document);
    expect(written).toContain(`<measure number="1"><barline location="left">`);
    expect(written).toContain(`<type>quarter</type></note>${grace}<note><pitch><step>E</step>`);
    expect(written).toContain(`</note><barline location="right">`);
  });

  it("refuses what it cannot do, changing nothing", () => {
    const text = score(attributes(1) + note("C", 4, 4, "whole"));
    const document = readScore(text);
    const position = { measure: 0, onset: 0 };
    const write = (at: { measure: number; onset: number }) => () =>
      writeNote(document, at, { pitch: C4, length: quarter });
    expect(editErrorOf(write({ measure: 3, onset: 0 }))).toBe("not_in_score");
    expect(editErrorOf(write({ measure: 0, onset: 2 }))).toBe("not_in_score");
    expect(editErrorOf(write({ measure: 1, onset: 0.5 }))).toBe("not_in_score");
    expect(editErrorOf(write({ measure: 0.5, onset: 0 }))).toBe("not_in_score");
    expect(
      editErrorOf(() => writeNote(document, position, { pitch: C4, length: { type: "crotchet" as "quarter" } })),
    ).toBe("invalid_length");
    expect(editErrorOf(() => writeNote(document, position, { pitch: { ...C4, octave: 12 }, length: quarter }))).toBe(
      "invalid_pitch",
    );
    expect(document.revision).toBe(0);
    expect(scoreText(document)).toBe(text);
  });

  it("refuses to cut into a tuplet, or to number a measure after a number that is not an integer", () => {
    const triplet = `<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>`;
    const text = score(
      attributes(3) +
        note("C", 4, 1, "eighth", triplet).repeat(3) +
        note("D", 4, 3, "quarter") +
        note("E", 4, 6, "half"),
    );
    const document = readScore(text);
    expect(editErrorOf(() => writeNote(document, { measure: 0, onset: 0 }, { pitch: D4, length: quarter }))).toBe(
      "unsupported_rhythm",
    );
    expect(scoreText(document)).toBe(text);
    // Outside the tuplet, the divisions rise as needed.
    writeNote(document, { measure: 0, onset: 0.25 }, { pitch: D4, length: eighth });
    expect(scoreText(document)).toContain("<divisions>6</divisions>");
    const numbered = score(attributes(1) + note("C", 4, 4, "whole")).replace(`number="1"`, `number="1a"`);
    const unnumbered = readScore(numbered);
    expect(
      editErrorOf(() => writeNote(unnumbered, { measure: 0, onset: 0.5 }, { pitch: C4, length: { type: "whole" } })),
    ).toBe("measure_numbers");
    expect(scoreText(unnumbered)).toBe(numbered);
  });

  it("refuses a score that cannot be edited", () => {
    const text = score(attributes(1) + note("C", 4, 4, "whole")).replace(
      "</part></score-partwise>",
      `</part><part id="P2"><measure number="1"/></part></score-partwise>`,
    );
    const document = readScore(text);
    expect(editErrorOf(() => writeNote(document, { measure: 0, onset: 0 }, { pitch: C4, length: quarter }))).toBe(
      "not_editable",
    );
  });

  it("keeps the rest of MuseScore's file as it was", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    writeNote(
      document,
      { measure: 3, onset: 0 },
      { pitch: { step: "B", alter: 0, octave: 4 }, length: { type: "half" } },
    );
    const before = `      <note default-x="12.5" default-y="-30">
        <pitch>
          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>whole</type>
        <lyric number="1" default-x="6.74" default-y="-40.32" relative-y="-30">`;
    const after = `      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>half</type>
        <stem>down</stem>
        <lyric number="1" default-x="6.74" default-y="-40.32" relative-y="-30">`;
    const added = `
      <note>
        <rest/>
        <duration>4</duration>
        <voice>1</voice>
        <type>half</type>
        </note>`;
    expect(text).toContain(before);
    const end = `<text>way.</text>\n          </lyric>\n        </note>`;
    expect(scoreText(document)).toBe(text.replace(before, after).replace(end, `${end}${added}`));
  });
});

describe("setLength", () => {
  it("leaves rests after a shorter note, keeping what it carries", () => {
    const lyric = `<lyric number="1"><text>la</text></lyric>`;
    const { document, notes } = notesOf(score(attributes(2) + note("C", 4, 8, "whole", lyric)));
    const edit = setLength(document, notes[0]!, quarter);
    expect(summary(document)).toEqual([["C4 quarter", "r quarter", "r half"]]);
    expect(edit.notes[0]).toBe(notes[0]);
    expect(edit.next).toEqual({ measure: 0, onset: 0.25 });
    expect(scoreText(document)).toContain(`<type>quarter</type>${lyric}`);
  });

  it("overwrites what follows with a longer one, across the barline with a tie", () => {
    const { document, notes } = notesOf(
      score(attributes(2) + note("C", 4, 2, "quarter") + note("D", 4, 2, "quarter") + note("E", 4, 4, "half"), rest(8)),
    );
    setLength(document, notes[0]!, { type: "half", dots: 1 });
    expect(summary(document)).toEqual([["C4 half.", "r quarter"], ["r measure"]]);
    setLength(document, notes[0]!, { type: "whole", dots: 1 });
    expect(summary(document)).toEqual([["C4 whole-"], ["~C4 half", "r half"]]);
  });

  it("lengthens a chord's notes and a rest", () => {
    const chord = note("E", 4, 1, "quarter").replace("<pitch>", "<chord/><pitch>");
    const { document, notes } = notesOf(score(attributes(1) + note("C", 4, 1, "quarter") + chord + rest(3, "half")));
    setLength(document, notes[1]!, { type: "half" });
    expect(summary(document)).toEqual([["C4+E4 half", "r half"]]);
    setLength(document, document.root.getElementsByTagName("note")[2]!, quarter);
    expect(summary(document)).toEqual([["C4+E4 half", "r quarter", "r quarter"]]);
  });

  it("undoes a tie when the note's end moves", () => {
    const { document, notes } = notesOf(
      score(
        attributes(1) +
          note("C", 4, 2, "half") +
          note("A", 4, 2, "half").replace("<voice>", `<tie type="start"/><voice>`),
        note("A", 4, 4, "whole").replace("<voice>", `<tie type="stop"/><voice>`),
      ),
    );
    setLength(document, notes[1]!, quarter);
    expect(summary(document)).toEqual([["C4 half", "A4 quarter", "r quarter"], ["A4 whole"]]);
  });

  it("refuses grace notes, lengths MusicXML has not, and notes of another score", () => {
    const grace = `<note><grace/><pitch><step>B</step><octave>3</octave></pitch><voice>1</voice><type>eighth</type></note>`;
    const { document, notes } = notesOf(score(attributes(1) + grace + note("C", 4, 4, "whole")));
    expect(editErrorOf(() => setLength(document, notes[0]!, quarter))).toBe("unsupported_rhythm");
    expect(editErrorOf(() => setLength(document, notes[1]!, { type: "maxima", dots: 9 }))).toBe("invalid_length");
    const other = readScore(score(attributes(1) + note("C", 4, 4, "whole")));
    expect(editErrorOf(() => setLength(document, other.root.getElementsByTagName("note")[0]!, quarter))).toBe(
      "not_in_score",
    );
  });
});
