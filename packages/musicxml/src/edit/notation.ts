import { mapScore } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { writeAccidentals } from "./accidentals";
import { rebeamMeasure } from "./beams";
import { ScoreEditError } from "./edit-error";
import { operate } from "./operation";

/** Throws `not_in_score` unless the part has a measure at this index. */
function checkMeasure(root: Element, measure: number) {
  const map = mapScore(root)!;
  if (!map.measures[measure]) throw new ScoreEditError("not_in_score", { measure: String(measure) });
  return map;
}

/**
 * Writes a measure's `<accidental>`s as a reader needs them, against the key signature and the earlier notes of
 * each step and octave in the measure (`writeAccidentals`). Every note and rhythm edit does this for the
 * measures it touches.
 */
export function updateAccidentals(document: ScoreDocument, measure: number) {
  operate(document, [], (root) => writeAccidentals(checkMeasure(root, measure), measure));
}

/**
 * Beams a measure's eighths and shorter by beat, as MuseScore does by default (`rebeamMeasure`). Every rhythm
 * edit does this for the measures it touches.
 */
export function rebeam(document: ScoreDocument, measure: number) {
  operate(document, [], (root) => rebeamMeasure(checkMeasure(root, measure), measure));
}
