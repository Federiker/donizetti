import { EPSILON, mapScore, type ScoreMap } from "../score-map";
import { childElement } from "../xml";
import { divisionsFactor, scaleDivisions, toDivisions } from "./divisions";
import { ScoreEditError } from "./edit-error";
import { beatOf, type NoteLength, restLengths, splitLength, wholeNotesOf } from "./lengths";
import { numberMeasures, plainNumbering } from "./measure-numbers";
import { capacityOf } from "./measures";
import {
  createNote,
  type NoteTemplate,
  notePitch,
  setWrittenLength,
  templateOf,
  templateOfNote,
} from "./note-elements";
import { type Changes, pitchesChanged } from "./operation";
import { addTie, hasTie, tieNotes, untie } from "./ties";
import { arrange, type PlacedElement, readVoice, type VoiceEvent } from "./voice";
import { createElement, insertElement, removeElement } from "./xml-edit";

const cannotRebar = (reason: string, measure: number) =>
  new ScoreEditError("cannot_rebar", { reason, measure: String(measure) });

/** An element of the stretch other than a timed note, at its time from the stretch's start; `measure` it came from. */
type Placed = PlacedElement & { measure: number };

/** The stretch as one stream: its notes and rests and its other elements, at times in divisions from its start. */
function streamOf(map: ScoreMap, start: number, end: number, bar: number) {
  const events: VoiceEvent[] = [];
  const others: Placed[] = [];
  const dropped: Element[] = [];
  let base = 0;
  for (const mapped of map.measures.slice(start, end)) {
    if (mapped.implicit) throw cannotRebar("pickup", mapped.index);
    const voice = readVoice(mapped);
    for (const event of voice.events) {
      if (event.notes.some((note) => childElement(note, "time-modification"))) {
        throw new ScoreEditError("unsupported_rhythm", { measure: String(mapped.index) });
      }
      // A measure rest is a rest as long as its old bar: kept only where that bar stays a bar.
      const measureRest = childElement(event.notes[0]!, "rest")?.getAttribute("measure") === "yes";
      if (measureRest && !(voice.capacity === bar && base % bar === 0)) dropped.push(...event.notes);
      else events.push({ ...event, start: base + event.start });
    }
    for (const other of voice.others) {
      const time = other.place === "start" ? base : other.place === "end" ? base + voice.capacity : base + other.time;
      others.push({ ...other, time, measure: mapped.index });
    }
    base += voice.capacity;
  }
  return { events, others, dropped, total: base };
}

/** What re-barring writes with: the new bars' length and divisions, their time, where the stretch starts. */
type Bars = {
  xml: XMLDocument;
  template: NoteTemplate;
  bar: number;
  divisions: number;
  time: { beats: number; beatType: number } | null;
  start: number;
  changes: Changes;
};

/**
 * Splits an event at the new barlines: the event's own notes stay as its first piece, new notes of the same
 * pitches (tied) or rests follow, a tie on to the next note leaving from the last piece. Returns the pieces in the
 * bars they fall in, at times from each bar's start.
 */
function splitEvent(bars: Bars, event: VoiceEvent): { index: number; event: VoiceEvent }[] {
  const { xml, bar, divisions, time, changes } = bars;
  const rest = childElement(event.notes[0]!, "rest") !== null;
  const continues = event.notes.map((note) => hasTie(note, "start"));
  const whole = 4 * divisions;
  const pieces: { index: number; event: VoiceEvent }[] = [];
  const end = event.start + event.duration;
  let previous: Element[] | null = null;
  for (let at = event.start; at < end; ) {
    const index = Math.floor(at / bar);
    const until = Math.min(end, (index + 1) * bar);
    const lengths: (NoteLength | null)[] | null = rest
      ? restLengths((at - index * bar) / whole, (until - index * bar) / whole, time)
      : splitLength((until - at) / whole);
    if (!lengths) throw new ScoreEditError("unsupported_rhythm", { measure: String(bars.start + index) });
    for (const length of lengths) {
      const duration = toDivisions(wholeNotesOf(length!), divisions)!;
      let notes: Element[];
      if (previous === null) {
        notes = event.notes;
        for (const note of notes) setWrittenLength(note, duration, length, bars.template.stems);
      } else {
        notes = event.notes.map((note, chord) =>
          createNote(xml, templateOfNote(note), { pitch: notePitch(note), chord: chord > 0, duration, length }),
        );
        if (!rest) for (const [chord, note] of notes.entries()) tieNotes(previous[chord]!, note);
      }
      for (const note of notes) changes.notes.add(note);
      pieces.push({ index, event: { start: at - index * bar, duration, notes } });
      at += duration;
      previous = notes;
    }
  }
  if (!rest && previous) for (const [chord, note] of previous.entries()) if (continues[chord]) addTie(note, "start");
  return pieces;
}

/** Rests filling a gap of a bar, from and to times in divisions from its start; a whole empty bar is a measure rest. */
function gapRests(bars: Bars, index: number, from: number, to: number): VoiceEvent[] {
  const { xml, template, bar, divisions, time } = bars;
  const whole = 4 * divisions;
  const lengths = restLengths(from / whole, to / whole, time, from === 0 && to === bar);
  if (!lengths) throw new ScoreEditError("unsupported_rhythm", { measure: String(bars.start + index) });
  const events: VoiceEvent[] = [];
  for (const length of lengths) {
    const duration = length ? toDivisions(wholeNotesOf(length), divisions)! : to - from;
    events.push({ start: from, duration, notes: [createNote(xml, template, { pitch: null, duration, length })] });
    from += duration;
  }
  return events;
}

