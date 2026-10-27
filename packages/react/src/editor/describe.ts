import type { Pitch, ScoreMap } from "@donizetti/musicxml";

import { type LengthType, type Selection, selectedNote, WHOLE_NOTES } from "../editing/selection";
import type { Translate } from "../strings/translate";

const ACCIDENTALS: Record<string, string> = { "-2": "𝄫", "-1": "♭", "0": "", "1": "♯", "2": "𝄪" };

/** A pitch as musicians write it: "F♯4". */
export function pitchName(pitch: Pitch): string {
  return `${pitch.step}${ACCIDENTALS[String(pitch.alter)] ?? ""}${pitch.octave}`;
}

/** The length type nearest a length in whole notes (dotted lengths named by their note). */
function lengthTypeOf(length: number): LengthType {
  const types = Object.entries(WHOLE_NOTES) as [LengthType, number][];
  return (types.filter(([, value]) => value <= length + 1e-9).at(-1) ?? types[0]!)[0];
}

/**
 * What is selected, in words, for the status line that screen readers announce: the note and its length and
 * measure, the rest, or where note input will write.
 */
export function describeSelection(t: Translate, map: ScoreMap | null, selection: Selection): string {
  if (!map || !selection) return t("selection.none");
  const measure = map.measures[selection.measure];
  const number = measure?.number || String(selection.measure + 1);
  if (selection.kind === "cursor") {
    const beatLength = measure?.time ? 1 / measure.time.beatType : 0.25;
    return t("selection.cursor", { measure: number, beat: Math.floor(selection.onset / beatLength + 1e-9) + 1 });
  }
  const note = selectedNote(map, selection);
  if (!note) return t("selection.none");
  const length = t(`length.${lengthTypeOf(note.length)}`).toLowerCase();
  if (note.rest || !note.pitch) return t("selection.rest", { length, measure: number });
  return t("selection.note", { pitch: pitchName(note.pitch), length, measure: number });
}
