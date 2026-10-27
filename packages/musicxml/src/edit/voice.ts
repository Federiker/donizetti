import type { MappedMeasure } from "../score-map";
import { childElement, childNumber } from "../xml";
import { toDivisions } from "./divisions";
import { ScoreEditError } from "./edit-error";
import { capacityOf } from "./measures";
import { createElement, insertElement, moveElement, removeChildren, setChildText } from "./xml-edit";

/** A moment of the measure's one voice: a note with the notes of its chord, or a rest. Times are in divisions. */
export type VoiceEvent = { start: number; duration: number; notes: Element[] };

/**
 * An element of the measure other than a timed note, and where it belongs: at the measure's start (a left
 * barline), at its end (a right barline), or at a time in it (chord symbols, directions, attributes, grace
 * notes, everything else), in divisions from the start, its `<offset>` included.
 */
export type PlacedElement = { element: Element; place: "start" | "end" | "time"; time: number };

/** A measure as the editor rewrites it: its one voice's notes and rests in time order and its other elements. */
export type Voice = {
  measure: Element;
  index: number;
  divisions: number;
  /** How long the measure is, in divisions (`capacityOf`). */
  capacity: number;
  time: { beats: number; beatType: number } | null;
  events: VoiceEvent[];
  others: PlacedElement[];
};

/** Elements whose time may be moved off their place among the notes with an `<offset>`. */
const OFFSET_ELEMENTS = new Set(["harmony", "direction", "sound"]);

/**
 * Reads a measure of an editable score (one voice, no `<backup>` or `<forward>`) as its voice. Throws
 * `unsupported_rhythm` when its length is not a whole number of divisions or the divisions change inside it.
 */
export function readVoice(mapped: MappedMeasure): Voice {
  const { divisions, index } = mapped;
  const capacity = toDivisions(capacityOf(mapped), divisions);
  if (capacity === null) throw new ScoreEditError("unsupported_rhythm", { measure: String(index) });
  const events: VoiceEvent[] = [];
  const others: PlacedElement[] = [];
  let position = 0;
  for (const child of Array.from(mapped.element.children)) {
    const name = child.localName;
    if (name === "note" && !childElement(child, "grace")) {
      if (childElement(child, "chord") && events.length > 0) {
        events.at(-1)!.notes.push(child);
        continue;
      }
      const duration = childNumber(child, "duration") ?? 0;
      events.push({ start: position, duration, notes: [child] });
      position += duration;
      continue;
    }
    if (name === "backup" || name === "forward") throw new ScoreEditError("not_editable");
    if (name === "attributes" && position > 0 && childElement(child, "divisions")) {
      throw new ScoreEditError("unsupported_rhythm", { measure: String(index) });
    }
    if (name === "barline") {
      const location = child.getAttribute("location") ?? "right";
      others.push({
        element: child,
        place: location === "left" ? "start" : location === "middle" ? "time" : "end",
        time: position,
      });
      continue;
    }
    const offset = OFFSET_ELEMENTS.has(name) ? (childNumber(child, "offset") ?? 0) : 0;
    others.push({ element: child, place: "time", time: position + offset });
  }
  return { measure: mapped.element, index, divisions, capacity, time: mapped.time, events, others };
}

/** Where the voice's notes end, in divisions. */
export function contentEnd(events: VoiceEvent[]): number {
  const last = events.at(-1);
  return last ? last.start + last.duration : 0;
}

function setOffset(element: Element, offset: number) {
  const existing = childElement(element, "offset");
  if (offset === 0) {
    if (existing) removeChildren(element, "offset");
    return;
  }
  const text = String(offset);
  if (element.localName === "sound") {
    if (existing) {
      if (existing.textContent !== text) existing.textContent = text;
    } else insertElement(element, createElement(element.ownerDocument, "offset", text));
  } else setChildText(element, "offset", text, element.localName as "harmony" | "direction");
}

/**
 * Writes the voice's measure with these events in it, in time order, every other element kept at its time: before
 * the note that starts at it, or, when its time now falls inside a note, before that note with an `<offset>`
 * (chord symbols, directions, sounds) or before the next note (anything that takes no offset: grace notes,
 * attributes). Elements already where they belong are not touched; the others are moved with their layout, new
 * notes laid out as their siblings. Notes no longer in the voice must be removed first.
 */
export function arrange(voice: Voice, events: VoiceEvent[]) {
  const slots: Element[][] = events.map(() => []);
  const atEnd: Element[] = [];
  const end = contentEnd(events);
  for (const { element, place, time } of voice.others) {
    if (place === "start") {
      (slots[0] ?? atEnd).push(element);
      continue;
    }
    if (place === "end") {
      atEnd.push(element);
      continue;
    }
    const offsetable = OFFSET_ELEMENTS.has(element.localName);
    const containing = events.findIndex((event) => event.start < time && time < event.start + event.duration);
    let slot = offsetable && containing >= 0 ? containing : events.findIndex((event) => event.start >= time);
    if (slot < 0) slot = events.length;
    (slots[slot] ?? atEnd).push(element);
    if (offsetable) setOffset(element, time - (events[slot]?.start ?? end));
  }
  const order = [...events.flatMap((event, index) => [...slots[index]!, ...event.notes]), ...atEnd];
  const measure = voice.measure;
  let previous: Element | null = null;
  for (const element of order) {
    const expected: Element | null = previous ? previous.nextElementSibling : measure.firstElementChild;
    if (element !== expected) {
      // An element already in the score (in this measure or, re-barring, another) keeps its layout.
      if (element.parentNode) moveElement(element, measure, expected);
      else insertElement(measure, element, expected);
    }
    previous = element;
  }
}
