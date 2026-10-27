import type { MusicPartManagerIterator } from "opensheetmusicdisplay";

import { MAX_STEPS, type ScoreTiming } from "./timing";

/** A step of the score's cursor: when the music reaches it, and where it is written (measure, whole notes into it). */
export type ScoreStep = { seconds: number; measure: number; inMeasure: number };

/** What `cursorSteps` needs of OSMD's cursor (`osmd.cursor`). */
export type StepCursor = { Iterator: MusicPartManagerIterator; reset: () => void; next: () => void };

/**
 * Each step of the cursor through the score as played, so it can follow the music through the repeats and be
 * moved to a note. The cursor is left at the start.
 */
export function cursorSteps(cursor: StepCursor, timing: Pick<ScoreTiming, "secondsAt">): ScoreStep[] {
  cursor.reset();
  const steps: ScoreStep[] = [];
  for (let guard = 0; !cursor.Iterator.EndReached && guard < MAX_STEPS; guard += 1) {
    const at = cursor.Iterator;
    steps.push({
      seconds: timing.secondsAt(at.CurrentEnrolledTimestamp.RealValue),
      measure: at.CurrentMeasureIndex,
      inMeasure: at.CurrentRelativeInMeasureTimestamp.RealValue,
    });
    cursor.next();
  }
  cursor.reset();
  return steps;
}

/**
 * The cursor step of a written note (its measure, and whole notes into it): the first time the music plays it,
 * or the step it is part of (the last one at or before it in that measure). Null when the measure is never played.
 */
export function stepOfNote(steps: readonly ScoreStep[], measure: number, inMeasure: number): number | null {
  let found: number | null = null;
  for (const [index, step] of steps.entries()) {
    if (step.measure !== measure) {
      if (found !== null) return found;
      continue;
    }
    if (step.inMeasure <= inMeasure + 1e-9) found = index;
    else if (found === null) return index;
    else return found;
  }
  return found;
}

/**
 * The cursor step the music has reached at a time: the last step at or before it (the first before the music
 * starts). Steps are in the order they are played, so their times only grow.
 */
export function stepAt(steps: readonly ScoreStep[], seconds: number): number {
  let low = 0;
  let high = steps.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (steps[middle]!.seconds <= seconds + 1e-9) low = middle;
    else high = middle - 1;
  }
  return low;
}
