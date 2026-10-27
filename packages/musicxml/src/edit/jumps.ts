import type { ScoreDocument } from "../score-document";
import { childElement, childElements } from "../xml";
import { editableMap, insertInMeasure, measureOf } from "./edit-context";
import { ScoreEditError } from "./edit-error";
import { createElement, edit, removeElement } from "./xml-edit";

/** The navigation marks of a lead sheet: where a repeat goes back to or on to, and where it ends. */
export type NavigationMark =
  | "segno"
  | "coda"
  | "to-coda"
  | "fine"
  | "da-capo"
  | "da-capo-al-fine"
  | "da-capo-al-coda"
  | "dal-segno"
  | "dal-segno-al-fine"
  | "dal-segno-al-coda";

type MarkWriting = {
  /** At the start of its measure (where the music is gone back or on to) or at its end (where it leaves). */
  at: "start" | "end";
  /** Its sign (`<segno/>`, `<coda/>`) or its words. */
  sign?: "segno" | "coda";
  words?: string;
  /** Its `<sound>` attributes, for playback: the segno and coda values MuseScore 4 writes. */
  sound: Record<string, string>;
};

/** How MuseScore 4 writes each mark (its own markers and jumps, exported): above the staff. */
const MARKS: Record<NavigationMark, MarkWriting> = {
  segno: { at: "start", sign: "segno", sound: { segno: "segno" } },
  coda: { at: "start", sign: "coda", sound: { coda: "codab" } },
  "to-coda": { at: "end", words: "To Coda", sound: { tocoda: "codab" } },
  fine: { at: "end", words: "Fine", sound: { fine: "yes" } },
  "da-capo": { at: "end", words: "D.C.", sound: { dacapo: "yes" } },
  "da-capo-al-fine": { at: "end", words: "D.C. al Fine", sound: { dacapo: "yes" } },
  "da-capo-al-coda": { at: "end", words: "D.C. al Coda", sound: { dacapo: "yes" } },
  "dal-segno": { at: "end", words: "D.S.", sound: { dalsegno: "segno" } },
  "dal-segno-al-fine": { at: "end", words: "D.S. al Fine", sound: { dalsegno: "segno" } },
  "dal-segno-al-coda": { at: "end", words: "D.S. al Coda", sound: { dalsegno: "segno" } },
};

const JUMPS = new Set<NavigationMark>([
  "da-capo",
  "da-capo-al-fine",
  "da-capo-al-coda",
  "dal-segno",
  "dal-segno-al-fine",
  "dal-segno-al-coda",
]);

/** A jump's mark from its words, which say where it plays to (D.S. al Coda): the plain jump otherwise. */
function jumpFromWords(words: string, jump: "da-capo" | "dal-segno"): NavigationMark {
  if (/al\s+fine/i.test(words)) return `${jump}-al-fine`;
  if (/al\s+coda/i.test(words)) return `${jump}-al-coda`;
  return jump;
}

/** Words that name a mark, read when a program wrote no `<sound>` for it. */
function markFromWords(words: string): NavigationMark | null {
  const text = words.trim().toLowerCase().replace(/\s+/g, " ");
  if (text === "fine") return "fine";
  if (text === "to coda") return "to-coda";
  if (/^(d\.\s?c\.|da capo)/.test(text)) return jumpFromWords(text, "da-capo");
  if (/^(d\.\s?s\.|dal segno)/.test(text)) return jumpFromWords(text, "dal-segno");
  return null;
}

/** The navigation mark a `<direction>` writes, or null: from its `<sound>`, its sign or its words. */
export function navigationMarkOf(direction: Element): NavigationMark | null {
  const sound = childElement(direction, "sound");
  const types = childElements(direction, "direction-type").flatMap((type) => Array.from(type.children));
  const words = types
    .filter((child) => child.localName === "words")
    .map((child) => child.textContent ?? "")
    .join(" ");
  if (sound?.hasAttribute("segno") || types.some((child) => child.localName === "segno")) return "segno";
  if (sound?.hasAttribute("coda") || types.some((child) => child.localName === "coda")) return "coda";
  if (sound?.hasAttribute("tocoda")) return "to-coda";
  if (sound?.hasAttribute("fine")) return "fine";
  if (sound?.getAttribute("dacapo") === "yes") return jumpFromWords(words, "da-capo");
  if (sound?.hasAttribute("dalsegno")) return jumpFromWords(words, "dal-segno");
  return markFromWords(words);
}

/** The navigation marks of a measure, each with its `<direction>`, in order. */
export function navigationMarksOf(measure: Element): { mark: NavigationMark; direction: Element }[] {
  return childElements(measure, "direction").flatMap((direction) => {
    const mark = navigationMarkOf(direction);
    return mark ? [{ mark, direction }] : [];
  });
}

function directionFor(xml: XMLDocument, mark: NavigationMark): Element {
  const writing = MARKS[mark];
  const content = writing.sign ? createElement(xml, writing.sign) : createElement(xml, "words", writing.words);
  return createElement(
    xml,
    "direction",
    [createElement(xml, "direction-type", [content]), createElement(xml, "sound", undefined, writing.sound)],
    { placement: "above" },
  );
}

/**
 * Writes a navigation mark in a measure, as MuseScore 4 writes it: a segno or coda sign at its start, Fine,
 * To Coda and the jumps (D.C., D.S. al Coda…) in words at its end, each with its `<sound>` for playback
 * (`segno="segno"`, `coda="codab"`, `tocoda="codab"`, `fine="yes"`, `dacapo="yes"`, `dalsegno="segno"`). A
 * measure has one jump: a jump there already is replaced. The same mark there already is kept. Returns the
 * `<direction>`.
 */
export function setNavigationMark(document: ScoreDocument, measureIndex: number, mark: NavigationMark): Element {
  const measure = measureOf(editableMap(document), measureIndex);
  const marks = navigationMarksOf(measure.element);
  const same = marks.find((found) => found.mark === mark);
  const jump = JUMPS.has(mark) ? marks.find((found) => JUMPS.has(found.mark)) : undefined;
  return edit(document, (xml) => {
    if (same) return same.direction;
    const direction = directionFor(xml, mark);
    if (jump) {
      // The new jump takes the old one's place.
      const placed = insertInMeasure(measure.element, direction, jump.direction);
      removeElement(jump.direction);
      return placed;
    }
    const first = MARKS[mark].at === "start" ? (measure.notes[0]?.element ?? null) : null;
    return insertInMeasure(measure.element, direction, first);
  });
}

/** Removes a navigation mark from a measure; `no_navigation_mark` when it has none. */
export function removeNavigationMark(document: ScoreDocument, measureIndex: number, mark: NavigationMark) {
  const measure = measureOf(editableMap(document), measureIndex);
  const found = navigationMarksOf(measure.element).find((candidate) => candidate.mark === mark);
  if (!found) throw new ScoreEditError("no_navigation_mark", { mark });
  edit(document, () => removeElement(found.direction));
}
