import { mapScore, type ScoreMap } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { childElement, childElements, childNumber } from "../xml";
import { ScoreEditError } from "./edit-error";
import { addAttributesAtStart, attributesAtStart } from "./measures";
import { finish, noChanges, operate } from "./operation";
import { rebar } from "./rebar";
import { createElement, insertInOrder, removeChildren, removeElement, setChildText } from "./xml-edit";

/** The last element with this name before a measure, in the part (a key or time signature in force). */
function lastBefore(map: ScoreMap, index: number, name: string): Element | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    const found = Array.from(map.measures[at]!.element.getElementsByTagName(name)).at(-1);
    if (found) return found;
  }
  return null;
}

/** Removes `<attributes>` left with nothing in them. */
function removeIfEmpty(attributes: Element | null) {
  if (attributes && attributes.children.length === 0) removeElement(attributes);
}

/** Puts an element into a measure's starting `<attributes>`, made where MuseScore writes them when missing. */
function addToStart(measure: Element, element: Element) {
  const attributes = attributesAtStart(measure);
  if (attributes) insertInOrder(attributes, element, "attributes");
  else addAttributesAtStart(measure, [element]);
}

/**
 * Sets the key signature from a measure on (−7 to 7 fifths, sharps positive), in the `<attributes>` it starts with
 * (made when missing); a key that would repeat the one in force is removed instead. Pitches stay as they are:
 * the accidentals are written again in every measure up to the next key change. Returns the `<key>`, or null
 * when the measure is left with none.
 */
export function setKey(document: ScoreDocument, measure: number, fifths: number): Element | null {
  if (!Number.isInteger(fifths) || Math.abs(fifths) > 7) {
    throw new ScoreEditError("invalid_key", { fifths: String(fifths) });
  }
  return operate(document, [], (root) => {
    const map = mapScore(root)!;
    const mapped = map.measures[measure];
    if (!mapped) throw new ScoreEditError("not_in_score", { measure: String(measure) });
    const attributes = attributesAtStart(mapped.element);
    const existing = attributes ? childElement(attributes, "key") : null;
    const before = lastBefore(map, measure, "key");
    const inForce = before ? (childNumber(before, "fifths") ?? 0) : 0;
    let key: Element | null = null;
    if (measure > 0 && fifths === inForce) {
      if (existing) removeElement(existing);
      removeIfEmpty(attributes);
    } else if (existing) {
      // A non-traditional key (`<key-step>`, `<key-alter>`) becomes a traditional one.
      for (const name of ["key-step", "key-alter", "key-accidental"]) removeChildren(existing, name);
      setChildText(existing, "fifths", String(fifths), "key");
      key = existing;
    } else {
      const xml = root.ownerDocument;
      key = createElement(xml, "key", [createElement(xml, "fifths", String(fifths))]);
      addToStart(mapped.element, key);
    }
    const changes = noChanges();
    for (let at = measure; at < map.measures.length; at += 1) {
      if (at > measure && map.measures[at]!.element.getElementsByTagName("key").length > 0) break;
      changes.pitches.add(at);
    }
    finish(root, changes);
    return key;
  });
}

const isPowerOfTwo = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= 1024 && (value & (value - 1)) === 0;

/** Writes a time signature's beats and beat type into a `<time>`, dropping a symbol that no longer fits it. */
function writeTime(time: Element, beats: number, beatType: number) {
  if (
    childElements(time, "beats").length !== 1 ||
    childElements(time, "beat-type").length !== 1 ||
    childElement(time, "senza-misura")
  ) {
    for (const name of ["beats", "beat-type", "interchangeable", "senza-misura"]) removeChildren(time, name);
  }
  setChildText(time, "beats", String(beats), "time");
  setChildText(time, "beat-type", String(beatType), "time");
  const symbol = time.getAttribute("symbol");
  const fits =
    (symbol === "common" && beats === 4 && beatType === 4) || (symbol === "cut" && beats === 2 && beatType === 2);
  if ((symbol === "common" || symbol === "cut") && !fits) time.removeAttribute("symbol");
}

/** Whether a measure changes the time signature. */
const changesTime = (measure: Element) => measure.getElementsByTagName("time").length > 0;

/**
 * Sets the time signature from a measure on, in the `<attributes>` it starts with (made when missing; a time that
 * repeats the one in force is removed instead), and puts the music up to the next time change into bars of the
 * new length (`rebar`): notes crossing a new barline split and tied, chord symbols, directions and lyrics at
 * their times, the last bar filled with rests, beams and accidentals written again. A pickup at the measure keeps
 * its length. Measure numbers are renumbered when bars are added or removed only if they are plain consecutive
 * integers (else `measure_numbers`); `cannot_rebar` when a pickup, a key change or a barline (a repeat, an
 * ending) would fall inside a new bar. Returns the measures now in the new time, from `from` to `to` (exclusive).
 */
export function setTime(
  document: ScoreDocument,
  measure: number,
  beats: number,
  beatType: number,
): { from: number; to: number } {
  if (!Number.isInteger(beats) || beats < 1 || beats > 99 || !isPowerOfTwo(beatType)) {
    throw new ScoreEditError("invalid_time", { beats: String(beats), beatType: String(beatType) });
  }
  return operate(document, [], (root) => {
    const map = mapScore(root)!;
    const mapped = map.measures[measure];
    if (!mapped) throw new ScoreEditError("not_in_score", { measure: String(measure) });
    const attributes = attributesAtStart(mapped.element);
    const existing = attributes ? childElement(attributes, "time") : null;
    const previous = measure > 0 ? map.measures[measure - 1]!.time : null;
    const repeats = previous?.beats === beats && previous.beatType === beatType;
    if (repeats && existing) {
      removeElement(existing);
      removeIfEmpty(attributes);
    } else if (existing) writeTime(existing, beats, beatType);
    else if (!repeats) {
      const xml = root.ownerDocument;
      const time = createElement(xml, "time", [
        createElement(xml, "beats", String(beats)),
        createElement(xml, "beat-type", String(beatType)),
      ]);
      addToStart(mapped.element, time);
    }
    let end = measure + 1;
    while (end < map.measures.length && !changesTime(map.measures[end]!.element)) end += 1;
    const start = mapped.implicit ? measure + 1 : measure;
    const changes = noChanges();
    const count = start < end ? rebar(root, start, end, beats / beatType, changes) : 0;
    finish(root, changes);
    return { from: measure, to: Math.max(start + count, measure + 1) };
  });
}
