import { editabilityOf } from "../editability";
import { EPSILON, type MappedMeasure, type MappedNote, mapScore, type ScoreMap } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { childElement, childNumber } from "../xml";
import { ScoreEditError } from "./edit-error";
import { insertElement } from "./xml-edit";

/** A moment of the part: a measure (its index) and a time in it, in whole notes from its start. */
export type ScorePosition = { measure: number; onset: number };

/**
 * The map of a score about to be edited: a score the editor cannot change safely (decision 4) is refused with
 * `not_editable`, its reasons listed in `params.reasons`.
 */
export function editableMap(document: ScoreDocument): ScoreMap {
  const editability = editabilityOf(document.root);
  if (!editability.editable) {
    throw new ScoreEditError("not_editable", {
      reasons: editability.reasons.map((reason) => reason.code).join(","),
    });
  }
  // An editable score has a part, so it has a map.
  return mapScore(document.root)!;
}

/** The measure at this index of the part, or a `not_in_score` error. */
export function measureOf(map: ScoreMap, index: number): MappedMeasure {
  const measure = map.measures[index];
  if (!measure) throw new ScoreEditError("not_in_score", { measure: String(index) });
  return measure;
}

/** Every note of the part, in order. */
export function notesOf(map: ScoreMap): MappedNote[] {
  return map.measures.flatMap((measure) => measure.notes);
}

/** The mapped note behind a `<note>` of the part, or a `not_in_score` error. */
export function mappedNote(map: ScoreMap, note: Element): MappedNote {
  const measure = map.measures.find((candidate) => candidate.element === note.parentNode);
  const mapped = measure?.notes.find((candidate) => candidate.element === note);
  if (!mapped) throw new ScoreEditError("not_in_score");
  return mapped;
}

/** The first note of the chord a note belongs to (the note itself when it is not a chord's later note). */
export function chordHead(map: ScoreMap, note: MappedNote): MappedNote {
  const notes = map.measures[note.measure]!.notes;
  let index = notes.indexOf(note);
  while (index > 0 && notes[index]!.chord) index -= 1;
  return notes[index]!;
}

/**
 * The elements written between a note and the note before it in its measure (harmonies, directions,
 * attributes, a barline…), in order: what MusicXML places at the note's moment.
 */
export function elementsBefore(note: Element): Element[] {
  const run: Element[] = [];
  for (let sibling = note.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (["note", "backup", "forward"].includes(sibling.localName)) break;
    run.unshift(sibling);
  }
  return run;
}

/** Where a harmony or direction is written, relative to the note it comes before: its `<offset>`, in whole notes. */
export function offsetOf(element: Element, divisions: number): number {
  const offset = childElement(element, "offset");
  return offset ? (childNumber(element, "offset") ?? 0) / (4 * divisions) : 0;
}

/** A length in whole notes as a number of divisions, written without needless decimals. */
export function divisionsText(length: number, divisions: number): string {
  return String(Math.round(length * 4 * divisions * 10000) / 10000);
}

/**
 * Where something placed at a moment of a measure is written: before `anchor`, the first note starting at or
 * before that moment (grace notes included, chords by their first note), with `offset` the distance from that
 * note's start, in whole notes; `anchor` is null in a measure without notes. A moment outside the measure is a
 * `not_in_score` error.
 */
export function anchorAt(
  map: ScoreMap,
  position: ScorePosition,
): { measure: MappedMeasure; anchor: Element | null; offset: number } {
  const measure = measureOf(map, position.measure);
  const reach = Math.max(measure.length, measure.expectedLength ?? 0);
  if (position.onset < -EPSILON || (position.onset > EPSILON && position.onset >= reach - EPSILON)) {
    throw new ScoreEditError("not_in_score", { measure: String(position.measure), onset: String(position.onset) });
  }
  let start: MappedNote | null = null;
  for (const note of measure.notes) {
    if (note.chord) continue;
    if (note.onset > position.onset + EPSILON) break;
    // The first note of a moment: grace notes, then the note they lead to, share its onset.
    if (!start || note.onset > start.onset + EPSILON) start = note;
  }
  if (!start) return { measure, anchor: measure.notes[0]?.element ?? null, offset: 0 };
  const offset = position.onset - start.onset;
  return { measure, anchor: start.element, offset: Math.abs(offset) < EPSILON ? 0 : offset };
}

/** The measure's own barline at its end (`<barline location="right">`), or null. */
export function rightBarline(measure: Element): Element | null {
  return (
    Array.from(measure.children).find(
      (child) => child.localName === "barline" && child.getAttribute("location") === "right",
    ) ?? null
  );
}

/**
 * Inserts an element of a measure before `anchor`, or at the measure's end (before its closing barline) when
 * there is no anchor.
 */
export function insertInMeasure(measure: Element, element: Element, anchor: Element | null): Element {
  return insertElement(measure, element, anchor ?? rightBarline(measure));
}
