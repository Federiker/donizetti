import { EPSILON } from "../score-map";
import { childElements, childText } from "../xml";

/** MusicXML's note types (`<type>`), from the 1024th to the maxima. */
export type NoteType =
  | "1024th"
  | "512th"
  | "256th"
  | "128th"
  | "64th"
  | "32nd"
  | "16th"
  | "eighth"
  | "quarter"
  | "half"
  | "whole"
  | "breve"
  | "long"
  | "maxima";

/** The note types, shortest first: each is twice the one before. */
export const NOTE_TYPES: readonly NoteType[] = [
  "1024th",
  "512th",
  "256th",
  "128th",
  "64th",
  "32nd",
  "16th",
  "eighth",
  "quarter",
  "half",
  "whole",
  "breve",
  "long",
  "maxima",
];

/** A written note length: its type and its dots, each adding half the length before it (none when left out). */
export type NoteLength = { type: NoteType; dots?: number };

/** The most dots a length may have (MuseScore's limit too). */
export const MAX_DOTS = 4;

/** Whether a value is a note length MusicXML can write: a known type and 0 to 4 dots. */
export function isNoteLength(length: unknown): length is NoteLength {
  if (typeof length !== "object" || length === null) return false;
  const { type, dots } = length as { type?: unknown; dots?: unknown };
  return (
    NOTE_TYPES.includes(type as NoteType) &&
    (dots === undefined || (Number.isInteger(dots) && (dots as number) >= 0 && (dots as number) <= MAX_DOTS))
  );
}

/** How long a note type lasts, in whole notes (a quarter is 1/4). */
export function typeLength(type: NoteType): number {
  return 2 ** (NOTE_TYPES.indexOf(type) - NOTE_TYPES.indexOf("whole"));
}

/** How long a written length lasts, in whole notes: a dotted quarter is 3/8. */
export function wholeNotesOf(length: NoteLength): number {
  return typeLength(length.type) * (2 - 2 ** -(length.dots ?? 0));
}

/** The one written length (type and dots) that lasts this many whole notes, or null when none does. */
export function noteLengthOf(wholeNotes: number): NoteLength | null {
  for (let dots = 0; dots <= MAX_DOTS; dots += 1) {
    for (const type of NOTE_TYPES) {
      if (Math.abs(wholeNotesOf({ type, dots }) - wholeNotes) < EPSILON) return dots === 0 ? { type } : { type, dots };
    }
  }
  return null;
}

/** The lengths a split may use, longest first: every type, plain and with up to `maxDots` dots. */
function candidates(maxDots: number): NoteLength[] {
  const lengths: NoteLength[] = [];
  for (const type of NOTE_TYPES) {
    for (let dots = 0; dots <= maxDots; dots += 1) lengths.push(dots === 0 ? { type } : { type, dots });
  }
  return lengths.sort((a, b) => wholeNotesOf(b) - wholeNotesOf(a));
}

const SPLIT_LENGTHS = candidates(1);

/**
 * A length in whole notes as written notes to tie together, longest first, each the longest plain or dotted
 * type that still fits (5/8 is a half and an eighth, 7/8 a dotted half and an eighth): how a note too long for
 * one type, or split at a barline, is written. Null when no such notes add up to it (a tuplet's length).
 */
export function splitLength(wholeNotes: number): NoteLength[] | null {
  const lengths: NoteLength[] = [];
  let remaining = wholeNotes;
  while (remaining > EPSILON) {
    const length = SPLIT_LENGTHS.find((candidate) => wholeNotesOf(candidate) <= remaining + EPSILON);
    if (!length) return null;
    lengths.push(length);
    remaining -= wholeNotesOf(length);
  }
  return lengths;
}

/** Whether a position (whole notes from the measure's start) falls on a multiple of a length. */
const alignedTo = (position: number, length: number) => {
  const ratio = position / length;
  return Math.abs(ratio - Math.round(ratio)) < EPSILON;
};

/** Whether a time signature is compound: its beat a dotted note (6/8, 9/8, 12/8 and 3/8). */
export function isCompound(time: { beats: number; beatType: number } | null): boolean {
  return time !== null && time.beats % 3 === 0 && time.beatType >= 8;
}

/** A time signature's beat, in whole notes: a dotted one in compound time (3/8 in 6/8), a quarter without one. */
export function beatOf(time: { beats: number; beatType: number } | null): number {
  if (!time) return 1 / 4;
  return (isCompound(time) ? 3 : 1) / time.beatType;
}

/**
 * The rests that fill a gap of a measure, from `from` to `to` (whole notes from its start), as MuseScore writes
 * them: each the longest that fits, starts on a multiple of its own length and, when it starts off the beat,
 * ends by the next beat (after a quarter in 4/4, a quarter rest then a half, never a half across the middle of
 * the bar; after a quarter in 6/8, an eighth rest then a dotted quarter); in compound time dotted rests of a
 * beat or more too. When the gap is the whole measure (`wholeMeasure`), it is one measure rest (null:
 * `<rest measure="yes"/>`, no type, as MuseScore writes it). Null when the gap is off the 1024th notes' grid.
 */
export function restLengths(
  from: number,
  to: number,
  time: { beats: number; beatType: number } | null,
  wholeMeasure = false,
): (NoteLength | null)[] | null {
  if (wholeMeasure) return [null];
  const compound = isCompound(time);
  const beat = beatOf(time);
  const usable = candidates(1).filter((length) => !length.dots || (compound && wholeNotesOf(length) >= beat - EPSILON));
  const rests: NoteLength[] = [];
  let position = from;
  while (position < to - EPSILON) {
    const remaining = to - position;
    const onBeat = alignedTo(position, beat);
    const nextBeat = (Math.floor(position / beat + EPSILON) + 1) * beat;
    const length = usable.find((candidate) => {
      const length = wholeNotesOf(candidate);
      return (
        length <= remaining + EPSILON &&
        alignedTo(position, length) &&
        (onBeat || position + length <= nextBeat + EPSILON)
      );
    });
    if (!length) return null;
    rests.push(length);
    position += wholeNotesOf(length);
  }
  return rests;
}

/** The written length of a `<note>`: its `<type>` and `<dot>`s, or null without a type (a measure rest). */
export function writtenLength(note: Element): NoteLength | null {
  const type = childText(note, "type") as NoteType | null;
  if (type === null || !NOTE_TYPES.includes(type)) return null;
  const dots = childElements(note, "dot").length;
  return dots === 0 ? { type } : { type, dots };
}
