import { EPSILON, type ScoreMap } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { childElement, childElements, childNumber, childText } from "../xml";
import {
  anchorAt,
  divisionsText,
  editableMap,
  elementsBefore,
  insertInMeasure,
  offsetOf,
  type ScorePosition,
} from "./edit-context";
import { ScoreEditError } from "./edit-error";
import { createElement, edit, insertElement, insertInOrder, removeElement } from "./xml-edit";

/** A note value a metronome mark counts in (MusicXML's `<beat-unit>`). */
export type BeatUnit = "breve" | "whole" | "half" | "quarter" | "eighth" | "16th" | "32nd";

/** A metronome mark: so many beats of this unit (with its dots) a minute, with words such as "Allegro". */
export type Tempo = { beatUnit: BeatUnit; dots: number; perMinute: number; words?: string };

const BEAT_UNITS: Record<BeatUnit, number> = {
  breve: 2,
  whole: 1,
  half: 1 / 2,
  quarter: 1 / 4,
  eighth: 1 / 8,
  "16th": 1 / 16,
  "32nd": 1 / 32,
};

/** The tempo in quarter notes a minute, as `<sound tempo>` gives it: ♩. = 80 is 120. */
export function quarterNotesPerMinute(tempo: Pick<Tempo, "beatUnit" | "dots" | "perMinute">): number {
  const length = BEAT_UNITS[tempo.beatUnit] * (2 - 0.5 ** tempo.dots);
  return Math.round(tempo.perMinute * length * 4 * 100) / 100;
}

const isTempo = (direction: Element) =>
  direction.getElementsByTagName("metronome").length > 0 ||
  childElements(direction, "sound").some((sound) => sound.hasAttribute("tempo"));

/** The direction carrying the metronome mark at this moment, and where a new one goes. */
function tempoPlace(map: ScoreMap, position: ScorePosition) {
  const { measure, anchor, offset } = anchorAt(map, position);
  const run = anchor ? elementsBefore(anchor) : Array.from(measure.element.children);
  const existing =
    run.find(
      (element) =>
        element.localName === "direction" &&
        isTempo(element) &&
        Math.abs(offsetOf(element, measure.divisions) - offset) < EPSILON,
    ) ?? null;
  return { measure, anchor, offset, existing };
}

/** Reads a direction's metronome mark (the first), or null when it has none MusicXML counts in beats. */
export function readTempo(direction: Element): Tempo | null {
  const metronome = direction.getElementsByTagName("metronome")[0];
  if (!metronome) return null;
  const beatUnit = childText(metronome, "beat-unit") as BeatUnit | null;
  const perMinute = childNumber(metronome, "per-minute");
  if (!beatUnit || !(beatUnit in BEAT_UNITS) || perMinute === null) return null;
  const words = Array.from(direction.getElementsByTagName("words"))
    .map((element) => (element.textContent ?? "").trim())
    .filter((text) => text !== "");
  return {
    beatUnit,
    dots: childElements(metronome, "beat-unit-dot").length,
    perMinute,
    ...(words.length > 0 ? { words: words.join(" ") } : {}),
  };
}

/** The `<direction>` with the metronome mark at a moment, or null. */
export function tempoAt(map: ScoreMap, position: ScorePosition): Element | null {
  return tempoPlace(map, position).existing;
}

function validate(tempo: Tempo) {
  if (!(tempo.beatUnit in BEAT_UNITS)) throw new ScoreEditError("invalid_tempo", { reason: "beat_unit" });
  if (!Number.isInteger(tempo.dots) || tempo.dots < 0 || tempo.dots > 2) {
    throw new ScoreEditError("invalid_tempo", { reason: "dots" });
  }
  if (!Number.isFinite(tempo.perMinute) || tempo.perMinute <= 0) {
    throw new ScoreEditError("invalid_tempo", { reason: "per_minute" });
  }
}

/** A `<metronome>`'s children for a tempo: its beat unit, dots and beats a minute. */
function metronomeChildren(xml: XMLDocument, tempo: Tempo): Element[] {
  return [
    createElement(xml, "beat-unit", tempo.beatUnit),
    ...Array.from({ length: tempo.dots }, () => createElement(xml, "beat-unit-dot")),
    createElement(xml, "per-minute", String(tempo.perMinute)),
  ];
}

