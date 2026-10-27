import { describe, expect, it } from "vitest";

import { mapScore, readScore, scoreText, setKey, setTime } from "../../src";
import { attributes, editErrorOf, note, rest, summary, withTie } from "../editing";
import { fixtureText, score } from "../fixtures";

const sharp = (octave: number, duration: number, type: string) =>
  note("F", octave, duration, type).replace("<step>F</step>", "<step>F</step><alter>1</alter>");

describe("setKey", () => {
  it("adds a key at a measure's start, the accidentals following it, in MuseScore's layout", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    const key = setKey(document, 1, 0);
    expect(key?.localName).toBe("key");
    const start = `<measure number="2" width="219.49">`;
    const added = `
      <attributes>
        <key>
          <fifths>0</fifths>
          </key>
        </attributes>`;
    const fSharp = `<alter>1</alter>
          <octave>4</octave>
          </pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>quarter</type>`;
    expect(scoreText(document)).toBe(
      text.replace(start, `${start}${added}`).replace(fSharp, `${fSharp}\n        <accidental>sharp</accidental>`),
    );
  });

  it("changes a key that is there, and removes one that would repeat the key in force", () => {
    const text = score(
      attributes(1, 4, 4, 1) + sharp(4, 4, "whole"),
      `<attributes><key><fifths>2</fifths></key></attributes>${note("C", 4, 4, "whole")}`,
    );
    const document = readScore(text);
    setKey(document, 0, -1);
    expect(scoreText(document)).toContain("<fifths>-1</fifths>");
    expect(scoreText(document)).toContain("<accidental>sharp</accidental>");
    expect(setKey(document, 1, -1)).toBeNull();
    expect(scoreText(document)).toContain(`<measure number="2"><note>`);
    expect(setKey(document, 1, -1)).toBeNull();
    expect(mapScore(document.root)!.measures[1]!.fifths).toBe(-1);
  });

  it("turns a non-traditional key into a traditional one", () => {
    const text = score(
      `<attributes><divisions>1</divisions><key><key-step>F</key-step><key-alter>1</key-alter><key-step>C</key-step><key-alter>1</key-alter></key></attributes>${note("C", 4, 4, "whole")}`,
    );
    const document = readScore(text);
    setKey(document, 0, 2);
    expect(scoreText(document)).toContain(`<key><fifths>2</fifths></key>`);
  });

  it("refuses keys beyond seven sharps or flats, and measures not in the score", () => {
    const document = readScore(score(attributes(1) + note("C", 4, 4, "whole")));
    expect(editErrorOf(() => setKey(document, 0, 8))).toBe("invalid_key");
    expect(editErrorOf(() => setKey(document, 0, 1.5))).toBe("invalid_key");
    expect(editErrorOf(() => setKey(document, 4, 1))).toBe("not_in_score");
  });
});

