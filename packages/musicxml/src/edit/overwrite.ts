import { EPSILON, mapScore, midiOf, type Pitch, type ScoreMap } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { childElement, childElements } from "../xml";
import { divisionsFactor, scaleDivisions, toDivisions } from "./divisions";
import { rejoinLyrics } from "./lyrics";
import { ScoreEditError } from "./edit-error";
import { beatOf, isNoteLength, type NoteLength, restLengths, splitLength, wholeNotesOf } from "./lengths";
import { mappedNote, type ScorePosition } from "./edit-context";
import { addMeasures, capacityOf } from "./measures";
import {
  createNote,
  type NoteTemplate,
  notePitch,
  setWrittenLength,
  templateOf,
  templateOfNote,
} from "./note-elements";
import { type Changes, finish, noChanges, operate, pitchesChanged } from "./operation";
import { chordOf, tieNotes, untie } from "./ties";
import { arrange, contentEnd, readVoice, type Voice, type VoiceEvent } from "./voice";
import { removeElement, stripLayout } from "./xml-edit";

/** What the editor needs after a rhythm edit: the notes written (a chord's first note, one for each tied piece) and where the cursor goes next. */
export type NoteEdit = { notes: Element[]; next: ScorePosition };

/** What is written at the cursor: a pitch, or null for a rest, and a length. */
export type WrittenNote = { pitch: Pitch | null; length: NoteLength };

const STEPS = ["C", "D", "E", "F", "G", "A", "B"];

/** Throws `invalid_pitch` for a pitch MusicXML and MIDI cannot write. */
export function checkPitch(pitch: Pitch) {
  const valid =
    STEPS.includes(pitch.step) &&
    Number.isInteger(pitch.octave) &&
    pitch.octave >= 0 &&
    pitch.octave <= 9 &&
    Number.isFinite(pitch.alter) &&
    Math.abs(pitch.alter) <= 2 &&
    midiOf(pitch) >= 0 &&
    midiOf(pitch) <= 127;
  if (!valid) throw new ScoreEditError("invalid_pitch", { pitch: JSON.stringify(pitch) });
}

/** Throws `invalid_length` for a length that is not a MusicXML type with up to four dots. */
export function checkLength(length: NoteLength) {
  if (!isNoteLength(length)) throw new ScoreEditError("invalid_length", { length: JSON.stringify(length) });
}

/** The position a time reaches: the next measure's start when it is the measure's end. */
export function positionAt(map: ScoreMap, measure: number, onset: number): ScorePosition {
  const mapped = map.measures[measure];
  if (mapped && onset >= capacityOf(mapped) - EPSILON) return { measure: measure + 1, onset: 0 };
  return { measure, onset };
}

/** What a span writes: a chord's pitches (none for rests) for a length, perhaps keeping a chord's own notes. */
type Span = {
  pitches: Pitch[];
  /** The length as asked: written as it is when the span fits in its measure. */
  length?: NoteLength;
  /** A chord whose notes are kept as the span's first notes (a length changed), with their lyrics and the rest. */
  reuse?: Element[];
  /** The span's first notes continue a tie from the note before (T in note input): they take no lyrics. */
  continuesTie?: boolean;
};

type Context = { xml: XMLDocument; voice: Voice; template: NoteTemplate; changes: Changes; partners: Element[] };

const unsupported = (voice: Voice) => new ScoreEditError("unsupported_rhythm", { measure: String(voice.index) });

/** Rests filling a gap of the voice, from and to times in divisions (`restLengths`). */
function restEvents(context: Context, from: number, to: number): VoiceEvent[] {
  const { voice, xml, template } = context;
  const whole = 4 * voice.divisions;
  const lengths = restLengths(from / whole, to / whole, voice.time, from === 0 && to === voice.capacity);
  if (!lengths) throw unsupported(voice);
  const events: VoiceEvent[] = [];
  let at = from;
  for (const length of lengths) {
    const duration = length ? toDivisions(wholeNotesOf(length), voice.divisions) : to - from;
    if (duration === null) throw unsupported(voice);
    events.push({ start: at, duration, notes: [createNote(xml, template, { pitch: null, duration, length })] });
    at += duration;
  }
  return events;
}

