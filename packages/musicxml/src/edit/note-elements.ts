import type { Pitch } from "../score-map";
import { childElement, childElements, childText } from "../xml";
import { type NoteLength, typeLength } from "./lengths";
import { createElement, insertInOrder, removeChildren, removeElement, setChildText } from "./xml-edit";

/**
 * What a new note copies from the notes already in the part, so that it is written as they are: the `<voice>`
 * (MuseScore writes one on every note, others none), `<staff>`, `<instrument>`, and whether notes carry a `<stem>`.
 */
export type NoteTemplate = { voice: string | null; staff: string | null; instrument: string | null; stems: boolean };

/** The template of a part's new notes, from its first timed note (voice 1 in a part without notes). */
export function templateOf(part: Element): NoteTemplate {
  const notes = Array.from(part.getElementsByTagName("note"));
  const first = notes.find((note) => !childElement(note, "grace")) ?? notes[0];
  if (!first) return { voice: "1", staff: null, instrument: null, stems: false };
  return {
    voice: childText(first, "voice"),
    staff: childText(first, "staff"),
    instrument: childElement(first, "instrument")?.getAttribute("id") ?? null,
    stems: notes.some((note) => childElement(note, "stem") !== null),
  };
}

/** The template a note itself gives: a piece split from it is written as it is. */
export function templateOfNote(note: Element): NoteTemplate {
  return {
    voice: childText(note, "voice"),
    staff: childText(note, "staff"),
    instrument: childElement(note, "instrument")?.getAttribute("id") ?? null,
    stems: childElement(note, "stem") !== null,
  };
}

const STEPS = ["C", "D", "E", "F", "G", "A", "B"];

/** A note's written pitch, or null for a rest or an unpitched note. */
export function notePitch(note: Element): Pitch | null {
  const pitch = childElement(note, "pitch");
  if (!pitch) return null;
  const step = childText(pitch, "step") ?? "";
  if (!STEPS.includes(step)) return null;
  const alter = Number(childText(pitch, "alter") ?? 0);
  const octave = Number(childText(pitch, "octave") ?? 4);
  return { step: step as Pitch["step"], alter: Number.isFinite(alter) ? alter : 0, octave };
}

/** A new `<pitch>`, without `<alter>` for a natural, as MusicXML writes it. */
export function pitchElement(xml: XMLDocument, pitch: Pitch): Element {
  return createElement(xml, "pitch", [
    createElement(xml, "step", pitch.step),
    ...(pitch.alter !== 0 ? [createElement(xml, "alter", String(pitch.alter))] : []),
    createElement(xml, "octave", String(pitch.octave)),
  ]);
}

/** What a new note is: its pitch (null for a rest), its duration in divisions and its written length. */
export type NewNote = {
  pitch: Pitch | null;
  /** A note of a chord after its first (`<chord/>`). */
  chord?: boolean;
  duration: number;
  /** Null for a measure rest (`<rest measure="yes"/>`, without a type). */
  length: NoteLength | null;
};

/** A new `<note>`, its children in the schema's order; its stem (when the part writes stems) is set later. */
export function createNote(xml: XMLDocument, template: NoteTemplate, note: NewNote): Element {
  const children: Element[] = [];
  if (note.chord) children.push(createElement(xml, "chord"));
  if (note.pitch) children.push(pitchElement(xml, note.pitch));
  else children.push(createElement(xml, "rest", undefined, note.length === null ? { measure: "yes" } : {}));
  children.push(createElement(xml, "duration", String(note.duration)));
  if (template.instrument !== null)
    children.push(createElement(xml, "instrument", undefined, { id: template.instrument }));
  if (template.voice !== null) children.push(createElement(xml, "voice", template.voice));
  if (note.length) {
    children.push(createElement(xml, "type", note.length.type));
    for (let dot = 0; dot < (note.length.dots ?? 0); dot += 1) children.push(createElement(xml, "dot"));
  }
  if (note.pitch && template.stems && hasStem(note.length)) children.push(createElement(xml, "stem", "up"));
  if (template.staff !== null) children.push(createElement(xml, "staff", template.staff));
  return createElement(xml, "note", children);
}

/** Whether a note of this length is drawn with a stem: anything shorter than a whole note. */
const hasStem = (length: NoteLength | null) => length !== null && typeLength(length.type) < 1;

/**
 * Gives an existing note a new length: its `<duration>`, `<type>` and `<dot>`s, always agreeing. A measure rest
 * given a type is a measure rest no more. A note becoming a whole note or longer loses its `<stem>`; one becoming
 * shorter gets one when the part writes stems (`stems`), set later as a reader would.
 */
export function setWrittenLength(note: Element, duration: number, length: NoteLength | null, stems = false) {
  setChildText(note, "duration", String(duration), "note");
  const rest = childElement(note, "rest");
  if (length !== null && rest?.getAttribute("measure") === "yes") rest.removeAttribute("measure");
  if (length === null) {
    removeChildren(note, "type");
    removeChildren(note, "dot");
    return;
  }
  setChildText(note, "type", length.type, "note");
  const dots = childElements(note, "dot");
  const wanted = length.dots ?? 0;
  for (const dot of dots.slice(wanted)) removeElement(dot);
  for (let dot = dots.length; dot < wanted; dot += 1) {
    insertInOrder(note, createElement(note.ownerDocument, "dot"), "note");
  }
  if (rest) return;
  const stem = childElement(note, "stem");
  if (!hasStem(length)) {
    if (stem) removeElement(stem);
  } else if (!stem && stems) insertInOrder(note, createElement(note.ownerDocument, "stem", "up"), "note");
}

/** Writes a pitch into a note, a rest becoming a note: `<step>`, `<alter>` (none for a natural) and `<octave>`. */
export function writePitch(note: Element, pitch: Pitch) {
  const existing = childElement(note, "pitch");
  if (!existing) {
    const rest = childElement(note, "rest");
    if (rest) removeElement(rest);
    insertInOrder(note, pitchElement(note.ownerDocument, pitch), "note");
    return;
  }
  setChildText(existing, "step", pitch.step, "pitch");
  if (pitch.alter !== 0) setChildText(existing, "alter", String(pitch.alter), "pitch");
  else removeChildren(existing, "alter");
  setChildText(existing, "octave", String(pitch.octave), "pitch");
}
