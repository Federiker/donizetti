import type { ScoreMap } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { addToBarline, barlineAt, dropIfEmpty } from "./barlines";
import { editableMap, measureOf } from "./edit-context";
import { ScoreEditError } from "./edit-error";
import { createElement, edit, removeElement } from "./xml-edit";

/** A volta: the measures under an ending, from its start to its stop, as written. */
export type Ending = {
  /** The indices of its first and last measures. */
  from: number;
  to: number;
  /** The times through the repeat it is played, as written in `number` ("1", "1, 2"). */
  number: string;
  /** The text shown at its start ("1."), as written. */
  text: string;
  /** An open ending (`discontinue`, no hook at its end), as a last ending usually is; or one that never stops. */
  open: boolean;
  start: Element;
  /** Its `stop` or `discontinue`, or null when the file never ends it. */
  stop: Element | null;
};

/** What `setEnding` writes. */
export type EndingInput = {
  /** The times through the repeat it is played: [1], [2], [1, 2]… */
  numbers: number[];
  /** The text shown at its start; the numbers followed by a full stop ("1.", "1, 2.") when not given. */
  text?: string;
  /** No hook at its end (`type="discontinue"`), as a last ending usually is. */
  open?: boolean;
};

const endingIn = (barline: Element | null, types: string[]) =>
  barline
    ? (Array.from(barline.children).find(
        (child) => child.localName === "ending" && types.includes(child.getAttribute("type") ?? ""),
      ) ?? null)
    : null;

/** The endings of the part, in order: each from its `start` to its `stop` or `discontinue`. */
export function endingsOf(map: ScoreMap): Ending[] {
  const endings: Ending[] = [];
  let open: Ending | null = null;
  for (const [index, measure] of map.measures.entries()) {
    const start = endingIn(barlineAt(measure.element, "left"), ["start"]);
    if (start) {
      if (open) endings.push(open);
      open = {
        from: index,
        to: index,
        number: start.getAttribute("number") ?? "",
        text: start.textContent ?? "",
        open: true,
        start,
        stop: null,
      };
    }
    if (!open) continue;
    open.to = index;
    const stop = endingIn(barlineAt(measure.element, "right"), ["stop", "discontinue"]);
    if (stop) {
      open.stop = stop;
      open.open = stop.getAttribute("type") === "discontinue";
      endings.push(open);
      open = null;
    }
  }
  if (open) endings.push(open);
  return endings;
}

/**
 * Puts measures `from` to `to` under an ending, as MuseScore 4 exports one: `<ending number="1"
 * type="start">1.</ending>` in the first measure's left barline, `type="stop"` (or `discontinue` when open)
 * in the last one's right barline. Measures already under an ending are `ending_overlaps`. Returns the
 * ending written.
 */
export function setEnding(document: ScoreDocument, from: number, to: number, input: EndingInput): Ending {
  const map = editableMap(document);
  measureOf(map, from);
  measureOf(map, to);
  if (to < from) throw new ScoreEditError("invalid_ending", { reason: "order" });
  if (input.numbers.length === 0 || !input.numbers.every((number) => Number.isInteger(number) && number >= 1)) {
    throw new ScoreEditError("invalid_ending", { reason: "numbers" });
  }
  if (endingsOf(map).some((ending) => ending.from <= to && ending.to >= from)) {
    throw new ScoreEditError("ending_overlaps");
  }
  const number = input.numbers.join(", ");
  const text = input.text ?? `${number}.`;
  const type = input.open ? "discontinue" : "stop";
  return edit(document, (xml) => {
    const start = createElement(xml, "ending", text, { number, type: "start" });
    const stop = createElement(xml, "ending", undefined, { number, type });
    addToBarline(map.measures[from]!.element, "left", [start]);
    addToBarline(map.measures[to]!.element, "right", [stop]);
    return { from, to, number, text, open: input.open ?? false, start, stop };
  });
}

/** Takes away the ending a measure is under (its start and stop), leaving the measures; `no_ending` without one. */
export function removeEnding(document: ScoreDocument, measureIndex: number) {
  const map = editableMap(document);
  measureOf(map, measureIndex);
  const ending = endingsOf(map).find((candidate) => candidate.from <= measureIndex && candidate.to >= measureIndex);
  if (!ending) throw new ScoreEditError("no_ending");
  edit(document, () => {
    for (const element of [ending.start, ending.stop]) {
      if (!element) continue;
      const barline = element.parentElement!;
      removeElement(element);
      dropIfEmpty(barline);
    }
  });
}
