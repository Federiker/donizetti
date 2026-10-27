import { mapScore, partsOf } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { childElements } from "../xml";
import { type AccidentalNeed, accidentalNeeds, writeAccidentals } from "./accidentals";
import { rebeamMeasure } from "./beams";
import { editableMap } from "./edit-context";
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

/** Notes whose ties or pitches changed: their measures' accidentals are written again. */
export function pitchesChanged(changes: Changes, root: Element, notes: Iterable<Element>) {
  const measures = childElements(partsOf(root)[0]!, "measure");
  for (const note of notes) {
    const index = measures.indexOf(note.parentElement as Element);
    if (index >= 0) changes.pitches.add(index);
  }
}

/** What each note's accidental needed before the edit under way on a tree (`operate`), by the tree's root. */
const needsBefore = new WeakMap<Element, Map<Element, AccidentalNeed>>();

/**
 * Writes again what follows from the changes: beams, then stems, then accidentals, those only on the notes the
 * edit changed (`writeAccidentals` given what the notes needed before it).
 */
export function finish(root: Element, changes: Changes) {
  const map = mapScore(root)!;
  for (const index of changes.rhythm) rebeamMeasure(map, index);
  updateStems(changes.notes);
  const before = needsBefore.get(root);
  for (const index of new Set([...changes.rhythm, ...changes.pitches])) writeAccidentals(map, index, before);
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
  const { part } = editableMap(document);
  for (const note of notes) {
    if (note.localName !== "note" || note.parentElement?.parentElement !== part) {
      throw new ScoreEditError("not_in_score");
    }
  }
  // What the notes' accidentals need is read first, for `finish` to leave alone those the edit does not change.
  const attempt = (root: Element, targets: Element[]) => {
    needsBefore.set(root, accidentalNeeds(mapScore(root)!));
    try {
      return run(root, targets);
    } finally {
      needsBefore.delete(root);
    }
  };
  const copy = (document.xml.cloneNode(true) as XMLDocument).documentElement;
  attempt(
    copy,
    notes.map((note) => counterpart(note, document.root, copy)),
  );
  return edit(document, () => attempt(document.root, notes));
}