/**
 * The first part of a note or rest cut short at a time: the note itself with its new length, and, when one type
 * cannot write it, tied notes of the same pitches after it (rests without ties, as they fill a gap).
 */
function shorten(context: Context, event: VoiceEvent, duration: number): VoiceEvent[] {
  const { voice, xml, changes } = context;
  const whole = 4 * voice.divisions;
  const rest = childElement(event.notes[0]!, "rest") !== null;
  const lengths = rest
    ? restLengths(event.start / whole, (event.start + duration) / whole, voice.time)
    : splitLength(duration / whole);
  if (!lengths) throw unsupported(voice);
  const events: VoiceEvent[] = [];
  let at = event.start;
  for (const [index, length] of lengths.entries()) {
    const pieceDuration = toDivisions(wholeNotesOf(length!), voice.divisions);
    if (pieceDuration === null) throw unsupported(voice);
    let notes: Element[];
    if (index === 0) {
      notes = event.notes;
      for (const note of notes) setWrittenLength(note, pieceDuration, length, context.template.stems);
    } else {
      notes = event.notes.map((note, chord) =>
        createNote(xml, templateOfNote(note), {
          pitch: notePitch(note),
          chord: chord > 0,
          duration: pieceDuration,
          length,
        }),
      );
      if (!rest) for (const [chord, note] of notes.entries()) tieNotes(events.at(-1)!.notes[chord]!, note);
    }
    for (const note of notes) changes.notes.add(note);
    events.push({ start: at, duration: pieceDuration, notes });
    at += pieceDuration;
  }
  return events;
}

/**
 * Writes events over a measure's voice from `from` to `to` (divisions), as MuseScore's note input overwrites:
 * a note or rest begun before `from` is cut short there, those inside are removed (their ties undone at both
 * ends), the part of one reaching past `to` becomes rests, and a gap before `from` is filled with rests. Chord
 * symbols, directions and the measure's other elements keep their times (`arrange`). The lyrics of the note
 * removed at `from` go to the first note written when `lyrics` says so (a note, not a rest nor a tied
 * continuation); those of every other note removed are dropped, the verse's hyphens before and after them made
 * to agree (`rejoinLyrics`).
 */
function overwriteMeasure(
  context: Context,
  from: number,
  to: number,
  inserted: VoiceEvent[],
  options: { lyrics: boolean; reuse: Element | null },
) {
  const { voice, partners } = context;
  const before: VoiceEvent[] = [];
  const after: VoiceEvent[] = [];
  let tail: VoiceEvent[] = [];
  const removed: Element[] = [];
  const end = contentEnd(voice.events);
  const first = inserted[0]?.notes[0];
  const handsOver = (event: VoiceEvent) => event.start === from && options.lyrics && first !== undefined;
  // The notes whose lyrics go, read before anything changes: the syllables around them are still in place.
  const dropped = voice.events
    .filter((event) => event.start >= from && event.start < to && event.notes[0] !== options.reuse && !handsOver(event))
    .flatMap((event) => event.notes);
  if (dropped.some((note) => childElement(note, "lyric"))) {
    rejoinLyrics(mapScore(context.xml.documentElement)!, new Set(dropped));
  }
  for (const event of voice.events) {
    const eventEnd = event.start + event.duration;
    if (eventEnd <= from) {
      before.push(event);
      continue;
    }
    if (event.start >= to) {
      after.push(event);
      continue;
    }
    if (event.notes[0] !== options.reuse && event.notes.some((note) => childElement(note, "time-modification"))) {
      throw unsupported(voice);
    }
    if (eventEnd > to) tail = restEvents(context, to, eventEnd);
    if (event.notes[0] === options.reuse) continue;
    if (event.start < from) {
      for (const note of event.notes) partners.push(...untie(note, ["start"]));
      before.push(...shorten(context, event, from - event.start));
      continue;
    }
    for (const note of event.notes) partners.push(...untie(note));
    if (handsOver(event)) {
      for (const lyric of event.notes.flatMap((note) => childElements(note, "lyric"))) {
        first!.appendChild(stripLayout(lyric));
      }
    }
    removed.push(...event.notes);
  }
  // A measure that stops short of the cursor: rests up to it.
  if (end < from) before.push(...restEvents(context, end, from));
  for (const element of removed) removeElement(element);
  arrange(voice, [...before, ...inserted, ...tail, ...after]);
}