/**
 * Puts the music of measures `start` to `end` (exclusive) into bars of a new time signature, as MuseScore does
 * when the time signature changes: the measures are read as one stream, each as long as its old time signature
 * (or its notes) made it, so this runs before the new time is written; and each note or rest goes into the new
 * bar it starts in, split and tied where it crosses a barline; gaps (the last bar's end, measure rests of the
 * old length) are filled with rests; chord symbols, directions and the other elements keep their times, a left
 * barline the bar it starts, a right one the bar it ends, a `<print>` the start of its bar. The old measure
 * elements are kept in order, new ones added after them or the extra ones removed, and numbered as new measures
 * are (`numberMeasures`) when the count changes. Returns how many bars the stretch now has.
 */
export function rebar(
  root: Element,
  start: number,
  end: number,
  time: { beats: number; beatType: number },
  changes: Changes,
): number {
  let map = mapScore(root)!;
  const length = time.beats / time.beatType;
  const divisions = map.measures[start]!.divisions;
  for (const mapped of map.measures.slice(start, end)) {
    if (mapped.divisions !== divisions) throw cannotRebar("divisions", mapped.index);
  }
  const factor = divisionsFactor(
    [length, beatOf(time), ...map.measures.slice(start, end).map(capacityOf)].map((wholeNotes) => ({
      wholeNotes,
      divisions,
    })),
    start,
  );
  if (factor > 1) {
    scaleDivisions(map.part, factor);
    map = mapScore(root)!;
  }
  const scale = divisions * factor;
  const bar = toDivisions(length, scale)!;
  const { events, others, dropped, total } = streamOf(map, start, end, bar);
  const count = Math.max(1, Math.ceil(total / bar - EPSILON));

  // What must be decided by the user rather than here: barlines and keys inside a bar.
  for (const other of others) {
    const onBarline = other.time % bar === 0;
    if (other.place !== "time" && !onBarline && !(other.place === "end" && other.time === total)) {
      throw cannotRebar("barline", other.measure);
    }
    if (other.element.localName === "attributes" && childElement(other.element, "key") && !onBarline) {
      throw cannotRebar("key", other.measure);
    }
  }

  for (const note of dropped) removeElement(note);
  // A tie from the stretch's last note on into the next measure is undone when rests will now come between.
  const last = events.at(-1);
  if (last && last.start + last.duration < count * bar) {
    pitchesChanged(
      changes,
      root,
      last.notes.flatMap((note) => untie(note, ["start"])),
    );
  }

  // The measure elements: the stretch's own, then new ones (each holding a placeholder that gives it its layout).
  const xml = root.ownerDocument;
  const elements = map.measures.slice(start, end).map((mapped) => mapped.element);
  const numbering = plainNumbering(map.part);
  const placeholders: Element[] = [];
  const added: Element[] = [];
  while (elements.length < count) {
    const previous = elements.at(-1)!;
    const placeholder = createElement(xml, "note");
    // Numbered once the bars are in place (`numberMeasures`).
    const measure = createElement(xml, "measure", [placeholder], { number: "" });
    elements.push(insertElement(previous.parentElement!, measure, previous.nextElementSibling));
    added.push(measure);
    placeholders.push(placeholder);
  }

  const context: Bars = { xml, template: templateOf(map.part), bar, divisions: scale, time, start, changes };
  const bars: VoiceEvent[][] = Array.from({ length: count }, () => []);
  for (const event of events) {
    const index = Math.floor(event.start / bar);
    if (event.start + event.duration <= (index + 1) * bar) {
      bars[index]!.push({ ...event, start: event.start - index * bar });
      continue;
    }
    for (const piece of splitEvent(context, event)) bars[piece.index]!.push(piece.event);
  }

  const ownerOf = (other: Placed) => {
    if (other.place === "end") return other.time === total ? count - 1 : other.time / bar - 1;
    return Math.min(count - 1, Math.floor(other.time / bar));
  };
  for (const [index, members] of bars.entries()) {
    const filled: VoiceEvent[] = [];
    let at = 0;
    for (const event of members) {
      if (event.start > at) filled.push(...gapRests(context, index, at, event.start));
      filled.push(event);
      at = event.start + event.duration;
    }
    if (at < bar) filled.push(...gapRests(context, index, at, bar));
    const placed: PlacedElement[] = others
      .filter((other) => ownerOf(other) === index)
      .map((other) => {
        if (other.element.localName === "print") return { element: other.element, place: "start", time: 0 };
        return {
          element: other.element,
          place: other.place,
          time: other.place === "end" ? bar : other.time - index * bar,
        };
      });
    const voice = {
      measure: elements[index]!,
      index: start + index,
      divisions: scale,
      capacity: bar,
      time,
      events: [],
      others: placed,
    };
    arrange(voice, filled);
    changes.rhythm.add(start + index);
  }
  for (const placeholder of placeholders) removeElement(placeholder);
  // The old measures no longer needed: their notes and elements have all gone into the new bars (measure rests aside).
  for (const element of elements.slice(count)) removeElement(element);
  if (count !== end - start) numberMeasures(map.part, numbering, added);
  return count;
}
