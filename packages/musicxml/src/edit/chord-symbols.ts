import { EPSILON, type MappedMeasure, type ScoreMap } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { type ChordNote, type ChordSymbol, parseChordSymbol, readChordSymbol } from "./chord-symbol-text";
import {
  anchorAt,
  chordHead,
  divisionsText,
  editableMap,
  elementsBefore,
  insertInMeasure,
  mappedNote,
  offsetOf,
  type ScorePosition,
} from "./edit-context";
import { ScoreEditError } from "./edit-error";
import { createElement, edit, insertElement, insertInOrder, removeElement } from "./xml-edit";

/** The children of a `<harmony>` that say which chord it is: replaced together when the chord changes. */
const CHORD_CHILDREN = ["root", "numeral", "function", "kind", "inversion", "bass", "degree", "frame"];

/** Where a note starts: the moment its chord symbol belongs to. */
function positionOf(map: ScoreMap, note: Element): ScorePosition {
  const head = chordHead(map, mappedNote(map, note));
  return { measure: head.measure, onset: head.onset };
}

/** The place a chord symbol at this moment is written, and the `<harmony>` already there, if any. */
function harmonyPlace(map: ScoreMap, position: ScorePosition) {
  const { measure, anchor, offset } = anchorAt(map, position);
  const run = anchor ? elementsBefore(anchor) : Array.from(measure.element.children);
  const existing =
    run.find(
      (element) => element.localName === "harmony" && Math.abs(offsetOf(element, measure.divisions) - offset) < EPSILON,
    ) ?? null;
  // MuseScore writes a moment's harmony before its directions, harmonies later in a note after earlier ones.
  const before =
    run.find(
      (element) =>
        element.localName === "direction" ||
        (element.localName === "harmony" && offsetOf(element, measure.divisions) > offset + EPSILON),
    ) ??
    anchor ??
    null;
  return { measure, anchor, offset, existing, before };
}

/** The `<harmony>` at a moment (a note's start, or a time within a note), or null. */
export function chordSymbolAt(map: ScoreMap, at: Element | ScorePosition): Element | null {
  const position = "measure" in at ? at : positionOf(map, at);
  return harmonyPlace(map, position).existing;
}

const noteElements = (xml: XMLDocument, note: ChordNote, prefix: "root" | "bass") => [
  createElement(xml, `${prefix}-step`, note.step),
  ...(note.alter !== 0 ? [createElement(xml, `${prefix}-alter`, String(note.alter))] : []),
];

/** The elements that write a chord symbol, in the schema's order, as MuseScore 4 writes them. */
function chordElements(xml: XMLDocument, symbol: ChordSymbol): Element[] {
  // No chord still needs a root in MusicXML: MuseScore writes C, shown as nothing.
  const root = symbol.root
    ? createElement(xml, "root", noteElements(xml, symbol.root, "root"))
    : createElement(xml, "root", [createElement(xml, "root-step", "C", { text: "" })]);
  const kindAttributes: Record<string, string> = {};
  if (symbol.text !== null) kindAttributes.text = symbol.text;
  if (symbol.useSymbols) kindAttributes["use-symbols"] = "yes";
  if (symbol.parenthesesDegrees) kindAttributes["parentheses-degrees"] = "yes";
  const elements = [root, createElement(xml, "kind", symbol.kind, kindAttributes)];
  if (symbol.bass) {
    elements.push(createElement(xml, "bass", noteElements(xml, symbol.bass, "bass"), { arrangement: "horizontal" }));
  }
  for (const degree of symbol.degrees) {
    elements.push(
      createElement(
        xml,
        "degree",
        [
          createElement(xml, "degree-value", String(degree.value)),
          createElement(xml, "degree-alter", String(degree.alter)),
          createElement(xml, "degree-type", degree.type),
        ],
        degree.printed ? {} : { "print-object": "no" },
      ),
    );
  }
  return elements;
}

const sameSymbol = (a: ChordSymbol | null, b: ChordSymbol) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Writes a chord symbol, typed as a user types it (`parseChordSymbol`), at a note's start (a chord's first
 * note, before any grace notes) or at a moment within a note (with `<offset>`, as MuseScore writes a chord
 * change mid-note). One there already is replaced: its attributes and its offset, staff and editorial
 * children kept, its chord (and any fretboard frame, which showed the old chord) written afresh. Text that is
 * not a chord symbol is a `chord_symbol_unreadable` error. Returns the `<harmony>`.
 */
