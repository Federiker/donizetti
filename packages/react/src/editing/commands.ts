import {
  addChordNote,
  addTiedNote,
  mapScore,
  midiOf,
  type NoteEdit,
  type Pitch,
  pitchAbove,
  pitchForStep,
  type ScoreDocument,
  type ScoreMap,
  setLength,
  setPitch,
  type Step,
  toggleTie,
  toRest,
  transpose,
  writeNote,
} from "@donizetti/musicxml";

import type { ShortcutAction } from "../keyboard/shortcuts";
import type { ScoreHistory } from "./history";
import { type InputLength, type Selection, selectedNote, selectionOf } from "./selection";

/** What an edit needs: the history to change the score through, the map, the selection, the input length. */
export type EditContext = {
  history: ScoreHistory;
  map: ScoreMap;
  selection: Selection;
  length: InputLength;
  noteInput: boolean;
};

/** What an edit leaves: the new selection, and a MIDI key to sound (the note entered or changed). */
export type EditResult = { selection: Selection; sound?: number };

const SEMITONES: Partial<Record<ShortcutAction, number>> = { up: 1, down: -1, octaveUp: 12, octaveDown: -12 };

/** The `<note>` an edit applies to: the selected note, or in note input the note entered last. */
function targetOf(context: EditContext): Element | null {
  const { map, selection } = context;
  if (selection?.kind === "cursor") {
    const last = selection.last ? map.measures[selection.last.measure]?.notes[selection.last.index] : undefined;
    return last?.element ?? null;
  }
  return selectedNote(map, selection)?.element ?? null;
}

function pitchOf(element: Element, map: ScoreMap): Pitch | null {
  for (const measure of map.measures) for (const note of measure.notes) if (note.element === element) return note.pitch;
  return null;
}

/** The selection after an edit: the note selected again in the new map, or the cursor moved on. */
function after(document: ScoreDocument, element: Element | null, cursor?: NoteEdit): EditResult {
  const map = mapScore(document.root);
  if (!map) return { selection: null };
  const pitch = element ? pitchOf(element, map) : null;
  const sound = pitch ? midiOf(pitch) : undefined;
  if (cursor) {
    const last = element ? selectionOf(map, element) : null;
    return {
      selection: {
        kind: "cursor",
        measure: cursor.next.measure,
        onset: cursor.next.onset,
        last: last?.kind === "note" ? { measure: last.measure, index: last.index } : undefined,
      },
      sound,
    };
  }
  return { selection: element ? selectionOf(map, element) : null, sound };
}

/** The cursor's selection with the same last note, for edits that change that note but not where entry goes. */
function keepCursor(context: EditContext, document: ScoreDocument, element: Element): EditResult {
  const result = after(document, element);
  if (context.selection?.kind !== "cursor" || result.selection?.kind !== "note") return result;
  const { measure, index } = result.selection;
  return { ...result, selection: { ...context.selection, last: { measure, index } } };
}

/**
 * Runs an editing action on the score through the history (so it can be undone), or returns null when the
 * action does nothing here. In note input (MuseScore's N) A–G and 0 write at the cursor and move it on, and the
 * other keys change the note entered last; otherwise they change the selected note. Throws a `ScoreEditError`
 * when the score cannot take the change; the history has then put it back.
 */
export function runEdit(action: ShortcutAction, context: EditContext): EditResult | null {
  const { history, selection, length, noteInput } = context;
  const cursor =
    noteInput && selection?.kind === "cursor" ? { measure: selection.measure, onset: selection.onset } : null;

  if (cursor && (action.startsWith("pitch.") || action === "rest")) {
    return history.change((document) => {
      const pitch = action === "rest" ? null : pitchForStep(document, cursor, action.slice(6) as Step);
      const written = writeNote(document, cursor, { pitch, length });
      return after(document, written.notes[0] ?? null, written);
    });
  }

  const target = targetOf(context);
  if (!target) return null;

  const semitones = SEMITONES[action];
  if (semitones !== undefined) {
    return history.change((document) => keepCursor(context, document, transpose(document, target, semitones)));
  }
  if (action.startsWith("chord.") || action.startsWith("interval.")) {
    return history.change((document) => {
      const base = pitchOf(target, mapScore(document.root)!);
      if (!base) return null;
      const pitch = action.startsWith("chord.")
        ? pitchForStep(document, positionOf(context, target), action.slice(6) as Step, { above: base })
        : pitchAbove(document, target, Number(action.slice(9)));
      return keepCursor(context, document, addChordNote(document, target, pitch));
    });
  }
  if (action.startsWith("pitch.") && !noteInput) {
    return history.change((document) =>
      after(
        document,
        setPitch(document, target, pitchForStep(document, positionOf(context, target), action.slice(6) as Step)),
      ),
    );
  }
  switch (action) {
    case "delete":
    case "rest":
      return history.change((document) => keepCursor(context, document, toRest(document, target)));
    case "tie":
      if (cursor) {
        return history.change((document) => {
          const written = addTiedNote(document, target, length);
          return after(document, written.notes.at(-1) ?? null, written);
        });
      }
      return history.change((document) => after(document, toggleTie(document, target) ?? target));
    default:
      break;
  }
  if (action.startsWith("length.") && !noteInput) {
    return history.change((document) => after(document, setLength(document, target, length).notes[0] ?? target));
  }
  return null;
}

/** Where a note starts, for the pitch a letter gives there. */
function positionOf(context: EditContext, element: Element) {
  for (const measure of context.map.measures) {
    const note = measure.notes.find((candidate) => candidate.element === element);
    if (note) return { measure: note.measure, onset: note.onset };
  }
  return { measure: 0, onset: 0 };
}
