import { mapScore, readScore, scoreText } from "@donizetti/musicxml";
import { describe, expect, it } from "vitest";

import { ScoreHistory } from "../../src/editing/history";
import {
  lengthInWholeNotes,
  measureSelection,
  selectedNote,
  selectionOf,
  stepSelection,
} from "../../src/editing/selection";
import { describeSelection, pitchName } from "../../src/editor/describe";
import { createTranslate } from "../../src/strings/translate";

const note = (step: string, type = "quarter", extra = "") =>
  `<note><pitch><step>${step}</step>${extra}<octave>4</octave></pitch><duration>1</duration><type>${type}</type></note>`;
const SCORE = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>${note("C")}${note("E", "quarter", "<alter>1</alter>")}<note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration></note></measure><measure number="2">${note("D")}<note><rest/><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>`;

describe("the selection", () => {
  const map = mapScore(readScore(SCORE).root)!;

  it("steps through notes and rests across measures, skipping chord notes", () => {
    let selection = selectionOf(map, map.measures[0]!.notes[0]!.element);
    selection = stepSelection(map, selection, 1);
    expect(selectedNote(map, selection)!.pitch!.step).toBe("E");
    selection = stepSelection(map, selection, 1);
    expect(selectedNote(map, selection)!.pitch!.step).toBe("D");
    selection = stepSelection(map, stepSelection(map, selection, 1), 1);
    expect(selectedNote(map, selection)!.rest).toBe(true);
    expect(selectedNote(map, stepSelection(map, null, -1))!.rest).toBe(true);
  });

  it("moves a note-input cursor by onsets, and by measures", () => {
    const cursor = stepSelection(map, { kind: "cursor", measure: 0, onset: 0 }, 1);
    expect(cursor).toEqual({ kind: "cursor", measure: 0, onset: 0.25 });
    expect(measureSelection(map, cursor, 1)).toEqual({ kind: "cursor", measure: 1, onset: 0 });
    expect(selectedNote(map, measureSelection(map, null, 9))!.pitch!.step).toBe("D");
    expect(selectedNote(map, { kind: "cursor", measure: 5, onset: 0 })).toBeNull();
  });

  it("measures lengths with their dots", () => {
    expect(lengthInWholeNotes({ type: "quarter", dots: 0 })).toBe(0.25);
    expect(lengthInWholeNotes({ type: "half", dots: 1 })).toBe(0.75);
    expect(lengthInWholeNotes({ type: "eighth", dots: 2 })).toBe(0.21875);
  });

  it("says what is selected", () => {
    const t = createTranslate();
    expect(describeSelection(t, map, null)).toBe("Nothing selected");
    expect(describeSelection(t, map, { kind: "note", measure: 0, index: 1 })).toBe("E♯4, quarter note, measure 1");
    expect(describeSelection(t, map, { kind: "note", measure: 1, index: 1 })).toBe("Rest, quarter note, measure 2");
    expect(describeSelection(t, map, { kind: "cursor", measure: 0, onset: 0.25 })).toBe(
      "Note input at measure 1, beat 2",
    );
    expect(pitchName({ step: "B", alter: -1, octave: 3 })).toBe("B♭3");
  });
});

describe("undo and redo", () => {
  it("keeps the text before each change, and puts it back", () => {
    const history = new ScoreHistory(readScore(SCORE));
    const before = scoreText(history.document);
    history.change((document) => {
      document.root.getElementsByTagName("step")[0]!.textContent = "B";
    });
    const after = scoreText(history.document);
    expect(history.canUndo).toBe(true);
    expect(history.undo()).toBe(true);
    expect(scoreText(history.document)).toBe(before);
    expect(history.redo()).toBe(true);
    expect(scoreText(history.document)).toBe(after);
    expect(history.redo()).toBe(false);
    history.undo();
    expect(history.undo()).toBe(false);
  });

  it("puts the score back when a change fails, leaving nothing to undo", () => {
    const history = new ScoreHistory(readScore(SCORE));
    const before = scoreText(history.document);
    expect(() =>
      history.change((document) => {
        document.root.getElementsByTagName("step")[0]!.textContent = "B";
        throw new Error("refused");
      }),
    ).toThrow("refused");
    expect(scoreText(history.document)).toBe(before);
    expect(history.canUndo).toBe(false);
  });
});

describe("messages", () => {
  it("fills placeholders, picks plurals and takes the host's overrides", () => {
    const t = createTranslate({ strings: { "toolbar.play": "Spielen" } });
    expect(t("toolbar.play")).toBe("Spielen");
    expect(t("readOnly.several_parts", { parts: 1 })).toBe("It has 1 part.");
    expect(t("readOnly.several_parts", { parts: 3 })).toBe("It has 3 parts.");
    expect(t("score.label", {})).toBe("Score: {name}");
    const hosted = createTranslate({ t: (key) => (key === "toolbar.stop" ? "Ferma" : key) });
    expect(hosted("toolbar.stop")).toBe("Ferma");
    expect(hosted("toolbar.save")).toBe("Save");
  });
});
