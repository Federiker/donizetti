import { editabilityOf } from "../editability";
import { mapScore, partsOf, type ScoreMap } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { childElements } from "../xml";
import { writeAccidentals } from "./accidentals";
import { rebeamMeasure } from "./beams";
import { ScoreEditError } from "./edit-error";
import { updateStems } from "./stems";
import { edit } from "./xml-edit";

/** What an edit changed, for the notation that follows from it to be written again when it is done. */
export type Changes = {
  /** Measures whose rhythm changed: beamed again, their accidentals written again. */
  rhythm: Set<number>;
  /** Measures whose pitches changed: their accidentals written again. */
  pitches: Set<number>;
  /** Notes new or changed in pitch: their stems (and their chords' and beamed groups') set again. */
  notes: Set<Element>;
};

export const noChanges = (): Changes => ({ rhythm: new Set(), pitches: new Set(), notes: new Set() });

/** A note's measure, as its index in the part, or −1 when it is not in one. */
export function measureIndexOf(map: ScoreMap, note: Element): number {
  return map.measures.findIndex((measure) => measure.element === note.parentElement);
}

/** Notes whose ties or pitches changed: their measures' accidentals are written again. */
export function pitchesChanged(changes: Changes, root: Element, notes: Iterable<Element>) {
  const measures = childElements(partsOf(root)[0]!, "measure");
  for (const note of notes) {
    const index = measures.indexOf(note.parentElement as Element);
    if (index >= 0) changes.pitches.add(index);
  }
}

/** Writes again what follows from the changes: beams, then stems, then accidentals. */
export function finish(root: Element, changes: Changes) {
  const map = mapScore(root)!;
  for (const index of changes.rhythm) rebeamMeasure(map, index);
  updateStems(changes.notes);
  for (const index of new Set([...changes.rhythm, ...changes.pitches])) writeAccidentals(map, index);
}

/** The element at the same place in another copy of the tree. */
function counterpart(element: Element, root: Element, copy: Element): Element {
  const path: number[] = [];
  for (let node = element; node !== root; node = node.parentElement!) {
    path.unshift(Array.prototype.indexOf.call(node.parentElement!.children, node));
  }
  let found = copy;
  for (const index of path) found = found.children[index]!;
  return found;
}

/**
 * Runs an edit operation as one change of the document (`edit`, so its revision rises), or not at all: the score
 * must be editable (decision 4) and the notes given must be its part's; the operation is tried first on a copy of
 * the score, so that one it cannot complete throws its `ScoreEditError` with nothing changed.
 */
export function operate<T>(document: ScoreDocument, notes: Element[], run: (root: Element, notes: Element[]) => T): T {
  if (!editabilityOf(document.root).editable) throw new ScoreEditError("not_editable");
  const part = partsOf(document.root)[0]!;
  for (const note of notes) {
    if (note.localName !== "note" || note.parentElement?.parentElement !== part) {
      throw new ScoreEditError("not_in_score");
    }
  }
  const copy = (document.xml.cloneNode(true) as XMLDocument).documentElement;
  run(
    copy,
    notes.map((note) => counterpart(note, document.root, copy)),
  );
  return edit(document, () => run(document.root, notes));
}
