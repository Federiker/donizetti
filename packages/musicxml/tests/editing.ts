import { expect } from "vitest";

import { readScore, type ScoreDocument, ScoreEditError, scoreText } from "../src";

/**
 * Runs an edit that must be refused and returns the error's code, checking that nothing changed: neither the
 * score's text nor its revision.
 */
export function refusal(document: ScoreDocument, run: () => unknown): string {
  const before = scoreText(document);
  const revision = document.revision;
  try {
    run();
  } catch (error) {
    if (!(error instanceof ScoreEditError)) throw error;
    expect(scoreText(document)).toBe(before);
    expect(document.revision).toBe(revision);
    return error.code;
  }
  throw new Error("the edit was not refused");
}

/** Replaces `from` by `to` in the text, failing unless `from` is found exactly once. */
export function replaceOnce(text: string, from: string, to: string): string {
  const at = text.indexOf(from);
  expect(at, `"${from}" in the text`).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(from, at + 1), `"${from}" only once`).toBe(-1);
  return text.slice(0, at) + to + text.slice(at + from.length);
}

/** The `index`-th element with this name in the score (document order). */
export function nth(document: ScoreDocument, name: string, index: number): Element {
  const element = document.root.getElementsByTagName(name)[index];
  if (!element) throw new Error(`no ${name} ${index}`);
  return element;
}

/**
 * An element's XML without the layout around its children or the positions a program computed for it
 * (`default-x`, `relative-y`, a measure's `width`…): what it says, to compare with what MuseScore writes.
 */
export function meaningOf(element: Element): string {
  return new XMLSerializer()
    .serializeToString(element)
    .replace(/\s(default|relative)-[xy]="[^"]*"/g, "")
    .replace(/>\s+</g, "><");
}

/** A score with two parts, which the editor refuses (decision 4). */
export function twoParts(): ScoreDocument {
  return readScore(
    `<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"><note><rest/><duration>1</duration></note></measure></part><part id="P2"><measure number="1"/></part></score-partwise>`,
  );
}
