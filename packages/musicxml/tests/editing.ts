import { expect } from "vitest";

import { mapScore, readScore, type ScoreDocument, ScoreEditError, scoreText, wholeNotesOf } from "../src";
import { writtenLength } from "../src/edit/lengths";
import { childElement, childElements } from "../src/xml";

/**
 * Runs an edit that must be refused and returns the error's code, checking that nothing changed: neither the
 * score's text nor its revision.
 */
export function refusal(document: ScoreDocument, run: () => unknown): string {
  const before = scoreText(document);
  const revision = document.revision;
  try {
    run();
  } catch (error) {
    if (!(error instanceof ScoreEditError)) throw error;
    expect(scoreText(document)).toBe(before);
    expect(document.revision).toBe(revision);
    return error.code;
  }
  throw new Error("the edit was not refused");
}

/** Replaces `from` by `to` in the text, failing unless `from` is found exactly once. */
export function replaceOnce(text: string, from: string, to: string): string {
  const at = text.indexOf(from);
  expect(at, `"${from}" in the text`).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(from, at + 1), `"${from}" only once`).toBe(-1);
  return text.slice(0, at) + to + text.slice(at + from.length);
}

/** The `index`-th element with this name in the score (document order). */
export function nth(document: ScoreDocument, name: string, index: number): Element {
  const element = document.root.getElementsByTagName(name)[index];
  if (!element) throw new Error(`no ${name} ${index}`);
  return element;
}

/**
 * An element's XML without the layout around its children or the positions a program computed for it
 * (`default-x`, `relative-y`, a measure's `width`…): what it says, to compare with what MuseScore writes.
 */
export function meaningOf(element: Element): string {
  return new XMLSerializer()
    .serializeToString(element)
    .replace(/\s(default|relative)-[xy]="[^"]*"/g, "")
    .replace(/>\s+</g, "><");
}

/** A score with two parts, which the editor refuses (decision 4). */
export function twoParts(): ScoreDocument {
  return readScore(
    `<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"><note><rest/><duration>1</duration></note></measure></part><part id="P2"><measure number="1"/></part></score-partwise>`,
  );
}

/** A note written as in the tests: pitch and octave (`F#4`, `Bb3`, `r` for a rest) and its length. */
const pitchName = (note: Element) => {
  const pitch = childElement(note, "pitch");
  if (!pitch) return "r";
  const alter = Number(childElement(pitch, "alter")?.textContent ?? 0);
  const accidental = alter > 0 ? "#".repeat(alter) : "b".repeat(-alter);
  return `${childElement(pitch, "step")!.textContent}${accidental}${childElement(pitch, "octave")!.textContent}`;
};

const tieMarks = (note: Element) => {
  const types = childElements(note, "tie").map((tie) => tie.getAttribute("type"));
  const tied = childElements(childElement(note, "notations") ?? note, "tied").map((tie) => tie.getAttribute("type"));
  // Both ways of writing a tie must agree.
  expect(tied.sort()).toEqual([...types].sort());
  return { start: types.includes("start"), stop: types.includes("stop") };
};

/**
 * Each measure's notes as short text, checking as it goes that every bar adds up and every note's type, dots
 * and duration agree: `C4 quarter`, `r half.` (a dotted half rest), `G4+B4 eighth` (a chord), `~A4 quarter-`
 * (tied from the note before and to the next), `r measure` (a measure rest).
 */
export function summary(document: ScoreDocument): string[][] {
  const map = mapScore(document.root)!;
  return map.measures.map((measure) => {
    const notes: string[] = [];
    for (const mapped of measure.notes) {
      const note = mapped.element;
      const length = writtenLength(note);
      if (length) expect(mapped.length).toBeCloseTo(wholeNotesOf(length), 9);
      else expect(childElement(note, "rest")?.getAttribute("measure")).toBe("yes");
      const { start, stop } = tieMarks(note);
      const name = pitchName(note);
      if (mapped.chord) {
        notes[notes.length - 1] = notes.at(-1)!.replace(" ", `+${name} `);
        continue;
      }
      const written = length ? `${length.type}${".".repeat(length.dots ?? 0)}` : "measure";
      notes.push(`${stop ? "~" : ""}${name} ${written}${start ? "-" : ""}`);
    }
    if (measure.expectedLength !== null && !measure.implicit)
      expect(measure.length).toBeCloseTo(measure.expectedLength, 9);
    return notes;
  });
}

/** The code of the ScoreEditError a call throws, or undefined when it throws none. */
export function editErrorOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof ScoreEditError) return error.code;
    throw error;
  }
  return undefined;
}

/** A pitched note of a small score, `<pitch>` and `<duration>` (divisions as the score sets), with its type. */
export const note = (step: string, octave: number, duration: number, type: string, extra = "") =>
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice><type>${type}</type>${extra}</note>`;

/** A rest of a small score. */
export const rest = (duration: number, type?: string) =>
  `<note><rest${type ? "" : ` measure="yes"`}/><duration>${duration}</duration><voice>1</voice>${type ? `<type>${type}</type>` : ""}</note>`;

/** A note of a small score with one end of a tie, written both ways: `<tie>` and `<notations><tied>`. */
export const withTie = (text: string, type: "start" | "stop") =>
  text
    .replace("<voice>", `<tie type="${type}"/><voice>`)
    .replace("</note>", `<notations><tied type="${type}"/></notations></note>`);

/** The `<attributes>` of a small score's first measure. */
export const attributes = (divisions: number, beats = 4, beatType = 4, fifths = 0) =>
  `<attributes><divisions>${divisions}</divisions><key><fifths>${fifths}</fifths></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`;
