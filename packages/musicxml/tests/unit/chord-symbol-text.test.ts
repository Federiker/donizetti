import { describe, expect, it } from "vitest";

import {
  type ChordSymbol,
  chordSymbolText,
  harmonyText,
  parseChordSymbol,
  readChordSymbol,
  readScore,
} from "../../src";
import { fixtureText } from "../fixtures";

/** A chord symbol in one line: root, kind, text, symbols and parentheses, degrees, bass. */
function summary(symbol: ChordSymbol | null): string {
  if (!symbol) return "unreadable";
  const note = (value: { step: string; alter: number } | null) => (value ? `${value.step}${value.alter || ""}` : "-");
  const degrees = symbol.degrees
    .map(
      (degree) =>
        `${degree.type} ${degree.value}${degree.alter ? ` ${degree.alter}` : ""}${degree.printed ? "" : " hidden"}`,
    )
    .join(", ");
  const flags = `${symbol.useSymbols ? " symbols" : ""}${symbol.parenthesesDegrees ? " parentheses" : ""}`;
  return `${note(symbol.root)} ${symbol.kind}${symbol.text === null ? "" : ` "${symbol.text}"`}${flags}${degrees ? ` [${degrees}]` : ""}${symbol.bass ? ` /${note(symbol.bass)}` : ""}`;
}

/** What MuseScore 4.6.5 was given, in order, for tests/fixtures/musescore/chord-symbols.musicxml. */
const TYPED = [
  "C",
  "Cm",
  "Am7",
  "F/A",
  "Bb7b9",
  "F#m7b5",
  "Csus4",
  "Csus2",
  "Csus",
  "Gmaj7",
  "C6/9",
  "C6",
  "Cm6",
  "D°",
  "Ddim",
  "Dø7",
  "Dø",
  "Dm7b5",
  "C+",
  "Caug",
  "C+7",
  "C7#5",
  "Cdim7",
  "C°7",
  "E7#9",
  "C9",
  "Cmaj9",
  "Cm9",
  "C11",
  "Cm11",
  "C13",
  "Cmaj13",
  "Cm13",
  "C7sus4",
  "C7b5",
  "Cadd9",
  "Cadd2",
  "C5",
  "Cm(maj7)",
  "CmMaj7",
  "C7alt",
  "C7#11",
  "C9#11",
  "C13b9",
  "N.C.",
  "C(no3)",
  "Cmi7",
  "C-7",
  "Cmin",
  "C7b9#11",
  "Gb",
  "Ebm",
  "C/E",
  "Am/G",
  "D/F#",
  "Csus4/G",
  "C2",
  "CΔ7",
  "CM7",
  "Cma7",
  "Cm7b9",
  "C7(b9)",
  "C9sus4",
  "C(add9)",
];

