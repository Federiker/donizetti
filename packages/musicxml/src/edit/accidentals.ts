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
 * Writes the `<accidental>`s of a measure as a reader needs them: on a note whose alteration differs from what
 * the key signature and the earlier notes of its step and octave in the measure give it (a natural when it
 * cancels one), on none that continues a tie. Accidentals no longer needed go, unless they are marked as a
 * courtesy (`cautionary`, `editorial`, `parentheses`, `bracket`) and still right; one already right is left as
 * written. Microtonal alterations keep the accidental they have.
 */
export function writeAccidentals(map: ScoreMap, index: number) {
  const measure = map.measures[index];
  if (!measure) return;
  // The alteration each step and octave is read with so far: the key's, then the last note's of it.
  const state = new Map<string, number>();
  for (const note of measure.notes) {
    const pitch = note.pitch;
    if (!pitch) continue;
    const key = `${pitch.step}${pitch.octave}`;
    const current = state.get(key) ?? keyAlteration(measure.fifths, pitch.step);
    const accidental = childElement(note.element, "accidental");
    if (!Number.isInteger(pitch.alter) || Math.abs(pitch.alter) > 2) {
      state.set(key, pitch.alter);
      continue;
    }
    const shown = accidental ? SHOWN[(accidental.textContent ?? "").trim()] : undefined;
    const { tied, fromEarlierMeasure } = tiedOver(note);
    if (!(tied && fromEarlierMeasure)) state.set(key, pitch.alter);
    if (!tied && pitch.alter !== current) {
      if (shown !== pitch.alter) setAccidental(note.element, WRITTEN[pitch.alter]!);
      continue;
    }
    if (!accidental) continue;
    const courtesy = COURTESY.some((attribute) => accidental.getAttribute(attribute) === "yes");
    if (!(courtesy && shown === pitch.alter)) removeElement(accidental);
  }
}
