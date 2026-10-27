import { describe, expect, it } from "vitest";

import { cursorSteps, type ScoreStep, stepAt, stepOfNote } from "../src/cursor";
import { scoreNotes } from "../src/timing";
import { sheet } from "./sheet";

describe("the cursor", () => {
  it("times its steps as played, and finds the step of a written note the first time it is played", async () => {
    const score = await sheet("repeats-and-endings.musicxml");
    const timing = scoreNotes(score);
    // The cursor walks OSMD's iterator as osmd.cursor does (drawing needs a real browser).
    let iterator = score.MusicPartManager.getIterator();
    const cursor = {
      get Iterator() {
        return iterator;
      },
      reset: () => {
        iterator = score.MusicPartManager.getIterator();
      },
      next: () => iterator.moveToNextVisibleVoiceEntry(false),
    };
    const steps = cursorSteps(cursor, timing);
    expect(steps.map((step) => [step.seconds, step.measure])).toEqual([
      [0, 0],
      [4, 1],
      [8, 0],
      [12, 2],
      [16, 3],
      [20, 3],
      [24, 4],
    ]);
    expect(stepOfNote(steps, 0, 0)).toBe(0);
    expect(stepOfNote(steps, 2, 0)).toBe(3);
    expect(stepOfNote(steps, 4, 0.5)).toBe(6);
    expect(stepOfNote(steps, 9, 0)).toBeNull();
    // The cursor is left at the start.
    expect(cursor.Iterator.CurrentEnrolledTimestamp.RealValue).toBe(0);
  });

  const steps: ScoreStep[] = [
    { seconds: 0, measure: 0, inMeasure: 0.25 },
    { seconds: 1, measure: 0, inMeasure: 0.5 },
    { seconds: 2, measure: 1, inMeasure: 0 },
  ];

  it("finds the step a note is part of within a measure", () => {
    expect(stepOfNote(steps, 0, 0.6)).toBe(1);
    expect(stepOfNote(steps, 0, 0.3)).toBe(0);
    // Before the measure's first step: that step.
    expect(stepOfNote(steps, 0, 0)).toBe(0);
    expect(stepOfNote(steps, 1, 0.75)).toBe(2);
  });

  it("finds the step the music has reached", () => {
    expect(stepAt(steps, -1)).toBe(0);
    expect(stepAt(steps, 0)).toBe(0);
    expect(stepAt(steps, 0.99)).toBe(0);
    expect(stepAt(steps, 1)).toBe(1);
    expect(stepAt(steps, 7)).toBe(2);
    expect(stepAt([], 3)).toBe(0);
  });
});