describe("parseChordSymbol", () => {
  it("reads what a user types into MusicXML's terms", () => {
    expect(TYPED.map((typed) => `${typed} → ${summary(parseChordSymbol(typed))}`)).toEqual([
      "C → C major",
      'Cm → C minor "m"',
      'Am7 → A minor-seventh "m7"',
      "F/A → F major /A",
      'Bb7b9 → B-1 dominant "7" [add 9 -1]',
      'F#m7b5 → F1 half-diminished "m7b5"',
      'Csus4 → C suspended-fourth "sus4"',
      'Csus2 → C suspended-second "sus2"',
      'Csus → C suspended-fourth "sus"',
      'Gmaj7 → G major-seventh "maj7"',
      'C6/9 → C major-sixth "6/9" [add 9 hidden]',
      'C6 → C major-sixth "6"',
      'Cm6 → C minor-sixth "m6"',
      "D° → D diminished symbols",
      'Ddim → D diminished "dim"',
      'Dø7 → D half-diminished "7" symbols',
      "Dø → D half-diminished symbols",
      'Dm7b5 → D half-diminished "m7b5"',
      "C+ → C augmented symbols",
      'Caug → C augmented "aug"',
      'C+7 → C augmented-seventh "7" symbols',
      'C7#5 → C dominant "7" [alter 5 1]',
      'Cdim7 → C diminished-seventh "dim7"',
      'C°7 → C diminished-seventh "7" symbols',
      'E7#9 → E dominant "7" [add 9 1]',
      'C9 → C dominant-ninth "9"',
      'Cmaj9 → C major-ninth "maj9"',
      'Cm9 → C minor-ninth "m9"',
      'C11 → C dominant-11th "11"',
      'Cm11 → C minor-11th "m11"',
      'C13 → C dominant-13th "13"',
      'Cmaj13 → C major-13th "maj13"',
      'Cm13 → C minor-13th "m13"',
      'C7sus4 → C suspended-fourth "7sus4" [add 7 hidden]',
      'C7b5 → C dominant "7" [alter 5 -1]',
      "Cadd9 → C major [add 9]",
      "Cadd2 → C major [add 2]",
      'C5 → C power "5"',
      'Cm(maj7) → C major-minor "m(maj7)"',
      'CmMaj7 → C major-minor "mMaj7"',
      'C7alt → C dominant "7alt" [alter 5 -1 hidden, add 5 1 hidden, add 9 -1 hidden, add 9 1 hidden]',
      'C7#11 → C dominant "7" [add 11 1]',
      'C9#11 → C dominant-ninth "9" [add 11 1]',
      'C13b9 → C dominant-13th "13" [alter 9 -1]',
      'N.C. → - none "N.C."',
      "C(no3) → C major parentheses [subtract 3]",
      'Cmi7 → C minor-seventh "mi7"',
      'C-7 → C minor-seventh "7" symbols',
      'Cmin → C minor "min"',
      'C7b9#11 → C dominant "7" [add 9 -1, add 11 1]',
      "Gb → G-1 major",
      'Ebm → E-1 minor "m"',
      "C/E → C major /E",
      'Am/G → A minor "m" /G',
      "D/F# → D major /F1",
      'Csus4/G → C suspended-fourth "sus4" /G',
      'C2 → C major "2" [add 2 hidden]',
      'CΔ7 → C major-seventh "7" symbols',
      'CM7 → C major-seventh "M7"',
      'Cma7 → C major-seventh "ma7"',
      'Cm7b9 → C minor-seventh "m7" [add 9 -1]',
      'C7(b9) → C dominant "7" parentheses [add 9 -1]',
      'C9sus4 → C suspended-fourth "9sus4" [add 7 hidden, add 9 hidden]',
      "C(add9) → C major parentheses [add 9]",
    ]);
  });

  it("reads ♭ and ♯, double accidentals, other spellings of no chord and spaces around", () => {
    expect(summary(parseChordSymbol(" B♭7♭9 "))).toBe(`B-1 dominant "7" [add 9 -1]`);
    expect(parseChordSymbol("B♭7♭9")!.text).toBe("7");
    expect(summary(parseChordSymbol("F♯m7/C♯"))).toBe(`F1 minor-seventh "m7" /C1`);
    expect(summary(parseChordSymbol("Bbb"))).toBe("B-2 major");
    expect(summary(parseChordSymbol("Fx"))).toBe("F2 major");
    expect(summary(parseChordSymbol("C−7"))).toBe(`C minor-seventh "7" symbols`);
    expect(summary(parseChordSymbol("C7+5"))).toBe(`C dominant "7" [alter 5 1]`);
    expect(summary(parseChordSymbol("C7(b9, #11)"))).toBe(`C dominant "7" parentheses [add 9 -1, add 11 1]`);
    expect(summary(parseChordSymbol("C9omit3"))).toBe(`C dominant-ninth "9" [subtract 3]`);
    expect(summary(parseChordSymbol("C-Δ7"))).toBe(`C major-minor "Δ7" symbols`);
    expect(summary(parseChordSymbol("NC"))).toBe(`- none "NC"`);
    expect(summary(parseChordSymbol("C7 9"))).toBe(`C dominant "7" [add 9]`);
  });

  it("refuses what it does not read, rather than guess", () => {
    for (const typed of ["", "H7", "cm7", "Cfoo", "C7#", "C7b8", "Cno#3", "C/H", "C𝄪", "Am7/", "7"]) {
      expect(parseChordSymbol(typed), typed).toBeNull();
    }
  });
});

