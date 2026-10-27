import { EPSILON, type MappedMeasure, type MappedNote, type ScoreMap, type Step } from "../score-map";
import { childElement } from "../xml";
import { hasTie, tiePartner } from "./ties";
import { createElement, insertInOrder, removeElement } from "./xml-edit";

const SHARPS: readonly Step[] = ["F", "C", "G", "D", "A", "E", "B"];

/** The alteration a key signature gives a step: 1 for F in G major, −1 for B in F major, 0 when it gives none. */
export function keyAlteration(fifths: number, step: Step): number {
  if (fifths > 0) return SHARPS.indexOf(step) < fifths ? 1 : 0;
  if (fifths < 0) return SHARPS.length - SHARPS.indexOf(step) <= -fifths ? -1 : 0;
  return 0;
}

/** The alteration each `<accidental>` value shows, for those that show a whole number of semitones. */
const SHOWN: Record<string, number> = {
  sharp: 1,
  natural: 0,
  flat: -1,
  "double-sharp": 2,
  "sharp-sharp": 2,
  "flat-flat": -2,
  "natural-sharp": 1,
  "natural-flat": -1,
};

/** The `<accidental>` the editor writes for an alteration. */
const WRITTEN: Record<number, string> = {
  2: "double-sharp",
  1: "sharp",
  0: "natural",
  [-1]: "flat",
  [-2]: "flat-flat",
};

/** Attributes marking an accidental as a courtesy the reader does not strictly need: kept while it is right. */
const COURTESY = ["cautionary", "editorial", "parentheses", "bracket"];

/**
 * Whether a note continues a tied note of the same pitch: it shows no accidental, and when the tie comes from
 * the measure before it does not change the alteration later notes are read with.
 */
function tiedOver(note: MappedNote): { tied: boolean; fromEarlierMeasure: boolean } {
  if (!hasTie(note.element, "stop")) return { tied: false, fromEarlierMeasure: false };
  const partner = tiePartner(note.element, "stop");
  if (!partner) return { tied: false, fromEarlierMeasure: false };
  return { tied: true, fromEarlierMeasure: partner.parentElement !== note.element.parentElement };
}

/**
 * The alteration a note of this step and octave is read with at a time of a measure, from the key signature and
 * the notes before that time: what A–G enter (F in G major is F sharp, unless a natural came before it).
 */
export function alterationAt(measure: MappedMeasure, onset: number, step: Step, octave: number): number {
  const state = new Map<string, number>();
  for (const note of measure.notes) {
    if (!note.pitch || note.onset >= onset - EPSILON) continue;
    const { tied, fromEarlierMeasure } = tiedOver(note);
    if (!(tied && fromEarlierMeasure)) state.set(`${note.pitch.step}${note.pitch.octave}`, note.pitch.alter);
  }
  return state.get(`${step}${octave}`) ?? keyAlteration(measure.fifths, step);
}

function setAccidental(note: Element, value: string) {
  const accidental = childElement(note, "accidental");
  if (accidental) {
    if (accidental.textContent !== value) accidental.textContent = value;
  } else insertInOrder(note, createElement(note.ownerDocument, "accidental", value), "note");
}

/**
 * What a note is and needs, for an edit to tell which accidentals it changed: its pitch, and the alteration a
 * reader needs shown on it (null when none is needed; a microtone keeps what it has).
 */
export type AccidentalNeed = { pitch: string; needed: number | null };

/**
 * What each pitched note of a measure needs: an alteration shown when it differs from what the key signature
 * and the earlier notes of its step and octave in the measure give it (a natural when it cancels one), none on a
 * note that continues a tie. A tie from the measure before does not count for the later notes, so they show
 * theirs.
 */
function needsOf(measure: MappedMeasure): { note: MappedNote; need: AccidentalNeed; microtone: boolean }[] {
  // The alteration each step and octave is read with so far: the key's, then the last note's of it.
  const state = new Map<string, number>();
  const needs: { note: MappedNote; need: AccidentalNeed; microtone: boolean }[] = [];
  for (const note of measure.notes) {
    const pitch = note.pitch;
    if (!pitch) continue;
    const key = `${pitch.step}${pitch.octave}`;
    const current = state.get(key) ?? keyAlteration(measure.fifths, pitch.step);
    const written = `${key}${pitch.alter}`;
    if (!Number.isInteger(pitch.alter) || Math.abs(pitch.alter) > 2) {
      state.set(key, pitch.alter);
      needs.push({ note, need: { pitch: written, needed: null }, microtone: true });
      continue;
    }
    const { tied, fromEarlierMeasure } = tiedOver(note);
    if (!(tied && fromEarlierMeasure)) state.set(key, pitch.alter);
    const needed = !tied && pitch.alter !== current ? pitch.alter : null;
    needs.push({ note, need: { pitch: written, needed }, microtone: false });
  }
  return needs;
}

/** What every pitched note of the part needs (`needsOf`), read before an edit. */
export function accidentalNeeds(map: ScoreMap): Map<Element, AccidentalNeed> {
  const needs = new Map<Element, AccidentalNeed>();
  for (const measure of map.measures) {
    for (const { note, need } of needsOf(measure)) needs.set(note.element, need);
  }
  return needs;
}

/**
 * Writes the `<accidental>`s of a measure as a reader needs them (`needsOf`). A note that needs one gets it
 * (an `<accidental>` already showing it is left as written); an accidental no longer needed goes, unless it is
 * marked as a courtesy (`cautionary`, `editorial`, `parentheses`, `bracket`) and still right. Microtonal
 * alterations keep the accidental they have.
 *
 * Given what the notes needed before an edit (`accidentalNeeds`), only the notes the edit changed are written
 * (owner decision, 27 October 2026): a note new or changed in pitch, and a note whose need changed with it (a
 * later note of the same step and octave in the measure, the notes of a measure in a new key or new bars, the
 * end of a tie undone). Every other note keeps its accidental as written, another program's unmarked courtesy
 * accidentals included.
 */
export function writeAccidentals(map: ScoreMap, index: number, before?: Map<Element, AccidentalNeed>) {
  const measure = map.measures[index];
  if (!measure) return;
  for (const { note, need, microtone } of needsOf(measure)) {
    if (microtone) continue;
    const was = before?.get(note.element);
    if (before && was && was.pitch === need.pitch && was.needed === need.needed) continue;
    const pitch = note.pitch!;
    const accidental = childElement(note.element, "accidental");
    const shown = accidental ? SHOWN[(accidental.textContent ?? "").trim()] : undefined;
    if (need.needed !== null) {
      if (shown !== need.needed) setAccidental(note.element, WRITTEN[need.needed]!);
      continue;
    }
    if (!accidental) continue;
    const courtesy = COURTESY.some((attribute) => accidental.getAttribute(attribute) === "yes");
    if (!(courtesy && shown === pitch.alter)) removeElement(accidental);
  }
}
