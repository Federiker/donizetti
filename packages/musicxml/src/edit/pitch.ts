import { EPSILON, mapScore, midiOf, type Pitch, type Step } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { childNumber } from "../xml";
import { alterationAt, keyAlteration } from "./accidentals";
import { ScoreEditError } from "./edit-error";
import { noteLengthOf, writtenLength } from "./lengths";
import type { ScorePosition } from "./edit-context";
import { capacityOf } from "./measures";
import { notePitch, setWrittenLength, templateOf, writePitch } from "./note-elements";
import { checkPitch } from "./overwrite";
import { finish, measureIndexOf, noChanges, operate, pitchesChanged } from "./operation";
import { middleLine, staffStep } from "./stems";
import { chordOf, hasTie, tiePartner, untie } from "./ties";

const STEPS: readonly Step[] = ["C", "D", "E", "F", "G", "A", "B"];
const SEMITONES: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The pitch at a diatonic step (`staffStep`) with an alteration. */
const pitchAtStep = (step: number, alter: number): Pitch => ({
  step: STEPS[((step % 7) + 7) % 7]!,
  alter,
  octave: Math.floor(step / 7),
});

/**
 * How a MIDI key is spelt after Up or Down, as MuseScore does: the spelling the key signature gives (F sharp in
 * G major, B flat in F major), else a natural, else a sharp going up and a flat going down.
 */
export function spell(midi: number, fifths: number, direction: number): Pitch {
  const pitchClass = ((midi % 12) + 12) % 12;
  const spellings = STEPS.map((step) => {
    const alter = ((pitchClass - SEMITONES[step] + 18) % 12) - 6;
    return { step, alter };
  }).filter(({ alter }) => Math.abs(alter) <= 1);
  const chosen =
    spellings.find(({ step, alter }) => alter === keyAlteration(fifths, step)) ??
    spellings.find(({ alter }) => alter === 0) ??
    spellings.find(({ alter }) => alter === (direction > 0 ? 1 : -1))!;
  return { ...chosen, octave: (midi - SEMITONES[chosen.step] - chosen.alter) / 12 - 1 };
}

/** The pitch a semitone transposition gives: whole octaves keep the spelling; others are spelt by `spell`. */
export function transposedPitch(pitch: Pitch, semitones: number, fifths: number): Pitch {
  if (semitones % 12 === 0) return { ...pitch, octave: pitch.octave + semitones / 12 };
  return spell(midiOf(pitch) + semitones, fifths, semitones);
}

/** The notes tied together with this one, in order: the whole tied note. */
function tiedChain(note: Element): Element[] {
  const chain = [note];
  for (let at = note; hasTie(at, "stop"); ) {
    const previous = tiePartner(at, "stop");
    if (!previous || chain.includes(previous) || !hasTie(previous, "start")) break;
    chain.unshift(previous);
    at = previous;
  }
  for (let at = note; hasTie(at, "start"); ) {
    const next = tiePartner(at, "start");
    if (!next || chain.includes(next) || !hasTie(next, "stop")) break;
    chain.push(next);
    at = next;
  }
  return chain;
}

/** Throws `duplicate_pitch` when another note of the chord already sounds this pitch. */
function checkChord(note: Element, pitch: Pitch) {
  const midi = midiOf(pitch);
  for (const other of chordOf(note)) {
    const otherPitch = other === note ? null : notePitch(other);
    if (otherPitch && midiOf(otherPitch) === midi) throw new ScoreEditError("duplicate_pitch");
  }
}

/**
 * Sets a note's pitch (A–G on a selected note); a rest becomes a note of its length. A tie to or from it is undone
 * at both ends when the pitch changes. Accidentals are written again through the measure, the stem set as a
 * reader would (when the note has one). Returns the note.
 */
export function setPitch(document: ScoreDocument, note: Element, pitch: Pitch): Element {
  checkPitch(pitch);
  return operate(document, [note], (root, [target]) => {
    const element = target!;
    const changes = noChanges();
    const map = mapScore(root)!;
    const measure = measureIndexOf(map, element);
    const old = notePitch(element);
    checkChord(element, pitch);
    if (!old || midiOf(old) !== midiOf(pitch)) pitchesChanged(changes, root, untie(element));
    writePitch(element, pitch);
    if (!old) {
      // A rest becoming a note: a measure rest needs a type, and the note a stem where the part writes them.
      const mapped = map.measures[measure]!.notes.find((other) => other.element === element)!;
      const length = writtenLength(element) ?? noteLengthOf(mapped.length);
      if (!length) throw new ScoreEditError("unsupported_rhythm", { measure: String(measure) });
      setWrittenLength(element, childNumber(element, "duration") ?? 0, length, templateOf(map.part).stems);
      changes.rhythm.add(measure);
    }
    changes.notes.add(element);
    changes.pitches.add(measure);
    finish(root, changes);
    return element;
  });
}

