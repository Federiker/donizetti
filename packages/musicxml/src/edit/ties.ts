import { midiOf } from "../score-map";
import { childElement, childElements } from "../xml";
import { notePitch } from "./note-elements";
import { createElement, insertElement, insertInOrder, removeElement } from "./xml-edit";

/** A tie's end on a note: `start` ties it to the next note, `stop` to the one before. */
export type TieType = "start" | "stop";

const isTimedNote = (element: Element) => element.localName === "note" && childElement(element, "grace") === null;
const inChord = (note: Element) => childElement(note, "chord") !== null;

/** The element after this one in the part: its next sibling, or the first child of the next measure. */
function following(element: Element): Element | null {
  if (element.nextElementSibling) return element.nextElementSibling;
  let measure = element.parentElement?.nextElementSibling ?? null;
  while (measure && measure.localName === "measure") {
    if (measure.firstElementChild) return measure.firstElementChild;
    measure = measure.nextElementSibling;
  }
  return null;
}

/** The element before this one in the part: its previous sibling, or the last child of the measure before. */
function preceding(element: Element): Element | null {
  if (element.previousElementSibling) return element.previousElementSibling;
  let measure = element.parentElement?.previousElementSibling ?? null;
  while (measure && measure.localName === "measure") {
    if (measure.lastElementChild) return measure.lastElementChild;
    measure = measure.previousElementSibling;
  }
  return null;
}

/** The notes that sound together with this one, in order: the chord's first note and those after it with `<chord/>`. */
export function chordOf(note: Element): Element[] {
  let first = note;
  while (inChord(first)) {
    let previous = first.previousElementSibling;
    while (previous && !isTimedNote(previous)) previous = previous.previousElementSibling;
    if (!previous) break;
    first = previous;
  }
  const notes = [first];
  for (let element = first.nextElementSibling; element; element = element.nextElementSibling) {
    if (element.localName !== "note") continue;
    if (!isTimedNote(element) || !inChord(element)) break;
    notes.push(element);
  }
  return notes;
}

/** The notes sounding after this note's chord, in this measure or the next ones, or null at the end of the part. */
export function nextChord(note: Element): Element[] | null {
  const chord = chordOf(note);
  for (let element = following(chord.at(-1)!); element; element = following(element)) {
    if (isTimedNote(element)) return chordOf(element);
  }
  return null;
}

/** The notes sounding before this note's chord, or null at the start of the part. */
export function previousChord(note: Element): Element[] | null {
  for (let element = preceding(chordOf(note)[0]!); element; element = preceding(element)) {
    if (isTimedNote(element)) return chordOf(element);
  }
  return null;
}

const tieElements = (note: Element, type: TieType) => [
  ...childElements(note, "tie").filter((tie) => tie.getAttribute("type") === type),
  ...childElements(childElement(note, "notations") ?? note, "tied").filter(
    (tied) => tied.getAttribute("type") === type,
  ),
];

/** Whether a note has this end of a tie, as `<tie>` (for playback) or `<notations><tied>` (for drawing). */
export function hasTie(note: Element, type: TieType): boolean {
  return tieElements(note, type).length > 0;
}

/**
 * Gives a note this end of a tie, written twice as MusicXML asks: `<tie>` after the `<duration>` and `<tied>` in
 * its `<notations>` (made when missing), a stop before a start in both.
 */
export function addTie(note: Element, type: TieType) {
  const xml = note.ownerDocument;
  const ties = childElements(note, "tie");
  if (!ties.some((tie) => tie.getAttribute("type") === type)) {
    const start = ties.find((tie) => tie.getAttribute("type") === "start");
    const tie = createElement(xml, "tie", undefined, { type });
    if (type === "stop" && start) insertElement(note, tie, start);
    else insertInOrder(note, tie, "note");
  }
  const notations = childElement(note, "notations");
  const tied = createElement(xml, "tied", undefined, { type });
  if (!notations) {
    insertInOrder(note, createElement(xml, "notations", [tied]), "note");
    return;
  }
  const existing = childElements(notations, "tied");
  if (existing.some((element) => element.getAttribute("type") === type)) return;
  // MuseScore writes the ties first among the notations, after a footnote or level.
  const before = Array.from(notations.children).find(
    (child) =>
      child.localName !== "footnote" &&
      child.localName !== "level" &&
      !(type === "start" && child.localName === "tied" && child.getAttribute("type") === "stop"),
  );
  insertElement(notations, tied, before ?? null);
}

/** Removes this end of a tie from a note, `<tie>` and `<tied>`, and its `<notations>` when nothing else is left in them. */
export function removeTie(note: Element, type: TieType) {
  for (const element of tieElements(note, type)) removeElement(element);
  const notations = childElement(note, "notations");
  if (notations && notations.children.length === 0) removeElement(notations);
}

const midiOfNote = (note: Element) => {
  const pitch = notePitch(note);
  return pitch ? midiOf(pitch) : null;
};

/** The note this note's tie leads to (`start`) or comes from (`stop`): the next or previous chord's note of its pitch. */
export function tiePartner(note: Element, type: TieType): Element | null {
  const midi = midiOfNote(note);
  if (midi === null) return null;
  const chord = type === "start" ? nextChord(note) : previousChord(note);
  return chord?.find((other) => midiOfNote(other) === midi) ?? null;
}

/** Ties a note to the next one: a start on the first, a stop on the second. */
export function tieNotes(from: Element, to: Element) {
  addTie(from, "start");
  addTie(to, "stop");
}

/**
 * Removes a note's ties of these types and their other ends, so no tie is left leading nowhere; returns the
 * notes at the other ends, whose accidentals may now be needed.
 */
export function untie(note: Element, types: TieType[] = ["start", "stop"]): Element[] {
  const partners: Element[] = [];
  for (const type of types) {
    if (!hasTie(note, type)) continue;
    const partner = tiePartner(note, type);
    const other: TieType = type === "start" ? "stop" : "start";
    removeTie(note, type);
    if (partner && hasTie(partner, other)) {
      removeTie(partner, other);
      partners.push(partner);
    }
  }
  return partners;
}
