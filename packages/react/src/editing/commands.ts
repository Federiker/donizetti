import type { ScoreMap } from "@donizetti/musicxml";

import type { ShortcutAction } from "../keyboard/shortcuts";
import type { ScoreHistory } from "./history";
import type { InputLength, Selection } from "./selection";

/** What an edit needs: the history to change the score through, the map, the selection, the input length. */
export type EditContext = {
  history: ScoreHistory;
  map: ScoreMap;
  selection: Selection;
  length: InputLength;
  noteInput: boolean;
};

/** What an edit leaves: the new selection, and a MIDI key to sound (the note entered). */
export type EditResult = { selection: Selection; sound?: number };

/**
 * Runs an editing action on the score through the history (so it can be undone), or returns null when the
 * action does nothing here. Throws when the score cannot take the change; the history has then put it back.
 */
export function runEdit(_action: ShortcutAction, _context: EditContext): EditResult | null {
  return null;
}