describe("chordSymbolText", () => {
  it("gives back what was typed", () => {
    for (const typed of TYPED) expect(chordSymbolText(parseChordSymbol(typed)!)).toBe(typed);
  });

  it("shows symbols and kinds written without text", () => {
    const shown = (kind: string, attributes = "") =>
      harmonyText(
        readScore(
          `<score-partwise><part id="P1"><measure><harmony><root><root-step>C</root-step></root><kind${attributes}>${kind}</kind></harmony></measure></part></score-partwise>`,
        ).root.getElementsByTagName("harmony")[0]!,
      );
    expect(shown("minor-seventh")).toBe("Cm7");
    expect(shown("minor-seventh", ` use-symbols="yes"`)).toBe("C-7");
    expect(shown("major-minor", ` use-symbols="yes"`)).toBe("C-Δ7");
    expect(shown("half-diminished", ` use-symbols="yes"`)).toBe("Cø");
    expect(shown("dominant", ` use-symbols="yes"`)).toBe("C7");
    expect(shown("Neapolitan")).toBe("CN6");
    expect(shown("other", ` text="?!"`)).toBe("C?!");
    expect(shown("none")).toBe("N.C.");
    expect(shown("unknown-kind")).toBe("");
    expect(shown("unknown-kind", ` text="Q"`)).toBe("Q");
  });
});

describe("reading the chord symbols of any program", () => {
  it("reads MuseScore 4's chord symbols back as text that means the same chord", () => {
    const harmonies = Array.from(
      readScore(fixtureText("musescore/chord-symbols.musicxml")).root.getElementsByTagName("harmony"),
    );
    expect(harmonies).toHaveLength(TYPED.length);
    const meaning = (symbol: ChordSymbol | null) =>
      symbol && {
        root: symbol.root,
        kind: symbol.kind,
        bass: symbol.bass,
        degrees: symbol.degrees.map((degree) => [degree.value, degree.alter]).sort(),
      };
    for (const [index, harmony] of harmonies.entries()) {
      const written = readChordSymbol(harmony)!;
      const text = harmonyText(harmony);
      // MuseScore writes "other" for what its chord list does not hold (D°, Dø7, C°7, CΔ7): the text says more.
      if (written.kind === "other") expect(parseChordSymbol(text)!.kind, TYPED[index]).not.toBe("other");
      else expect(meaning(parseChordSymbol(text)), `${TYPED[index]} shown as ${text}`).toEqual(meaning(written));
    }
    // MuseScore's quirks, shown as text that reads back: "4" for sus4, "74" for 7sus4, "/6" for 6/9.
    expect(harmonyText(harmonies[TYPED.indexOf("Csus4")]!)).toBe("Csus4");
    expect(harmonyText(harmonies[TYPED.indexOf("C7sus4")]!)).toBe("Csus4add7");
    expect(harmonyText(harmonies[TYPED.indexOf("C6/9")]!)).toBe("C6add9");
    expect(harmonyText(harmonies[TYPED.indexOf("N.C.")]!)).toBe("N.C.");
    expect(harmonyText(harmonies[TYPED.indexOf("D/F#")]!)).toBe("D/F#");
  });

  it("shows Roman numerals and functions, which have no root", () => {
    const harmonies = Array.from(
      readScore(
        `<score-partwise><part id="P1"><measure><harmony><numeral><numeral-root text="IV">4</numeral-root></numeral><kind>major</kind></harmony><harmony><numeral><numeral-root>5</numeral-root></numeral><kind>major</kind></harmony><harmony><function>V7</function><kind>dominant</kind></harmony><harmony><kind>major</kind></harmony></measure></part></score-partwise>`,
      ).root.getElementsByTagName("harmony"),
    );
    expect(harmonies.map(harmonyText)).toEqual(["IV", "5", "V7", ""]);
    expect(readChordSymbol(harmonies[0]!)).toBeNull();
  });
});
