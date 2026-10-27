import { EPSILON, type MappedNote, type ScoreMap } from "../score-map";
import { childElement, childElements } from "../xml";
import { isCompound, type NoteType, writtenLength } from "./lengths";
import { createElement, insertElement, insertInOrder, removeElement } from "./xml-edit";

/** How many beams a note type carries: one for an eighth, two for a 16th… */
const BEAM_COUNT: Partial<Record<NoteType, number>> = {
  eighth: 1,
  "16th": 2,
  "32nd": 3,
  "64th": 4,
  "128th": 5,
  "256th": 6,
  "512th": 7,
  "1024th": 8,
};

/**
 * Where beams break, in whole notes from the measure's start, for the eighths' beam, the 16ths' and the shorter
 * ones'. MuseScore 4's default groupings: in 4/4, 2/2, 3/2 and 4/2 eighths by half bar (four eighths in 4/4),
 * 16ths by quarter; in 2/4 and 3/4 eighths by bar (all six eighths of a 3/4 bar together), 16ths by quarter; in
 * 3/8, 6/8, 9/8 and 12/8 eighths and 16ths by dotted quarter; 32nds and shorter by eighth. Other signatures: by
 * beat, a dotted one in compound time.
 */
export function beamBreaks(time: { beats: number; beatType: number } | null): [number, number, number] {
  if (!time) return [1 / 4, 1 / 4, 1 / 8];
  switch (`${time.beats}/${time.beatType}`) {
    case "2/2":
    case "3/2":
    case "4/2":
    case "4/4":
      return [1 / 2, 1 / 4, 1 / 8];
    case "2/4":
      return [1 / 2, 1 / 4, 1 / 8];
    case "3/4":
      return [3 / 4, 1 / 4, 1 / 8];
    default:
      break;
  }
  if (isCompound(time)) return [3 / time.beatType, 3 / time.beatType, 1 / time.beatType];
  const beat = 1 / time.beatType;
  return [beat, beat, Math.min(beat, 1 / 8)];
}

/** Whether a beam break (a multiple of `every`) falls after `from` and at or before `to`. */
const breaksBetween = (from: number, to: number, every: number) =>
  Math.floor(to / every + EPSILON) > Math.floor(from / every + EPSILON);

type BeamValue = "begin" | "continue" | "end" | "forward hook" | "backward hook";

type Chord = { onset: number; beams: number; notes: Element[] };

/** The beams a note should carry, `<beam number>` by number. */
function writeBeams(note: Element, wanted: [number, BeamValue][]) {
  const existing = childElements(note, "beam");
  const numberOf = (beam: Element) => Number(beam.getAttribute("number") ?? "1");
  for (const beam of existing) if (!wanted.some(([number]) => number === numberOf(beam))) removeElement(beam);
  for (const [number, value] of wanted) {
    const beam = existing.find((element) => numberOf(element) === number && element.parentNode);
    if (beam) {
      if (beam.textContent?.trim() !== value) beam.textContent = value;
      continue;
    }
    const element = createElement(note.ownerDocument, "beam", value, { number: String(number) });
    const after = childElements(note, "beam").find((other) => numberOf(other) > number);
    if (after) insertElement(note, element, after);
    else insertInOrder(note, element, "note");
  }
}

/**
 * Beams a measure's notes by beat as MuseScore does by default (`beamBreaks`): `<beam number="1">` `begin`,
 * `continue` and `end` over each group of eighths and shorter, more beams for 16ths, 32nds… and a forward or
 * backward hook on a short note with no neighbour to join at its level. Rests, notes of a quarter or longer and
 * the breaks end a group; a group of one is not beamed. The beams are written on a chord's first note, and on
 * its other notes where the file already writes them there. Measures with tuplets are left as they are (tuplets
 * are not edited yet), and grace notes keep their own beams.
 */
export function rebeamMeasure(map: ScoreMap, index: number) {
  const measure = map.measures[index];
  if (!measure) return;
  if (measure.notes.some((note) => childElement(note.element, "time-modification"))) return;
  const chords: Chord[] = [];
  for (const note of measure.notes) {
    if (note.grace) continue;
    if (note.chord && chords.length > 0) {
      chords.at(-1)!.notes.push(note.element);
      continue;
    }
    chords.push({ onset: note.onset, beams: beamsOf(note), notes: [note.element] });
  }
  const [first, second, others] = beamBreaks(measure.time);
  const groups: Chord[][] = [];
  let group: Chord[] = [];
  const close = () => {
    if (group.length > 1) groups.push(group);
    group = [];
  };
  for (const chord of chords) {
    if (chord.beams === 0) {
      close();
      continue;
    }
    if (group.length > 0 && breaksBetween(group.at(-1)!.onset, chord.onset, first)) close();
    group.push(chord);
  }
  close();
  const wanted = new Map<Chord, [number, BeamValue][]>();
  for (const members of groups) {
    const last = members.length - 1;
    for (const [position, chord] of members.entries()) {
      const values: [number, BeamValue][] = [[1, position === 0 ? "begin" : position === last ? "end" : "continue"]];
      for (let level = 2; level <= chord.beams; level += 1) {
        const every = level === 2 ? second : others;
        const before = members[position - 1];
        const after = members[position + 1];
        const breakBefore = before !== undefined && breaksBetween(before.onset, chord.onset, every);
        const left = before !== undefined && before.beams >= level && !breakBefore;
        const right = after !== undefined && after.beams >= level && !breaksBetween(chord.onset, after.onset, every);
        let value: BeamValue;
        if (left && right) value = "continue";
        else if (left) value = "end";
        else if (right) value = "begin";
        else value = position === 0 || (breakBefore && position < last) ? "forward hook" : "backward hook";
        values.push([level, value]);
      }
      wanted.set(chord, values);
    }
  }
  for (const chord of chords) {
    const values = wanted.get(chord) ?? [];
    const [main, ...rest] = chord.notes;
    writeBeams(main!, values);
    for (const note of rest) if (childElement(note, "beam")) writeBeams(note, values);
  }
}

function beamsOf(note: MappedNote): number {
  if (note.rest) return 0;
  const length = writtenLength(note.element);
  return length ? (BEAM_COUNT[length.type] ?? 0) : 0;
}
