import { describe, expect, it } from "vitest";

import { addTiedNote, readScore, scoreText, toggleTie } from "../../src";
import { addTie, chordOf, hasTie, nextChord, previousChord, removeTie, tiePartner, untie } from "../../src/edit/ties";
import { attributes, editErrorOf, note, rest, summary } from "../editing";
import { fixtureText, score } from "../fixtures";

const notesOf = (text: string) => {
  const document = readScore(text);
  return { document, notes: Array.from(document.root.getElementsByTagName("note")) };
};

describe("ties in the XML", () => {
  it("writes both ends twice, a stop before a start, and removes notations left empty", () => {
    const { document, notes } = notesOf(
      score(attributes(1) + note("C", 4, 4, "whole", "<notations><fermata/></notations>")),
    );
    const [first] = notes;
    addTie(first!, "start");
    addTie(first!, "stop");
    addTie(first!, "stop");
    expect(scoreText(document)).toContain(
      `<duration>4</duration><tie type="stop"/><tie type="start"/><voice>1</voice><type>whole</type><notations><tied type="stop"/><tied type="start"/><fermata/></notations>`,
    );
    removeTie(first!, "start");
    removeTie(first!, "stop");
    expect(scoreText(document)).toContain(`<type>whole</type><notations><fermata/></notations></note>`);
    const bare = notesOf(score(attributes(1) + note("C", 4, 4, "whole")));
    addTie(bare.notes[0]!, "start");
    removeTie(bare.notes[0]!, "start");
    expect(scoreText(bare.document)).toBe(score(attributes(1) + note("C", 4, 4, "whole")));
  });

  it("finds chords and tie partners across barlines, past grace notes and other elements", () => {
    const grace = `<note><grace/><pitch><step>B</step><octave>3</octave></pitch><voice>1</voice><type>eighth</type></note>`;
    const { notes } = notesOf(
      score(
        attributes(1) + note("C", 4, 4, "whole") + note("E", 4, 4, "whole").replace("<pitch>", "<chord/><pitch>"),
        `<direction><direction-type><words>x</words></direction-type></direction>${grace}${note("E", 4, 4, "whole")}`,
      ),
    );
    expect(chordOf(notes[1]!)).toEqual([notes[0], notes[1]]);
    expect(nextChord(notes[0]!)).toEqual([notes[3]]);
    expect(nextChord(notes[3]!)).toBeNull();
    expect(previousChord(notes[3]!)).toEqual([notes[0], notes[1]]);
    expect(previousChord(notes[0]!)).toBeNull();
    expect(tiePartner(notes[1]!, "start")).toBe(notes[3]);
    expect(tiePartner(notes[0]!, "start")).toBeNull();
    expect(tiePartner(notes[3]!, "stop")).toBe(notes[1]);
    expect(hasTie(notes[0]!, "start")).toBe(false);
    expect(untie(notes[0]!)).toEqual([]);
  });
});

describe("toggleTie", () => {
  it("ties a note to the next one of its pitch, and unties it again", () => {
    const text = score(attributes(1) + note("C", 4, 2, "half") + note("A", 4, 2, "half"), note("A", 4, 4, "whole"));
    const { document, notes } = notesOf(text);
    expect(toggleTie(document, notes[1]!)).toBe(notes[2]);
    expect(summary(document)).toEqual([["C4 half", "A4 half-"], ["~A4 whole"]]);
    expect(toggleTie(document, notes[1]!)).toBeNull();
    expect(scoreText(document)).toBe(text);
    expect(document.revision).toBe(2);
  });

  it("refuses a note with no next note of its pitch, and a rest", () => {
    const { document, notes } = notesOf(score(attributes(1) + note("C", 4, 2, "half") + rest(2, "half")));
    expect(editErrorOf(() => toggleTie(document, notes[0]!))).toBe("no_tie_partner");
    expect(editErrorOf(() => toggleTie(document, notes[1]!))).toBe("not_a_note");
    expect(document.revision).toBe(0);
  });

  it("drops the accidental of a note it ties to, and writes it again when untied", () => {
    const sharp = (octave: number, duration: number, type: string) =>
      note("F", octave, duration, type, "<accidental>sharp</accidental>").replace(
        "<step>F</step>",
        "<step>F</step><alter>1</alter>",
      );
    const { document, notes } = notesOf(
      score(attributes(1) + note("C", 4, 2, "half") + sharp(4, 2, "half"), sharp(4, 4, "whole")),
    );
    toggleTie(document, notes[1]!);
    expect(scoreText(document).match(/<accidental>/g)).toHaveLength(1);
    toggleTie(document, notes[1]!);
    expect(scoreText(document).match(/<accidental>/g)).toHaveLength(2);
  });

  it("ties MuseScore's notes as MuseScore writes ties", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    const notes = document.root.getElementsByTagName("note");
    // Untie the A across the second barline: the file is MuseScore's own without its tie.
    toggleTie(document, notes[6]!);
    const untied = text
      .replace(`\n        <tie type="start"/>`, "")
      .replace(`\n        <notations>\n          <tied type="start"/>\n          </notations>`, "")
      .replace(`\n        <tie type="stop"/>`, "")
      .replace(`\n        <notations>\n          <tied type="stop"/>\n          </notations>`, "");
    expect(scoreText(document)).toBe(untied);
    // Tied again, it is written exactly as MuseScore wrote it, layout included.
    toggleTie(document, notes[6]!);
    expect(scoreText(document)).toBe(text);
  });
});

describe("addTiedNote", () => {
  it("adds a tied note of the same pitch and length after the note, overwriting what follows", () => {
    const { document, notes } = notesOf(
      score(
        attributes(2) +
          note("C", 4, 2, "quarter") +
          note("D", 4, 1, "eighth") +
          note("E", 4, 1, "eighth") +
          rest(4, "half"),
      ),
    );
    const edit = addTiedNote(document, notes[0]!);
    expect(summary(document)).toEqual([["C4 quarter-", "~C4 quarter", "r half"]]);
    expect(edit.next).toEqual({ measure: 0, onset: 0.5 });
    const again = addTiedNote(document, edit.notes[0]!, { type: "whole" });
    expect(summary(document)).toEqual([
      ["C4 quarter-", "~C4 quarter-", "~C4 half-"],
      ["~C4 half", "r half"],
    ]);
    expect(again.notes).toHaveLength(2);
  });

  it("ties a whole chord, and refuses rests", () => {
    const { document, notes } = notesOf(
      score(
        attributes(1) +
          note("C", 4, 2, "half") +
          note("E", 4, 2, "half").replace("<pitch>", "<chord/><pitch>") +
          rest(2, "half"),
      ),
    );
    addTiedNote(document, notes[1]!);
    expect(summary(document)).toEqual([["C4+E4 half-", "~C4+E4 half"]]);
    const resting = notesOf(score(attributes(1) + rest(4)));
    expect(editErrorOf(() => addTiedNote(resting.document, resting.notes[0]!))).toBe("not_a_note");
    expect(editErrorOf(() => addTiedNote(document, notes[0]!, { type: "minim" as "half" }))).toBe("invalid_length");
  });
});
