import { mapScore, type ScoreMap } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { writeAccidentals } from "./accidentals";
import { rebeamMeasure } from "./beams";
import { measureOf } from "./edit-context";
import { operate } from "./operation";

/** The map of a score with a measure at this index (else `not_in_score`). */
function mapWith(root: Element, measure: number): ScoreMap {
  const map = mapScore(root)!;
  measureOf(map, measure);
  return map;
}

/**
 * Writes a measure's `<accidental>`s as a reader needs them, against the key signature and the earlier notes of
 * each step and octave in the measure (`writeAccidentals`). Every note and rhythm edit does this for the
 * measures it touches.
 */
export function updateAccidentals(document: ScoreDocument, measure: number) {
  operate(document, [], (root) => writeAccidentals(mapWith(root, measure), measure));
}

/**
 * Beams a measure's eighths and shorter by beat, as MuseScore does by default (`rebeamMeasure`). Every rhythm
 * edit does this for the measures it touches.
 */
export function rebeam(document: ScoreDocument, measure: number) {
  operate(document, [], (root) => rebeamMeasure(mapWith(root, measure), measure));
}