/**
 * Writes a chord (or a rest) of a length from a position, across as many barlines as it takes: in each measure
 * it overwrites what was there, split into tied notes where it crosses a barline or no single type writes it,
 * measures (each one measure rest) added at the end of the part when it runs past it. The divisions are raised
 * first when a length needs it (`scaleDivisions`). Returns the notes written, piece by piece (a chord's notes in
 * each), and the position after them.
 */
export function writeSpan(
  root: Element,
  position: ScorePosition,
  total: number,
  span: Span,
  changes: Changes,
): { pieces: Element[][]; next: ScorePosition } {
  let map = mapScore(root)!;
  const count = map.measures.length;
  const { measure: start, onset: startOnset } = position;
  const last = map.measures.at(-1);
  // How long a measure added at the end is: the last one's time signature, else its length.
  const lastLength = last ? (last.expectedLength ?? capacityOf(last)) : 1;
  const added = lastLength > 0 ? lastLength : 1;
  const capacity = (index: number) => (index < count ? capacityOf(map.measures[index]!) : added);
  if (
    !Number.isInteger(start) ||
    start < 0 ||
    start > count ||
    !(startOnset >= 0) ||
    startOnset > capacity(start) + EPSILON ||
    (start === count && startOnset > EPSILON)
  ) {
    throw new ScoreEditError("not_in_score", { measure: String(start), onset: String(startOnset) });
  }

  // Where the span falls: a segment in each measure it reaches, each written as one or more tied notes.
  const segments: { measure: number; onset: number; length: number; pieces: NoteLength[] }[] = [];
  let measure = start;
  let onset = startOnset;
  let remaining = total;
  while (remaining > EPSILON) {
    const room = capacity(measure) - onset;
    if (room > EPSILON) {
      const length = Math.min(remaining, room);
      const fits = span.length && segments.length === 0 && Math.abs(wholeNotesOf(span.length) - length) < EPSILON;
      const pieces = fits ? [span.length!] : splitLength(length);
      if (!pieces) throw new ScoreEditError("unsupported_rhythm", { measure: String(measure) });
      segments.push({ measure, onset, length, pieces });
      remaining -= length;
      if (remaining <= EPSILON) {
        onset += length;
        break;
      }
    }
    measure += 1;
    onset = 0;
  }

  // The divisions must count the notes written, and the beat too: rests are kept within it (`restLengths`).
  const measureOf = (index: number) => map.measures[Math.min(index, count - 1)];
  const factor = divisionsFactor(
    segments.flatMap((segment) =>
      [
        segment.onset,
        segment.length,
        capacity(segment.measure),
        beatOf(measureOf(segment.measure)?.time ?? null),
        ...segment.pieces.map(wholeNotesOf),
      ].map((wholeNotes) => ({ wholeNotes, divisions: measureOf(segment.measure)?.divisions ?? 1 })),
    ),
    start,
  );
  if (factor > 1) {
    scaleDivisions(map.part, factor);
    map = mapScore(root)!;
  }

  const xml = root.ownerDocument;
  const template = templateOf(map.part);
  // Past the end of the part: measures added as `appendMeasures` adds them.
  const missing = segments.at(-1)!.measure + 1 - count;
  if (missing > 0) {
    addMeasures(map, count, missing, added);
    map = mapScore(root)!;
  }

  const partners: Element[] = [];
  const pieces: Element[][] = [];
  for (const [index, segment] of segments.entries()) {
    const voice = readVoice(map.measures[segment.measure]!);
    const context: Context = { xml, voice, template, changes, partners };
    const from = toDivisions(segment.onset, voice.divisions)!;
    let at = from;
    const inserted: VoiceEvent[] = [];
    for (const [piece, length] of segment.pieces.entries()) {
      const duration = toDivisions(wholeNotesOf(length), voice.divisions)!;
      let notes: Element[];
      if (index === 0 && piece === 0 && span.reuse) {
        notes = span.reuse;
        for (const note of notes) setWrittenLength(note, duration, length, template.stems);
      } else if (span.pitches.length === 0) {
        notes = [
          createNote(xml, span.reuse ? templateOfNote(span.reuse[0]!) : template, { pitch: null, duration, length }),
        ];
      } else {
        notes = span.pitches.map((pitch, chord) =>
          createNote(xml, span.reuse?.[chord] ? templateOfNote(span.reuse[chord]!) : template, {
            pitch,
            chord: chord > 0,
            duration,
            length,
          }),
        );
      }
      for (const note of notes) changes.notes.add(note);
      inserted.push({ start: at, duration, notes });
      pieces.push(notes);
      at += duration;
    }
    overwriteMeasure(context, from, at, inserted, {
      // Only a note that starts there takes the lyrics of the note it replaces: a rest or a note tied from the
      // one before (in the next measure, or T in note input) drops them (owner decision, 27 October 2026).
      lyrics: span.pitches.length > 0 && index === 0 && !span.continuesTie,
      reuse: index === 0 ? (span.reuse?.[0] ?? null) : null,
    });
    changes.rhythm.add(segment.measure);
  }
  if (span.pitches.length > 0) {
    for (let piece = 1; piece < pieces.length; piece += 1) {
      for (const [chord, note] of pieces[piece]!.entries()) tieNotes(pieces[piece - 1]![chord]!, note);
    }
  }
  pitchesChanged(changes, root, partners);
  return { pieces, next: positionAt(mapScore(root)!, measure, onset) };
}

