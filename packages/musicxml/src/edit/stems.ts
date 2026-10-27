import type { Pitch } from "../score-map";
import { childElement, childElements, childNumber, childText } from "../xml";
import { notePitch } from "./note-elements";
import { chordOf } from "./ties";

const STEP_INDEX: Record<Pitch["step"], number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

/** A pitch's place on the staff, in diatonic steps from C0 (C4 is 28, B4 34): its letter and octave only. */
export function staffStep(pitch: Pitch): number {
  return pitch.octave * 7 + STEP_INDEX[pitch.step];
}

/** Where each clef sign's line is, in diatonic steps (G4, F3, C4), and the line it sits on by default. */
const CLEFS: Record<string, { step: number; line: number }> = {
  G: { step: 32, line: 2 },
  F: { step: 24, line: 4 },
  C: { step: 28, line: 3 },
};

/**
 * The diatonic step of the staff's middle line under the clef in force at a note (B4 for the treble clef, D3 for
 * the bass), or null for a clef without pitches (percussion, TAB, none). No clef is a treble clef.
 */
export function middleLine(note: Element): number | null {
  const part = note.parentElement?.parentElement;
  if (!part) return null;
  let clef: Element | null = null;
  for (const candidate of Array.from(part.getElementsByTagName("clef"))) {
    if (candidate.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING) clef = candidate;
    else break;
  }
  if (!clef) return CLEFS.G!.step + 2;
  const sign = CLEFS[childText(clef, "sign") ?? ""];
  if (!sign) return null;
  const line = childNumber(clef, "line") ?? sign.line;
  return sign.step + 7 * (childNumber(clef, "clef-octave-change") ?? 0) + (3 - line) * 2;
}

/** The level-1 beam a note carries (`begin`, `continue`, `end`), or null. */
const primaryBeam = (note: Element) =>
  childElements(note, "beam")
    .find((beam) => (beam.getAttribute("number") ?? "1") === "1")
    ?.textContent?.trim() ?? null;

/** The chords beamed together with this note's chord (only its chord when it is not beamed), in order. */
function beamedWith(note: Element): Element[][] {
  const chord = chordOf(note);
  const beam = primaryBeam(chord[0]!);
  if (beam !== "begin" && beam !== "continue" && beam !== "end") return [chord];
  const chords = [chord];
  const sibling = (from: Element, forward: boolean) => {
    for (let element = forward ? from.nextElementSibling : from.previousElementSibling; element; ) {
      if (element.localName === "note" && !childElement(element, "grace") && !childElement(element, "chord")) {
        return element;
      }
      element = forward ? element.nextElementSibling : element.previousElementSibling;
    }
    return null;
  };
  for (let first = chord[0]!; primaryBeam(first) !== "begin"; ) {
    const previous = sibling(first, false);
    if (!previous || primaryBeam(previous) === null || primaryBeam(previous) === "end") break;
    chords.unshift(chordOf(previous));
    first = previous;
  }
  for (let last = chord[0]!; primaryBeam(last) !== "end"; ) {
    const next = sibling(last, true);
    if (!next || primaryBeam(next) === null || primaryBeam(next) === "begin") break;
    chords.push(chordOf(next));
    last = next;
  }
  return chords;
}

/**
 * Sets the stems of these notes, of their chords and of the chords beamed with them as a reader draws them by
 * default: up below the middle line of the clef in force, down from it; a chord or a beamed group by its note
 * farthest from the middle line (down when as far above as below). Only `<stem>`s already written `up` or
 * `down` change: a note without one is left for the reader to decide, `none` and `double` stay.
 */
export function updateStems(notes: Iterable<Element>) {
  const done = new Set<Element>();
  for (const note of notes) {
    if (!note.parentElement || done.has(note)) continue;
    const group = beamedWith(note).flat();
    for (const member of group) done.add(member);
    const middle = middleLine(note);
    if (middle === null) continue;
    let above = -1;
    let below = -1;
    for (const member of group) {
      const pitch = notePitch(member);
      if (!pitch) continue;
      const distance = staffStep(pitch) - middle;
      if (distance >= 0) above = Math.max(above, distance);
      else below = Math.max(below, -distance);
    }
    if (above < 0 && below < 0) continue;
    const direction = above >= below ? "down" : "up";
    for (const member of group) {
      const stem = childElement(member, "stem");
      const written = stem?.textContent?.trim();
      if (stem && (written === "up" || written === "down") && written !== direction) stem.textContent = direction;
    }
  }
}
