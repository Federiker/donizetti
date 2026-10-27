import { childElements } from "../xml";
import { ScoreEditError } from "./edit-error";
import { addAttributesAtStart, attributesAtStart } from "./measures";
import { createElement, insertInOrder } from "./xml-edit";

/** The tolerance when a length in whole notes is turned into divisions. */
const TOLERANCE = 1e-6;

/** The highest power of two the divisions are raised by in one edit: enough for a 1024th in any file. */
const MAX_FACTOR = 2 ** 12;

/** A length in whole notes as a number of divisions (of a quarter note), or null when it is not a whole number of them. */
export function toDivisions(wholeNotes: number, divisions: number): number | null {
  const value = wholeNotes * 4 * divisions;
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < TOLERANCE ? rounded : null;
}

/**
 * The power of two the divisions must be multiplied by so that every length (whole notes, with the divisions it
 * is counted in) is a whole number of them: 1 when they already are. Throws `unsupported_rhythm` when no power
 * of two will do (a length of a tuplet in a file without its divisions).
 */
export function divisionsFactor(lengths: { wholeNotes: number; divisions: number }[], measure: number): number {
  let factor = 1;
  for (const { wholeNotes, divisions } of lengths) {
    while (toDivisions(wholeNotes, divisions * factor) === null) {
      factor *= 2;
      if (factor > MAX_FACTOR) throw new ScoreEditError("unsupported_rhythm", { measure: String(measure) });
    }
  }
  return factor;
}

const scaleText = (element: Element, factor: number) => {
  const value = Number((element.textContent ?? "").trim());
  if (Number.isFinite(value)) element.textContent = String(value * factor);
};

/**
 * Multiplies the part's divisions by a factor, so that shorter notes can be written: every `<divisions>`, and
 * every `<duration>` (of notes, `<backup>`, `<forward>` and figured bass) and `<offset>` counted in them, so that
 * every note keeps its length. A part without `<divisions>` (one a quarter, by default) gets one in its first
 * measure's `<attributes>`.
 */
export function scaleDivisions(part: Element, factor: number) {
  if (factor === 1) return;
  const divisions = part.getElementsByTagName("divisions");
  if (divisions.length === 0) {
    const first = childElements(part, "measure")[0];
    if (first) {
      const element = createElement(part.ownerDocument, "divisions", String(factor));
      const attributes = attributesAtStart(first);
      if (attributes) insertInOrder(attributes, element, "attributes");
      else addAttributesAtStart(first, [element]);
    }
  } else for (const element of Array.from(divisions)) scaleText(element, factor);
  for (const name of ["duration", "offset"]) {
    for (const element of Array.from(part.getElementsByTagName(name))) scaleText(element, factor);
  }
}