/**
 * Moves a note by semitones (Up and Down: 1 and −1; Ctrl+Up and Down: 12 and −12), with the notes tied to it, as
 * MuseScore does, so the tie stays: spelt as the key signature has it, else as a natural, else with a sharp
 * going up and a flat going down; whole octaves keep the spelling. Returns the note.
 */
export function transpose(document: ScoreDocument, note: Element, semitones: number): Element {
  if (!Number.isInteger(semitones)) throw new ScoreEditError("invalid_pitch", { semitones: String(semitones) });
  return operate(document, [note], (root, [target]) => {
    const element = target!;
    const pitch = notePitch(element);
    if (!pitch) throw new ScoreEditError("not_a_note");
    const map = mapScore(root)!;
    const measure = map.measures[measureIndexOf(map, element)]!;
    const moved = transposedPitch(pitch, semitones, measure.fifths);
    checkPitch(moved);
    const changes = noChanges();
    for (const tied of tiedChain(element)) {
      checkChord(tied, moved);
      writePitch(tied, moved);
      changes.notes.add(tied);
    }
    pitchesChanged(changes, root, changes.notes);
    finish(root, changes);
    return element;
  });
}

/** The last pitched note before a position, searching back through the measures. */
function pitchBefore(root: Element, position: ScorePosition): { pitch: Pitch; note: Element } | null {
  const map = mapScore(root)!;
  for (let index = Math.min(position.measure, map.measures.length - 1); index >= 0; index -= 1) {
    const notes = map.measures[index]!.notes.filter(
      (note) => note.pitch && (index < position.measure || note.onset < position.onset - EPSILON),
    );
    const last = notes.at(-1);
    if (last) return { pitch: last.pitch!, note: last.element };
  }
  return null;
}

/**
 * The pitch A–G enter at the cursor, as MuseScore chooses it: the letter in the octave nearest the note before
 * (within a fourth; the clef's middle line when there is none), or, with `above` (Shift+A–G, adding to a chord),
 * the nearest above that pitch; altered as the key signature and the accidentals earlier in the measure have it.
 */
export function pitchForStep(
  document: ScoreDocument,
  position: ScorePosition,
  step: Step,
  options: { above?: Pitch } = {},
): Pitch {
  if (!STEPS.includes(step)) throw new ScoreEditError("invalid_pitch", { step: String(step) });
  const root = document.root;
  const map = mapScore(root)!;
  let index = position.measure;
  let onset = position.onset;
  const mapped = map.measures[index];
  if (mapped && onset >= capacityOf(mapped) - EPSILON) {
    index += 1;
    onset = 0;
  }
  const letter = STEPS.indexOf(step);
  let target: number;
  if (options.above) {
    const floor = staffStep(options.above);
    target = floor + ((((letter - floor) % 7) + 7) % 7 || 7);
  } else {
    const before = pitchBefore(root, { measure: index, onset });
    const anchor = mapped?.notes[0]?.element ?? map.measures.at(-1)?.notes[0]?.element;
    const reference = before ? staffStep(before.pitch) : ((anchor && middleLine(anchor)) ?? 34);
    target = letter + 7 * Math.round((reference - letter) / 7);
  }
  const octave = Math.min(9, Math.max(0, Math.floor(target / 7)));
  const measure = map.measures[index];
  const alter = measure
    ? alterationAt(measure, onset, step, octave)
    : keyAlteration(map.measures.at(-1)?.fifths ?? 0, step);
  return { step, alter, octave };
}

/**
 * The pitch an interval above a note gives (Alt+1–9: 3 a third, 8 an octave), on the scale the key signature and
 * the measure's earlier accidentals give: what MuseScore adds to the chord.
 */
export function pitchAbove(document: ScoreDocument, note: Element, interval: number): Pitch {
  if (!Number.isInteger(interval) || interval < 1)
    throw new ScoreEditError("invalid_pitch", { interval: String(interval) });
  const pitch = notePitch(note);
  if (!pitch) throw new ScoreEditError("not_a_note");
  const map = mapScore(document.root)!;
  const index = measureIndexOf(map, note);
  const measure = map.measures[index];
  if (!measure) throw new ScoreEditError("not_in_score");
  const onset = measure.notes.find((other) => other.element === note)!.onset;
  const target = pitchAtStep(staffStep(pitch) + interval - 1, 0);
  return { ...target, alter: alterationAt(measure, onset, target.step, target.octave) };
}
