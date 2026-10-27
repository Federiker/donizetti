import { EPSILON, type MappedMeasure, type MappedNote, type ScoreMap } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { childElement, childElements, childNumber, childText } from "../xml";
import { addToBarline, barlineAt } from "./barlines";
import { editableMap, insertInMeasure } from "./edit-context";
import { ScoreEditError } from "./edit-error";
import { endingsOf } from "./endings";
import { rejoinLyrics } from "./lyrics";
import {
  cloneUnlaidOut,
  createElement,
  edit,
  insertElement,
  insertInOrder,
  moveElement,
  removeElement,
} from "./xml-edit";

/** What a measure's `<attributes>` set that later measures go by: removing measures must not lose a change. */
const CARRIED = ["divisions", "key", "time", "clef", "transpose"] as const;

/** Measure numbers written 1, 2, 3… (or from any start, a pickup's 0 included): renumbered after a change. */
function consecutiveFrom(measures: MappedMeasure[]): number | null {
  if (!measures.every((measure) => /^\d+$/.test(measure.number))) return null;
  const first = Number(measures[0]?.number ?? 1);
  return measures.every((measure, index) => Number(measure.number) === first + index) ? first : null;
}

function renumber(part: Element, first: number) {
  for (const [index, measure] of childElements(part, "measure").entries()) {
    const number = String(first + index);
    if (measure.getAttribute("number") !== number) measure.setAttribute("number", number);
  }
}

/** The elements written before a measure's first note (its print, barlines, attributes, directions…). */
function leading(measure: Element): Element[] {
  const elements: Element[] = [];
  for (const child of Array.from(measure.children)) {
    if (child.localName === "note") break;
    elements.push(child);
  }
  return elements;
}

/** The divisions in force at the end of a measure. */
function divisionsAtEnd(measure: MappedMeasure): number {
  const set = childElements(measure.element, "attributes")
    .map((attributes) => childNumber(attributes, "divisions"))
    .filter((divisions): divisions is number => divisions !== null);
  return set.at(-1) ?? measure.divisions;
}