describe("setTime", () => {
  it("re-bars MuseScore's sheet in 3/4, every chord symbol, direction and lyric kept as written", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    expect(setTime(document, 0, 3, 4)).toEqual({ from: 0, to: 6 });
    expect(summary(document)).toEqual([
      ["G4 quarter", "A4 eighth", "B4 eighth", "D5 quarter-"],
      ["~D5 quarter", "C5 quarter", "F#4 quarter"],
      ["A4 half-", "~A4 quarter"],
      ["r quarter", "E5 quarter.", "D5 eighth"],
      ["G4 half.-"],
      ["~G4 quarter", "r quarter", "r quarter"],
    ]);
    const written = scoreText(document);
    expect(written.slice(0, text.indexOf(`<measure number="1"`))).toBe(
      text.slice(0, text.indexOf(`<measure number="1"`)),
    );
    expect(written.endsWith(text.slice(text.indexOf("    </part>")))).toBe(true);
    for (const name of ["harmony", "direction", "lyric", "print", "barline"]) {
      for (const [element] of text.matchAll(new RegExp(`<${name}[ >][\\s\\S]*?</${name}>`, "g"))) {
        expect(written).toContain(element);
      }
    }
    expect(mapScore(document.root)!.measures.map((measure) => measure.number)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(written).toContain(`<beats>3</beats>`);
    // The forward repeat starts the first bar, the backward repeat ends the last.
    expect(written.indexOf(`<repeat direction="backward"/>`)).toBeGreaterThan(written.indexOf(`<measure number="6">`));
  });

  it("splits notes across the new barlines and fills the last bar with rests", () => {
    const document = readScore(score(attributes(1) + note("C", 4, 4, "whole"), note("D", 4, 4, "whole")));
    setTime(document, 0, 3, 4);
    expect(summary(document)).toEqual([["C4 half.-"], ["~C4 quarter", "D4 half-"], ["~D4 half", "r quarter"]]);
    const jig = readScore(score(attributes(1) + note("C", 4, 4, "whole")));
    setTime(jig, 0, 6, 8);
    expect(summary(jig)).toEqual([["C4 half.-"], ["~C4 quarter", "r eighth", "r quarter."]]);
    expect(scoreText(jig)).toContain("<divisions>2</divisions>");
  });

  it("keeps bars that already fit, measure rests included", () => {
    const text = score(attributes(1, 3, 4) + rest(3), note("C", 4, 3, "half", "<dot/>"));
    const document = readScore(text);
    setTime(document, 0, 6, 8);
    expect(summary(document)).toEqual([["r measure"], ["C4 half."]]);
    expect(scoreText(document)).toBe(
      text
        .replace("<divisions>1</divisions>", "<divisions>2</divisions>")
        .replace("<beats>3</beats><beat-type>4</beat-type>", "<beats>6</beats><beat-type>8</beat-type>")
        .replace("<duration>3</duration>", "<duration>6</duration>")
        .replace("<duration>3</duration>", "<duration>6</duration>"),
    );
  });

  it("re-bars up to the next time change only, and leaves a pickup as it is", () => {
    const text = score(
      attributes(1) + note("G", 4, 1, "quarter"),
      note("C", 4, 4, "whole"),
      note("D", 4, 4, "whole"),
      `<attributes><time><beats>2</beats><beat-type>4</beat-type></time></attributes>${note("E", 4, 2, "half")}`,
    )
      .replace(`<measure number="1">`, `<measure number="0" implicit="yes">`)
      .replace(/number="(\d)"/g, (_, n) => `number="${n === "0" ? 0 : Number(n) - 1}"`);
    const document = readScore(text);
    expect(setTime(document, 0, 2, 4)).toEqual({ from: 0, to: 5 });
    expect(summary(document)).toEqual([
      ["G4 quarter"],
      ["C4 half-"],
      ["~C4 half"],
      ["D4 half-"],
      ["~D4 half"],
      ["E4 half"],
    ]);
    expect(mapScore(document.root)!.measures.map((measure) => measure.number)).toEqual(["0", "1", "2", "3", "4", "5"]);
  });

  it("numbers new bars among numbers that are not 1, 2, 3… after the one before, with a letter", () => {
    const text = score(
      attributes(1) + note("C", 4, 4, "whole"),
      note("D", 4, 4, "whole"),
      note("E", 4, 4, "whole"),
    ).replace(`number="2"`, `number="2a"`);
    const document = readScore(text);
    setTime(document, 0, 2, 4);
    // The three old measures keep their numbers in order; the new ones follow the last of them.
    expect(mapScore(document.root)!.measures.map((measure) => measure.number)).toEqual([
      "1",
      "2a",
      "3",
      "3a",
      "3b",
      "3c",
    ]);
    expect(summary(document)).toHaveLength(6);
  });

  it("writes the signature itself as it should be: a repeat removed, a symbol that no longer fits dropped", () => {
    const common = score(
      `<attributes><divisions>1</divisions><time symbol="common"><beats>4</beats><beat-type>4</beat-type></time></attributes>${note("C", 4, 4, "whole")}`,
      note("C", 4, 4, "whole"),
    );
    const document = readScore(common);
    setTime(document, 0, 2, 2);
    expect(scoreText(document)).toContain(`<time><beats>2</beats><beat-type>2</beat-type></time>`);
    const kept = readScore(
      common
        .replace("common", "cut")
        .replace("<beats>4</beats><beat-type>4</beat-type>", "<beats>2</beats><beat-type>2</beat-type>"),
    );
    setTime(kept, 0, 2, 2);
    expect(scoreText(kept)).toContain(`<time symbol="cut">`);
    const repeated = readScore(
      score(
        attributes(1) + note("C", 4, 4, "whole"),
        `<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${note("C", 4, 3, "half", "<dot/>")}`,
      ),
    );
    setTime(repeated, 1, 4, 4);
    expect(scoreText(repeated)).toContain(`<measure number="2"><note>`);
    expect(summary(repeated)).toEqual([["C4 whole"], ["C4 half.", "r quarter"]]);
    expect(setTime(repeated, 1, 4, 4)).toEqual({ from: 1, to: 2 });
    const composite = readScore(
      score(
        `<attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type><beats>3</beats><beat-type>8</beat-type></time></attributes>${note("C", 4, 4, "whole")}`,
      ),
    );
    setTime(composite, 0, 4, 4);
    expect(scoreText(composite)).toContain(`<time><beats>4</beats><beat-type>4</beat-type></time>`);
    const none = readScore(score(note("C", 4, 4, "whole")));
    setTime(none, 0, 4, 4);
    expect(scoreText(none)).toContain(
      `<attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note>`,
    );
  });

  it("undoes a tie into the next time when rests now come between", () => {
    const document = readScore(
      score(
        attributes(1) + withTie(note("C", 4, 4, "whole"), "start"),
        `<attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${withTie(note("C", 4, 4, "whole"), "stop")}`,
      ),
    );
    setTime(document, 0, 3, 4);
    expect(summary(document)).toEqual([["C4 half.-"], ["~C4 quarter", "r quarter", "r quarter"], ["C4 whole"]]);
  });

  it("refuses what the user must decide", () => {
    const repeat = `<barline location="right"><repeat direction="backward"/></barline>`;
    const cases: [string, string][] = [
      [score(attributes(1) + note("C", 4, 4, "whole") + repeat, note("C", 4, 4, "whole")), "cannot_rebar"],
      [
        score(
          attributes(1) + note("C", 4, 4, "whole"),
          `<attributes><key><fifths>2</fifths></key></attributes>${note("C", 4, 4, "whole")}`,
        ),
        "cannot_rebar",
      ],
      [
        score(attributes(1) + note("C", 4, 4, "whole"), note("C", 4, 1, "quarter")).replace(
          `<measure number="2">`,
          `<measure number="2" implicit="yes">`,
        ),
        "cannot_rebar",
      ],
      [
        score(
          attributes(1) + note("C", 4, 4, "whole"),
          `<attributes><divisions>2</divisions></attributes>${note("C", 4, 8, "whole")}`,
        ),
        "cannot_rebar",
      ],
    ];
    for (const [text, code] of cases) {
      const document = readScore(text);
      expect(editErrorOf(() => setTime(document, 0, 3, 4))).toBe(code);
      expect(scoreText(document)).toBe(text);
    }
    const document = readScore(score(attributes(1) + note("C", 4, 4, "whole")));
    expect(editErrorOf(() => setTime(document, 0, 3, 5))).toBe("invalid_time");
    expect(editErrorOf(() => setTime(document, 0, 0, 4))).toBe("invalid_time");
    expect(editErrorOf(() => setTime(document, 2, 3, 4))).toBe("not_in_score");
  });
});