/**
 * Writes a note or a rest at the cursor, as MuseScore's note input does (A–G, 0): what was there for its length
 * is replaced — notes and rests cut short, split or removed, the rest of a note reaching past it left as rests;
 * a note crossing the barline is split and tied into the next measure (one added at the end, filled with a
 * measure rest, when there is none; `position` may also be the end of the score). Chord symbols and directions
 * keep their times; the lyrics of a note replaced at the same onset go to the new note (a rest or a tied
 * continuation in the next measure drops them, `rejoinLyrics` keeping the hyphens in agreement). Beams, stems and
 * accidentals are written again in the measures it touched. Returns the notes written (one for each tied piece)
 * and the cursor's next position.
 */
export function writeNote(document: ScoreDocument, position: ScorePosition, note: WrittenNote): NoteEdit {
  checkLength(note.length);
  if (note.pitch) checkPitch(note.pitch);
  return operate(document, [], (root) => {
    const changes = noChanges();
    const { pieces, next } = writeSpan(
      root,
      position,
      wholeNotesOf(note.length),
      { pitches: note.pitch ? [note.pitch] : [], length: note.length },
      changes,
    );
    finish(root, changes);
    return { notes: pieces.map((piece) => piece[0]!), next };
  });
}

/** The measure and onset of a timed note's chord; throws `unsupported_rhythm` for a grace note or a tuplet's. */
export function placeOf(
  root: Element,
  note: Element,
): { map: ScoreMap; measure: number; onset: number; length: number } {
  const map = mapScore(root)!;
  const mapped = mappedNote(map, chordOf(note)[0]!);
  const measure = mapped.measure;
  if (mapped.grace || childElement(note, "time-modification")) {
    throw new ScoreEditError("unsupported_rhythm", { measure: String(measure) });
  }
  return { map, measure, onset: mapped.onset, length: mapped.length };
}

/**
 * Gives a note (with its chord) or a rest a new length, as MuseScore does: a longer one overwrites what follows,
 * across barlines with ties; a shorter one leaves rests after it. The note keeps its lyrics and everything else
 * it carries; a tie to the next note is undone when its end moves. Returns the notes written and the position
 * after them.
 */
export function setLength(document: ScoreDocument, note: Element, length: NoteLength): NoteEdit {
  checkLength(length);
  return operate(document, [note], (root, [target]) => {
    const changes = noChanges();
    const chord = chordOf(target!);
    const place = placeOf(root, target!);
    if (Math.abs(place.length - wholeNotesOf(length)) > EPSILON) {
      pitchesChanged(
        changes,
        root,
        chord.flatMap((member) => untie(member, ["start"])),
      );
    }
    const pitches = chord.map(notePitch).filter((pitch) => pitch !== null);
    const { pieces, next } = writeSpan(
      root,
      { measure: place.measure, onset: place.onset },
      wholeNotesOf(length),
      { pitches, length, reuse: chord },
      changes,
    );
    finish(root, changes);
    return { notes: pieces.map((piece) => piece[0]!), next };
  });
}