export function setChordSymbol(document: ScoreDocument, at: Element | ScorePosition, typed: string): Element {
  const symbol = parseChordSymbol(typed);
  if (!symbol) throw new ScoreEditError("chord_symbol_unreadable", { text: typed });
  const map = editableMap(document);
  const position = "measure" in at ? at : positionOf(map, at);
  const place = harmonyPlace(map, position);
  return edit(document, (xml) => {
    const { existing } = place;
    if (existing) {
      if (sameSymbol(readChordSymbol(existing), symbol)) return existing;
      // The new chord goes in before the old one goes, so that it is laid out as the harmony's children were.
      const old = Array.from(existing.children).filter((child) => CHORD_CHILDREN.includes(child.localName));
      for (const element of chordElements(xml, symbol)) insertInOrder(existing, element, "harmony");
      for (const element of old) removeElement(element);
      return existing;
    }
    const harmony = createElement(xml, "harmony", chordElements(xml, symbol), { "print-frame": "no" });
    if (place.offset > 0) {
      harmony.appendChild(createElement(xml, "offset", divisionsText(place.offset, place.measure.divisions)));
    }
    return place.before
      ? insertElement(place.measure.element, harmony, place.before)
      : insertInMeasure(place.measure.element, harmony, null);
  });
}

/** Removes the chord symbol at a note's start or a moment within a note; `no_chord_symbol` when there is none. */
export function removeChordSymbol(document: ScoreDocument, at: Element | ScorePosition) {
  const map = editableMap(document);
  const existing = chordSymbolAt(map, at);
  if (!existing) throw new ScoreEditError("no_chord_symbol");
  edit(document, () => removeElement(existing));
}

/** The length of a beat in whole notes: the time signature's beat, a dotted one in compound time (6/8, 12/8). */
function beatOf(measure: MappedMeasure): number | null {
  if (!measure.time) return null;
  const { beats, beatType } = measure.time;
  return beats > 3 && beats % 3 === 0 && beatType >= 8 ? 3 / beatType : 1 / beatType;
}

/** The moments of a measure a chord symbol may go to: each note's start and each beat, in order. */
function momentsOf(measure: MappedMeasure): number[] {
  const end = Math.max(measure.length, measure.expectedLength ?? 0);
  const moments = measure.notes.filter((note) => !note.chord).map((note) => note.onset);
  const beat = beatOf(measure);
  if (beat) for (let onset = 0; onset < end - EPSILON; onset += beat) moments.push(onset);
  moments.push(0);
  const sorted = moments.filter((onset) => onset < end - EPSILON || onset === 0).sort((a, b) => a - b);
  return sorted.filter((onset, index) => index === 0 || onset - sorted[index - 1]! > EPSILON);
}

/**
 * Where chord-symbol entry goes next (MuseScore's Space): the next note's start or the next beat, whichever
 * comes first, into the next measure at the end of one; null at the end of the part.
 */
export function nextChordSymbolPosition(map: ScoreMap, position: ScorePosition): ScorePosition | null {
  for (let index = position.measure; index < map.measures.length; index += 1) {
    const after = index === position.measure ? position.onset + EPSILON : Number.NEGATIVE_INFINITY;
    const onset = momentsOf(map.measures[index]!).find((moment) => moment > after);
    if (onset !== undefined) return { measure: index, onset };
  }
  return null;
}

/** Where chord-symbol entry goes back to (MuseScore's Shift+Space): the note's start or beat before; null at the start. */
export function previousChordSymbolPosition(map: ScoreMap, position: ScorePosition): ScorePosition | null {
  for (let index = Math.min(position.measure, map.measures.length - 1); index >= 0; index -= 1) {
    const before = index === position.measure ? position.onset - EPSILON : Number.POSITIVE_INFINITY;
    const onset = momentsOf(map.measures[index]!)
      .reverse()
      .find((moment) => moment < before);
    if (onset !== undefined) return { measure: index, onset };
  }
  return null;
}