/** Rewrites an existing tempo direction's mark, words and `<sound tempo>`, keeping everything else in it. */
function rewriteTempo(xml: XMLDocument, direction: Element, tempo: Tempo) {
  const metronome = direction.getElementsByTagName("metronome")[0];
  if (metronome) {
    const old = Array.from(metronome.children).filter((child) =>
      ["beat-unit", "beat-unit-dot", "per-minute"].includes(child.localName),
    );
    const before = old.at(-1)?.nextElementSibling ?? null;
    for (const child of metronomeChildren(xml, tempo)) insertElement(metronome, child, before);
    for (const child of old) removeElement(child);
  } else {
    const types = childElements(direction, "direction-type");
    const type = createElement(xml, "direction-type", [
      createElement(xml, "metronome", metronomeChildren(xml, tempo), { parentheses: "no" }),
    ]);
    insertElement(direction, type, types.at(-1)?.nextElementSibling ?? null);
  }
  if (tempo.words !== undefined) {
    const words = direction.getElementsByTagName("words")[0];
    if (words && tempo.words === "")
      removeElement(words.parentElement!.children.length === 1 ? words.parentElement! : words);
    else if (words) words.textContent = tempo.words;
    else if (tempo.words !== "") {
      const type = createElement(xml, "direction-type", [createElement(xml, "words", tempo.words)]);
      insertElement(direction, type, childElement(direction, "direction-type"));
    }
  }
  const sound = childElement(direction, "sound");
  const value = String(quarterNotesPerMinute(tempo));
  if (sound) {
    if (sound.getAttribute("tempo") !== value) sound.setAttribute("tempo", value);
  } else insertInOrder(direction, createElement(xml, "sound", undefined, { tempo: value }), "direction");
}

/**
 * Writes a metronome mark at a moment (a measure's start by default), above the staff as MuseScore 4 writes it:
 * a `<direction>` with the words, if any, the `<metronome>` and `<sound tempo>` in quarter notes a minute.
 * One there already is rewritten, keeping its attributes and anything else in it; its words stay unless
 * `words` is given ("" removes them). Returns the `<direction>`.
 */
export function setTempo(
  document: ScoreDocument,
  at: ScorePosition | { measure: number; onset?: number },
  tempo: Tempo,
): Element {
  validate(tempo);
  const map = editableMap(document);
  const place = tempoPlace(map, { measure: at.measure, onset: at.onset ?? 0 });
  return edit(document, (xml) => {
    if (place.existing) {
      rewriteTempo(xml, place.existing, tempo);
      return place.existing;
    }
    const types = [
      ...(tempo.words ? [createElement(xml, "direction-type", [createElement(xml, "words", tempo.words)])] : []),
      createElement(xml, "direction-type", [
        createElement(xml, "metronome", metronomeChildren(xml, tempo), { parentheses: "no" }),
      ]),
    ];
    const offset =
      place.offset > 0 ? [createElement(xml, "offset", divisionsText(place.offset, place.measure.divisions))] : [];
    const direction = createElement(
      xml,
      "direction",
      [...types, ...offset, createElement(xml, "sound", undefined, { tempo: String(quarterNotesPerMinute(tempo)) })],
      { placement: "above", system: "only-top" },
    );
    return insertInMeasure(place.measure.element, direction, place.anchor);
  });
}

/**
 * Removes the metronome mark at a moment (a measure's start by default): the whole direction when it holds
 * nothing else, otherwise only the mark, its words and its `<sound tempo>`. `no_tempo` when there is none.
 */
export function removeTempo(document: ScoreDocument, at: ScorePosition | { measure: number; onset?: number }) {
  const map = editableMap(document);
  const { existing } = tempoPlace(map, { measure: at.measure, onset: at.onset ?? 0 });
  if (!existing) throw new ScoreEditError("no_tempo");
  edit(document, () => {
    const types = childElements(existing, "direction-type");
    const tempoTypes = types.filter((type) =>
      Array.from(type.children).every((child) => ["metronome", "words"].includes(child.localName)),
    );
    const sound = childElement(existing, "sound");
    const soundOnlyTempo = !sound || (sound.attributes.length === 1 && sound.children.length === 0);
    if (tempoTypes.length === types.length && soundOnlyTempo) {
      removeElement(existing);
      return;
    }
    for (const type of tempoTypes) removeElement(type);
    if (sound && soundOnlyTempo) removeElement(sound);
    else sound?.removeAttribute("tempo");
  });
}
