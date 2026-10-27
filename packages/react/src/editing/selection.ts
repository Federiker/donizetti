import type { MappedNote, ScoreMap } from "@donizetti/musicxml";

/** A written length the user picks for note input: a note type and its dots. */
export type InputLength = { type: LengthType; dots: number };

export type LengthType = "64th" | "32nd" | "16th" | "eighth" | "quarter" | "half" | "whole" | "breve";

/** Whole notes in each length type. */
export const WHOLE_NOTES: Record<LengthType, number> = {
  "64th": 1 / 64,
  "32nd": 1 / 32,
  "16th": 1 / 16,
  eighth: 1 / 8,
  quarter: 1 / 4,
  half: 1 / 2,
  whole: 1,
  breve: 2,
};

/** A length's duration in whole notes, dots included. */
export function lengthInWholeNotes(length: InputLength): number {
  let total = 0;
  let part = WHOLE_NOTES[length.type];
  for (let dot = 0; dot <= length.dots; dot += 1, part /= 2) total += part;
  return total;
}

/**
 * What is selected, kept as places rather than elements so it survives undo and redo (which replace the
 * document): a note (its measure and its index among the measure's notes), or, in note input, the cursor
 * (a measure and whole notes into it), where the next note is written.
 */
export type Selection =
  | { kind: "note"; measure: number; index: number }
  | { kind: "cursor"; measure: number; onset: number }
  | null;

/** The selection of a note element, or null when it is not in the map. */
export function selectionOf(map: ScoreMap, element: Element): Selection {
  for (const measure of map.measures) {
    const index = measure.notes.findIndex((note) => note.element === element);
    if (index >= 0) return { kind: "note", measure: measure.index, index };
  }
  return null;
}

/** The selected note, or, for the cursor, the note it stands on (the one the next entry overwrites). */
export function selectedNote(map: ScoreMap | null, selection: Selection): MappedNote | null {
  if (!map || !selection) return null;
  const measure = map.measures[selection.measure];
  if (!measure) return null;
  if (selection.kind === "note") return measure.notes[selection.index] ?? null;
  return (
    measure.notes.find((note) => !note.grace && !note.chord && Math.abs(note.onset - selection.onset) < 1e-6) ?? null
  );
}

/** The notes one can step through with the arrows: timed notes and rests, and each chord's first note. */
function steppable(map: ScoreMap): MappedNote[] {
  return map.measures.flatMap((measure) => measure.notes.filter((note) => !note.chord && !note.grace));
}

/** The selection moved to the next or previous note or rest (across measures), or the same at either end. */
export function stepSelection(map: ScoreMap, selection: Selection, direction: 1 | -1): Selection {
  const current = selectedNote(map, selection);
  const notes = steppable(map);
  if (notes.length === 0) return selection;
  const at = current ? notes.findIndex((note) => note.element === current.element) : -1;
  const next =
    notes[at < 0 ? (direction > 0 ? 0 : notes.length - 1) : Math.max(0, Math.min(notes.length - 1, at + direction))]!;
  if (selection?.kind === "cursor") return { kind: "cursor", measure: next.measure, onset: next.onset };
  return selectionOf(map, next.element);
}

/** The selection moved to the first note of the next or previous measure, or of the first or last. */
export function measureSelection(map: ScoreMap, selection: Selection, target: number): Selection {
  const measure = map.measures[Math.max(0, Math.min(map.measures.length - 1, target))];
  const first = measure?.notes.find((note) => !note.chord && !note.grace);
  if (!measure || !first) return selection;
  if (selection?.kind === "cursor") return { kind: "cursor", measure: measure.index, onset: 0 };
  return selectionOf(map, first.element);
}
