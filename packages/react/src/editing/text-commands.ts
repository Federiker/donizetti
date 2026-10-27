import {
  chordSymbolAt,
  harmonyText,
  lyricOf,
  mapScore,
  nextChordSymbolPosition,
  nextLyricNote,
  previousChordSymbolPosition,
  previousLyricNote,
  removeChordSymbol,
  removeLyric,
  type ScoreMap,
  type ScorePosition,
  setChordSymbol,
  setLyric,
} from "@donizetti/musicxml";

import type { TextEntryMove } from "../text-entry/TextEntry";
import type { ScoreHistory } from "./history";

/**
 * Text being typed into the score (decision 16): a lyric on a note (its measure and index among the measure's
 * notes, and the verse), or a chord symbol at a moment.
 */
export type TextEntryState =
  | { kind: "lyrics"; measure: number; index: number; verse: number }
  | { kind: "chord"; position: ScorePosition };

/** The note the field stands by: the lyric's note, or the note sounding at the chord symbol's moment. */
export function entryNote(map: ScoreMap, entry: TextEntryState): Element | null {
  if (entry.kind === "lyrics") return map.measures[entry.measure]?.notes[entry.index]?.element ?? null;
  const notes = map.measures[entry.position.measure]?.notes.filter((note) => !note.chord && !note.grace) ?? [];
  return notes.filter((note) => note.onset <= entry.position.onset + 1e-9).at(-1)?.element ?? notes[0]?.element ?? null;
}

/** The text already there, to edit: the note's syllable in that verse, or the chord symbol's text. */
export function entryText(map: ScoreMap, entry: TextEntryState): string {
  if (entry.kind === "lyrics") {
    const note = entryNote(map, entry);
    return note ? (lyricOf(note, String(entry.verse))?.text ?? "") : "";
  }
  const harmony = chordSymbolAt(map, entry.position);
  return harmony ? harmonyText(harmony) : "";
}

function lyricEntryAt(map: ScoreMap, element: Element | null, verse: number): TextEntryState | null {
  if (!element) return null;
  for (const measure of map.measures) {
    const index = measure.notes.findIndex((note) => note.element === element);
    if (index >= 0) return { kind: "lyrics", measure: measure.index, index, verse };
  }
  return null;
}

/**
 * Writes what was typed and says where the field goes next (null: it closes). An empty field removes the
 * syllable or chord symbol that was there. Each written syllable or symbol is its own undoable change.
 */
export function commitText(
  history: ScoreHistory,
  map: ScoreMap,
  entry: TextEntryState,
  text: string,
  move: TextEntryMove,
): { next: TextEntryState | null; changed: boolean } {
  let changed = false;
  if (entry.kind === "lyrics") {
    const note = entryNote(map, entry);
    if (!note) return { next: null, changed };
    const verse = String(entry.verse);
    const existing = lyricOf(note, verse);
    if (text !== "" && (text !== existing?.text || move === "hyphen" || move === "extend")) {
      history.change((document) =>
        setLyric(document, note, {
          verse,
          text,
          hyphen: move === "hyphen" ? true : move === "next" ? false : undefined,
          extend: move === "extend" ? true : undefined,
        }),
      );
      changed = true;
    } else if (text === "" && existing && move !== "previous") {
      history.change((document) => removeLyric(document, note, verse));
      changed = true;
    }
    const now = changed ? mapScore(history.document.root)! : map;
    const same = entryNote(now, entry);
    if (!same) return { next: null, changed };
    switch (move) {
      case "next":
      case "hyphen":
      case "extend":
        return { next: lyricEntryAt(now, nextLyricNote(now, same)?.element ?? null, entry.verse), changed };
      case "previous":
        return { next: lyricEntryAt(now, previousLyricNote(now, same)?.element ?? null, entry.verse), changed };
      case "verse":
        return { next: { ...entry, verse: entry.verse + 1 }, changed };
      default:
        return { next: null, changed };
    }
  }
  const existing = chordSymbolAt(map, entry.position);
  if (text !== "" && (!existing || text !== harmonyText(existing))) {
    history.change((document) => setChordSymbol(document, entry.position, text));
    changed = true;
  } else if (text === "" && existing && move !== "previous") {
    history.change((document) => removeChordSymbol(document, entry.position));
    changed = true;
  }
  const now = changed ? mapScore(history.document.root)! : map;
  const step =
    move === "next" || move === "hyphen" || move === "extend"
      ? nextChordSymbolPosition(now, entry.position)
      : move === "previous"
        ? previousChordSymbolPosition(now, entry.position)
        : null;
  return { next: step ? { kind: "chord", position: step } : null, changed };
}
