import { childElement, childElements, childNumber, childText } from "./xml";

export type Step = "C" | "D" | "E" | "F" | "G" | "A" | "B";

/** A written pitch: its letter, its alteration in semitones (−1 flat, 1 sharp, fractions for microtones), its octave. */
export type Pitch = { step: Step; alter: number; octave: number };

/** A `<note>` of the score, where it falls and what it is. */
export type MappedNote = {
  element: Element;
  /** The index of its measure in the part (not the measure's `number`, which may repeat or be text). */
  measure: number;
  /** Where it starts, in whole notes from the start of its measure. */
  onset: number;
  /** How long it lasts, in whole notes (0 for a grace note). */
  length: number;
  /** Its `<duration>` as written, in the measure's divisions (0 for a grace note). */
  duration: number;
  voice: string;
  staff: number;
  /** A note of a chord after its first (`<chord/>`): it starts with the note before it. */
  chord: boolean;
  grace: boolean;
  rest: boolean;
  /** The written pitch, or null for a rest or an unpitched note. */
  pitch: Pitch | null;
};

/** A `<measure>` of the part, with what applies in it. */
export type MappedMeasure = {
  element: Element;
  index: number;
  /** Its `number` attribute as written (often "1", "2"…, but text such as "X1" is allowed). */
  number: string;
  /** Divisions of a quarter note at its start. */
  divisions: number;
  /** The time signature in force, or null when there is none (or `<senza-misura>`). */
  time: { beats: number; beatType: number } | null;
  /** The key in force, in fifths (−7 to 7), 0 without one. */
  fifths: number;
  /** A pickup or other incomplete measure (`implicit="yes"`). */
  implicit: boolean;
  /** The length its time signature asks for, in whole notes, or null without one. */
  expectedLength: number | null;
  /** How far its notes reach, in whole notes. */
  length: number;
  notes: MappedNote[];
};

/** The measures and notes of one part, as written (repeats not unrolled). */
export type ScoreMap = { part: Element; partId: string; measures: MappedMeasure[] };

/** Tolerance when comparing positions in whole notes (durations are fractions of divisions). */
export const EPSILON = 1e-6;

const STEPS: readonly Step[] = ["C", "D", "E", "F", "G", "A", "B"];
const STEP_SEMITONES: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The MIDI key of a pitch (middle C, C4, is 60), rounded for microtones. */
export function midiOf(pitch: Pitch): number {
  return Math.round(12 * (pitch.octave + 1) + STEP_SEMITONES[pitch.step] + pitch.alter);
}

function pitchOf(note: Element): Pitch | null {
  const pitch = childElement(note, "pitch");
  if (!pitch) return null;
  const step = childText(pitch, "step") as Step;
  if (!STEPS.includes(step)) return null;
  return { step, alter: childNumber(pitch, "alter") ?? 0, octave: childNumber(pitch, "octave") ?? 4 };
}

/** The length a time signature asks for, in whole notes: composite signatures (`3+2`, several pairs) add up. */
function timeLength(time: Element): { beats: number; beatType: number; length: number } | null {
  const beats = childElements(time, "beats");
  const types = childElements(time, "beat-type");
  if (beats.length === 0 || beats.length !== types.length) return null;
  let length = 0;
  for (const [index, beat] of beats.entries()) {
    const count = (beat.textContent ?? "").split("+").reduce((sum, part) => sum + Number(part), 0);
    const type = Number(types[index]!.textContent);
    if (!Number.isFinite(count) || !(type > 0)) return null;
    length += count / type;
  }
  const first = (beats[0]!.textContent ?? "").split("+").reduce((sum, part) => sum + Number(part), 0);
  return { beats: first, beatType: Number(types[0]!.textContent), length };
}

/** The `<part>` elements of the score, in order. */
export function partsOf(root: Element): Element[] {
  return childElements(root, "part");
}

/**
 * The measures and notes of a part (the first by default), with where each note starts and how long it lasts,
 * following `<backup>`, `<forward>`, chords and changes of divisions, key and time.
 */
