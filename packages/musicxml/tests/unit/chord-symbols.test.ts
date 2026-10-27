import { describe, expect, it } from "vitest";

import {
  chordSymbolAt,
  harmonyText,
  mapScore,
  nextChordSymbolPosition,
  previousChordSymbolPosition,
  readScore,
  removeChordSymbol,
  scoreText,
  setChordSymbol,
} from "../../src";
import { nth, refusal, replaceOnce, twoParts } from "../editing";
import { fixtureText, score } from "../fixtures";

const note = (step: string, duration = 1, extra = "") =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice>${extra}</note>`;
const attributes = (beats = 4, beatType = 4) =>
  `<attributes><divisions>1</divisions><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time></attributes>`;

describe("setChordSymbol", () => {
  it("writes a new chord symbol right before its note, as MuseScore lays it out", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    const harmony = setChordSymbol(document, nth(document, "note", 5), "Bb7b9");
    expect(harmonyText(harmony)).toBe("Bb7b9");
    expect(document.revision).toBe(1);
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `          </lyric>
        </note>
      <note default-x="71.13" default-y="-35">`,
        `          </lyric>
        </note>
      <harmony print-frame="no">
        <root>
          <root-step>B</root-step>
          <root-alter>-1</root-alter>
          </root>
        <kind text="7">dominant</kind>
        <degree>
          <degree-value>9</degree-value>
          <degree-alter>-1</degree-alter>
          <degree-type>add</degree-type>
          </degree>
        </harmony>
      <note default-x="71.13" default-y="-35">`,
      ),
    );
  });

  it("replaces the chord of one already there, keeping the rest of it", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    setChordSymbol(document, nth(document, "note", 4), "Am7/G");
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `<root>
          <root-step>D</root-step>
          </root>
        <kind text="7">dominant</kind>
        </harmony>`,
        `<root>
          <root-step>A</root-step>
          </root>
        <kind text="m7">minor-seventh</kind>
        <bass arrangement="horizontal">
          <bass-step>G</bass-step>
          </bass>
        </harmony>`,
      ),
    );
    // The same chord again changes nothing in the file.
    const again = scoreText(document);
    setChordSymbol(document, nth(document, "note", 4), "Am7/G");
    expect(scoreText(document)).toBe(again);
    expect(document.revision).toBe(2);
  });

  it("writes the degrees a spelling implies with print-object='no', as MusicXML 4.0 asks", () => {
    const document = readScore(score(attributes() + note("C", 4)));
    setChordSymbol(document, nth(document, "note", 0), "C7sus4");
    expect(scoreText(document)).toContain(
      `<harmony print-frame="no"><root><root-step>C</root-step></root><kind text="7sus4">suspended-fourth</kind><degree print-object="no"><degree-value>7</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree></harmony>`,
    );
  });

  it("keeps a harmony's offset, staff and attributes, and drops the fretboard of the old chord", () => {
    const harmony = `<harmony placement="above" color="#FF0000"><root><root-step>G</root-step></root><kind>major</kind><frame><frame-strings>6</frame-strings><frame-frets>4</frame-frets></frame><staff>1</staff></harmony>`;
    const document = readScore(score(attributes() + harmony + note("C", 4)));
    setChordSymbol(document, nth(document, "note", 0), "N.C.");
    expect(scoreText(document)).toContain(
      `<harmony placement="above" color="#FF0000"><root><root-step text="">C</root-step></root><kind text="N.C.">none</kind><staff>1</staff></harmony>`,
    );
  });

  it("writes a chord change within a note with its offset, after the note's own chord", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    setChordSymbol(document, { measure: 3, onset: 0.5 }, "D7");
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `<kind>major</kind>
        </harmony>
      <note default-x="12.5" default-y="-30">`,
        `<kind>major</kind>
        </harmony>
      <harmony print-frame="no">
        <root>
          <root-step>D</root-step>
          </root>
        <kind text="7">dominant</kind>
        <offset>4</offset>
        </harmony>
      <note default-x="12.5" default-y="-30">`,
      ),
    );
    const map = mapScore(document.root)!;
    expect(harmonyText(chordSymbolAt(map, { measure: 3, onset: 0.5 })!)).toBe("D7");
    expect(harmonyText(chordSymbolAt(map, nth(document, "note", 11))!)).toBe("G");
    expect(chordSymbolAt(map, { measure: 3, onset: 0.25 })).toBeNull();
  });

  it("goes before a moment's directions, a chord's first note and its grace notes", () => {
    const document = readScore(
      score(
        `${attributes()}<direction><direction-type><words>Swing</words></direction-type></direction>` +
          `<note><grace/><pitch><step>B</step><octave>3</octave></pitch><voice>1</voice></note>` +
          note("C", 2) +
          note("E", 2, "<chord/>") +
          note("D", 2),
      ),
    );
    setChordSymbol(document, nth(document, "note", 2), "C");
    setChordSymbol(document, { measure: 0, onset: 0.75 }, "G7");
    expect(scoreText(document)).toContain(
      `</attributes><harmony print-frame="no"><root><root-step>C</root-step></root><kind>major</kind></harmony><direction>`,
    );
    expect(scoreText(document)).toContain(
      `<harmony print-frame="no"><root><root-step>G</root-step></root><kind text="7">dominant</kind><offset>1</offset></harmony>${note("D", 2)}`,
    );
  });

  it("writes a measure without notes at its end", () => {
    const document = readScore(
      score(`${attributes()}<barline location="right"><bar-style>light-heavy</bar-style></barline>`),
    );
    setChordSymbol(document, { measure: 0, onset: 0 }, "F");
    expect(scoreText(document)).toContain(
      `</attributes><harmony print-frame="no"><root><root-step>F</root-step></root><kind>major</kind></harmony><barline`,
    );
  });

  it("refuses unreadable text, moments outside the score and other scores", () => {
    const document = readScore(fixtureText("musescore/lead-sheet.musicxml"));
    expect(refusal(document, () => setChordSymbol(document, nth(document, "note", 0), "Hm7"))).toBe(
      "chord_symbol_unreadable",
    );
    expect(refusal(document, () => setChordSymbol(document, { measure: 4, onset: 0 }, "C"))).toBe("not_in_score");
    expect(refusal(document, () => setChordSymbol(document, { measure: 0, onset: 1 }, "C"))).toBe("not_in_score");
    expect(refusal(document, () => setChordSymbol(document, { measure: 0, onset: -0.25 }, "C"))).toBe("not_in_score");
    const parts = twoParts();
    expect(refusal(parts, () => setChordSymbol(parts, { measure: 0, onset: 0 }, "C"))).toBe("not_editable");
  });
});

describe("removeChordSymbol", () => {
  it("removes the harmony with its line, and refuses where there is none", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    removeChordSymbol(document, nth(document, "note", 9));
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `
      <harmony print-frame="no">
        <root>
          <root-step>C</root-step>
          </root>
        <kind>major</kind>
        </harmony>`,
        "",
      ),
    );
    expect(refusal(document, () => removeChordSymbol(document, nth(document, "note", 9)))).toBe("no_chord_symbol");
  });
});

describe("moving between chord-symbol positions", () => {
  it("goes to the next note or beat, whichever comes first, as MuseScore's Space does", () => {
    const map = mapScore(readScore(fixtureText("musescore/lead-sheet.musicxml")).root)!;
    const steps = [{ measure: 0, onset: 0 }];
    for (;;) {
      const next = nextChordSymbolPosition(map, steps.at(-1)!);
      if (!next) break;
      steps.push(next);
    }
    expect(steps.map((step) => `${step.measure}:${step.onset}`)).toEqual([
      "0:0",
      "0:0.25",
      "0:0.375",
      "0:0.5",
      "0:0.75",
      "1:0",
      "1:0.25",
      "1:0.5",
      "1:0.75",
      "2:0",
      "2:0.25",
      "2:0.5",
      "2:0.75",
      "2:0.875",
      "3:0",
      "3:0.25",
      "3:0.5",
      "3:0.75",
    ]);
    const back = [steps.at(-1)!];
    for (;;) {
      const previous = previousChordSymbolPosition(map, back.at(-1)!);
      if (!previous) break;
      back.push(previous);
    }
    expect(back.reverse()).toEqual(steps);
  });

  it("counts compound time in dotted beats and goes by notes without a time signature", () => {
    const compound = mapScore(readScore(score(attributes(6, 8) + note("C", 3) + note("D", 3))).root)!;
    expect(nextChordSymbolPosition(compound, { measure: 0, onset: 0 })).toEqual({ measure: 0, onset: 0.375 });
    const free = mapScore(
      readScore(score(`<attributes><divisions>1</divisions></attributes>${note("C", 3)}${note("D", 1)}`)).root,
    )!;
    expect(nextChordSymbolPosition(free, { measure: 0, onset: 0 })).toEqual({ measure: 0, onset: 0.75 });
    expect(nextChordSymbolPosition(free, { measure: 0, onset: 0.75 })).toBeNull();
  });
});