/** A whole-measure rest for a measure of this length, in these divisions, as MuseScore 4 writes one. */
function measureRest(map: ScoreMap, xml: XMLDocument, duration: number): Element {
  const voiced = map.measures.flatMap((measure) => measure.notes).find((note) => childElement(note.element, "voice"));
  return createElement(xml, "note", [
    createElement(xml, "rest", undefined, { measure: "yes" }),
    createElement(xml, "duration", String(duration)),
    ...(voiced ? [createElement(xml, "voice", childText(voiced.element, "voice") ?? "1")] : []),
  ]);
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/**
 * Inserts empty measures before a measure (`beforeIndex` the number of measures to add them at the end), each
 * a whole-measure rest (`<rest measure="yes"/>`) of the time in force there: that of the measure before, or
 * of the first measure when they go first, whose key, time and clef (its opening `<attributes>`) then move to
 * the new first measure. Measures numbered 1, 2, 3… are renumbered; others keep their numbers, and new ones
 * take the number before with a letter (12a, 12b). Returns the new `<measure>`s.
 */
export function insertMeasures(document: ScoreDocument, beforeIndex: number, count: number): Element[] {
  const map = editableMap(document);
  if (!Number.isInteger(count) || count < 1) throw new ScoreEditError("invalid_count", { count: String(count) });
  const total = map.measures.length;
  if (!Number.isInteger(beforeIndex) || beforeIndex < 0 || beforeIndex > total) {
    throw new ScoreEditError("not_in_score", { measure: String(beforeIndex) });
  }
  const source = map.measures[Math.max(0, beforeIndex - 1)];
  const length = source?.expectedLength ?? null;
  if (!source || length === null) throw new ScoreEditError("no_time_signature");
  const divisions = beforeIndex === 0 ? source.divisions : divisionsAtEnd(source);
  const duration = length * 4 * divisions;
  if (Math.abs(duration - Math.round(duration)) > EPSILON) {
    throw new ScoreEditError("length_not_in_divisions", { divisions: String(divisions), length: String(length) });
  }
  const first = consecutiveFrom(map.measures);
  const base = beforeIndex === 0 ? "0" : source.number;
  const following = map.measures[beforeIndex]?.element ?? null;
  return edit(document, (xml) => {
    const added: Element[] = [];
    for (let index = 0; index < count; index += 1) {
      const number =
        first === null
          ? base + LETTERS[index % LETTERS.length]!.repeat(1 + Math.floor(index / LETTERS.length))
          : String(first + beforeIndex + index);
      const measure = createElement(xml, "measure", [measureRest(map, xml, Math.round(duration))], { number });
      added.push(insertElement(map.part, measure, following));
    }
    if (beforeIndex === 0) {
      // The score's opening key, time and clef stay at its start.
      const rest = added[0]!.firstElementChild;
      for (const element of leading(following!)) {
        if (element.localName === "attributes") moveElement(element, added[0]!, rest);
      }
    } else if (beforeIndex === total) {
      // A final barline stays at the end of the score.
      const last = map.measures[total - 1]!.element;
      const barline = barlineAt(last, "right");
      const children = barline ? Array.from(barline.children) : [];
      if (
        barline &&
        children.length === 1 &&
        children[0]!.localName === "bar-style" &&
        (children[0]!.textContent ?? "").trim() === "light-heavy"
      ) {
        moveElement(barline, added.at(-1)!);
      }
    }
    if (first !== null) renumber(map.part, first);
    return added;
  });
}

/** Adds empty measures at the end of the part (`insertMeasures` after the last one). */
export function appendMeasures(document: ScoreDocument, count: number): Element[] {
  return insertMeasures(document, editableMap(document).measures.length, count);
}

/** A comparable form of an element: its XML without layout. */
const meaning = (element: Element | undefined) =>
  element ? new XMLSerializer().serializeToString(element).replace(/>\s+</g, "><") : null;

/** The last of each carried `<attributes>` child in these measures, by name. */
function lastAttributes(measures: MappedMeasure[]): Map<string, Element> {
  const last = new Map<string, Element>();
  for (const measure of measures) {
    for (const attributes of childElements(measure.element, "attributes")) {
      for (const child of Array.from(attributes.children)) {
        if ((CARRIED as readonly string[]).includes(child.localName)) last.set(child.localName, child);
      }
    }
  }
  return last;
}

/** The last direction with a `<sound tempo>` in these measures, or null. */
function lastTempo(measures: MappedMeasure[]): Element | null {
  const tempos = measures.flatMap((measure) =>
    childElements(measure.element, "direction").filter((direction) =>
      childElements(direction, "sound").some((sound) => sound.hasAttribute("tempo")),
    ),
  );
  return tempos.at(-1) ?? null;
}

const tempoValue = (direction: Element | null) =>
  direction ? (childElement(direction, "sound")?.getAttribute("tempo") ?? null) : null;

/** Whether a note has a tie of this type: `<tie>` or `<notations><tied>`. */
function hasTie(note: Element, type: "start" | "stop"): boolean {
  return (
    childElements(note, "tie").some((tie) => tie.getAttribute("type") === type) ||
    childElements(note, "notations").some((notations) =>
      childElements(notations, "tied").some((tied) => tied.getAttribute("type") === type),
    )
  );
}

/** The first and the last notes (a chord's every note) sounding of these, grace notes aside. */
function firstTimed(notes: MappedNote[]): MappedNote[] {
  const timed = notes.filter((note) => !note.grace);
  return timed.filter((note) => note.measure === timed[0]?.measure && note.onset === timed[0]?.onset);
}

function lastTimed(notes: MappedNote[]): MappedNote[] {
  const timed = notes.filter((note) => !note.grace);
  const last = timed.at(-1);
  return timed.filter((note) => note.measure === last?.measure && note.onset === last?.onset);
}

/** Takes the ties from a note's start or end: `<tie>` and `<notations><tied>` of that type. */
function untie(note: Element, type: "start" | "stop") {
  for (const tie of childElements(note, "tie")) if (tie.getAttribute("type") === type) removeElement(tie);
  for (const notations of childElements(note, "notations")) {
    for (const tied of childElements(notations, "tied")) if (tied.getAttribute("type") === type) removeElement(tied);
    if (notations.children.length === 0) removeElement(notations);
  }
}

/**
 * Removes measures. What they changed and later measures still go by moves to the measure after them: a key,
 * time, clef or divisions change (into its opening `<attributes>`) and a tempo (before its first note), unless
 * that measure sets its own. An ending that began or stopped in them now begins or stops at the measures
 * beside them; ties into or out of them and hyphens across them are taken away. Measures numbered 1, 2, 3…
 * are renumbered. A part keeps at least one measure (`last_measure`).
 */
export function removeMeasures(document: ScoreDocument, fromIndex: number, count: number) {
  const map = editableMap(document);
  if (!Number.isInteger(count) || count < 1) throw new ScoreEditError("invalid_count", { count: String(count) });
  const total = map.measures.length;
  const end = fromIndex + count;
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || end > total) {
    throw new ScoreEditError("not_in_score", { measure: String(end > total ? total : fromIndex) });
  }
  if (count === total) throw new ScoreEditError("last_measure");
  const removed = map.measures.slice(fromIndex, end);
  const before = map.measures.slice(0, fromIndex);
  const previous = map.measures[fromIndex - 1] ?? null;
  const next = map.measures[end] ?? null;
  const first = consecutiveFrom(map.measures);
  const endings = endingsOf(map);
  const removedNotes = removed.flatMap((measure) => measure.notes);
  const firstNotes = firstTimed(removedNotes);
  const lastNotes = lastTimed(removedNotes);
  edit(document, (xml) => {
    if (next) {
      const firstNote = next.notes[0]?.element ?? null;
      const opening = leading(next.element);
      // Key, time, clef and divisions changes that still matter.
      const was = lastAttributes(before);
      const own = new Set(
        opening
          .filter((element) => element.localName === "attributes")
          .flatMap((attributes) => Array.from(attributes.children).map((child) => child.localName)),
      );
      const carried = [...lastAttributes(removed)].filter(
        ([name, element]) => !own.has(name) && meaning(element) !== meaning(was.get(name)),
      );
      if (carried.length > 0) {
        const attributes = opening.find((element) => element.localName === "attributes");
        if (attributes)
          for (const [, element] of carried) insertInOrder(attributes, cloneUnlaidOut(element), "attributes");
        else {
          const children = carried.map(([, element]) => cloneUnlaidOut(element));
          // In the schema's order, after the measure's print and left barline.
          children.sort((a, b) => CARRIED.indexOf(a.localName as never) - CARRIED.indexOf(b.localName as never));
          const after = opening.find((element) => !["print", "barline"].includes(element.localName)) ?? firstNote;
          insertElement(next.element, createElement(xml, "attributes", children), after);
        }
      }
      // A tempo that still matters.
      const tempo = lastTempo(removed);
      const ownTempo = opening.some(
        (element) =>
          element.localName === "direction" &&
          childElements(element, "sound").some((sound) => sound.hasAttribute("tempo")),
      );
      if (tempo && !ownTempo && tempoValue(tempo) !== tempoValue(lastTempo(before))) {
        const copy = cloneUnlaidOut(tempo);
        for (const offset of childElements(copy, "offset")) offset.remove();
        insertInMeasure(next.element, copy, firstNote);
      }
      // Endings that began in the measures removed and go on.
      for (const ending of endings) {
        if (ending.from >= fromIndex && ending.from < end && ending.to >= end) {
          addToBarline(next.element, "left", [cloneUnlaidOut(ending.start)]);
        }
      }
      // Ties out of them.
      if (lastNotes.some((note) => hasTie(note.element, "start"))) {
        for (const note of next.notes.filter((candidate) => candidate.onset < EPSILON)) untie(note.element, "stop");
      }
    }
    if (previous) {
      for (const ending of endings) {
        if (ending.from < fromIndex && ending.to >= fromIndex && ending.to < end && ending.stop) {
          addToBarline(previous.element, "right", [cloneUnlaidOut(ending.stop)]);
        }
      }
      // Ties into them.
      if (firstNotes.some((note) => hasTie(note.element, "stop"))) {
        for (const note of lastTimed(previous.notes)) untie(note.element, "start");
      }
    }
    rejoinLyrics(map, new Set(removed.flatMap((measure) => measure.notes.map((note) => note.element))));
    for (const measure of removed) removeElement(measure.element);
    if (first !== null) renumber(map.part, first);
  });
}