export function mapScore(root: Element, partIndex = 0): ScoreMap | null {
  const part = partsOf(root)[partIndex];
  if (!part) return null;
  let divisions = 1;
  let time: { beats: number; beatType: number; length: number } | null = null;
  let fifths = 0;
  const measures: MappedMeasure[] = [];
  for (const [index, element] of childElements(part, "measure").entries()) {
    const notes: MappedNote[] = [];
    const measure: MappedMeasure = {
      element,
      index,
      number: element.getAttribute("number") ?? "",
      divisions,
      time: null,
      fifths,
      implicit: element.getAttribute("implicit") === "yes",
      expectedLength: null,
      length: 0,
      notes,
    };
    let position = 0;
    let previousOnset = 0;
    let attributesSeen = false;
    for (const child of Array.from(element.children)) {
      switch (child.localName) {
        case "attributes": {
          divisions = childNumber(child, "divisions") ?? divisions;
          const key = childElement(child, "key");
          if (key) fifths = childNumber(key, "fifths") ?? 0;
          const timeElement = childElement(child, "time");
          if (timeElement) time = childElement(timeElement, "senza-misura") ? null : timeLength(timeElement);
          // What the measure starts with applies to all of it; a change later in it applies from there on.
          if (!attributesSeen && position < EPSILON) {
            measure.divisions = divisions;
            measure.fifths = fifths;
          }
          attributesSeen = true;
          break;
        }
        case "backup":
          position -= (childNumber(child, "duration") ?? 0) / (4 * divisions);
          break;
        case "forward":
          position += (childNumber(child, "duration") ?? 0) / (4 * divisions);
          measure.length = Math.max(measure.length, position);
          break;
        case "note": {
          const grace = childElement(child, "grace") !== null;
          const chord = childElement(child, "chord") !== null;
          const duration = grace ? 0 : (childNumber(child, "duration") ?? 0);
          const length = duration / (4 * divisions);
          const onset = chord ? previousOnset : position;
          notes.push({
            element: child,
            measure: index,
            onset,
            length,
            duration,
            voice: childText(child, "voice") ?? "1",
            staff: childNumber(child, "staff") ?? 1,
            chord,
            grace,
            rest: childElement(child, "rest") !== null,
            pitch: pitchOf(child),
          });
          if (!chord) {
            previousOnset = position;
            position += length;
          }
          measure.length = Math.max(measure.length, onset + length);
          break;
        }
        default:
          break;
      }
    }
    measure.time = time ? { beats: time.beats, beatType: time.beatType } : null;
    measure.expectedLength = time ? time.length : null;
    measures.push(measure);
  }
  return { part, partId: part.getAttribute("id") ?? "", measures };
}

/**
 * What may tell apart notes that start at the same moment: the voice, the staff, whether it is a grace note (a
 * grace note starts where the note it leads to does) and the pitch drawn nearest.
 */
export type NoteQuery = { voice?: string; staff?: number; grace?: boolean; midi?: number };

/**
 * The note that starts at a moment of a measure (whole notes from its start): the click-to-XML mapping, from
 * where OpenSheetMusicDisplay draws a note to the `<note>` it came from. Among the notes starting there, timed
 * notes come before grace notes unless a grace note is asked for, and the voice, staff and pitch asked for
 * decide; the nearest pitch wins in a chord.
 */
export function noteAt(map: ScoreMap, measure: number, onset: number, query: NoteQuery = {}): MappedNote | null {
  const candidates = (map.measures[measure]?.notes ?? []).filter(
    (note) =>
      Math.abs(note.onset - onset) < EPSILON &&
      (query.voice === undefined || note.voice === query.voice) &&
      (query.staff === undefined || note.staff === query.staff),
  );
  const preferred = candidates.filter((note) => note.grace === (query.grace ?? false));
  const pool = preferred.length > 0 ? preferred : candidates;
  if (query.midi === undefined || pool.length <= 1) return pool[0] ?? null;
  const distance = (note: MappedNote) => (note.pitch ? Math.abs(midiOf(note.pitch) - query.midi!) : 1000);
  return pool.reduce((best, note) => (distance(note) < distance(best) ? note : best));
}
