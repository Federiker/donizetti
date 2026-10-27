import {
  appendMeasures,
  barlinesOf,
  insertMeasures,
  type NavigationMark,
  removeMeasures,
  removeRepeatEnd,
  removeRepeatStart,
  type ScoreMap,
  type ScorePosition,
  setBarStyle,
  setEnding,
  setKey,
  setNavigationMark,
  setRepeatEnd,
  setRepeatStart,
  setTempo,
  setTime,
} from "@donizetti/musicxml";

import type { Jump, PaletteAction } from "../palette/Palette";
import type { ScoreHistory } from "./history";

const JUMPS: Record<Jump, NavigationMark> = {
  segno: "segno",
  coda: "coda",
  toCoda: "to-coda",
  fine: "fine",
  daCapo: "da-capo",
  daCapoAlFine: "da-capo-al-fine",
  dalSegno: "dal-segno",
  dalSegnoAlCoda: "dal-segno-al-coda",
};

/** The ending numbers typed ("1", "1, 2", "1-3"), or null when they are not numbers. */
export function endingNumbers(text: string): number[] | null {
  const numbers: number[] = [];
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
    if (range) {
      for (let number = Number(range[1]); number <= Number(range[2]); number += 1) numbers.push(number);
    } else if (/^\d+$/.test(part)) numbers.push(Number(part));
    else return null;
  }
  return numbers.length > 0 ? numbers : null;
}

/**
 * Applies what was chosen in the palette (decision 17) to the selection's measure (and, for a tempo, its
 * moment), as one undoable change. Throws a `ScoreEditError` the score cannot take, or a `RangeError` for
 * ending numbers that are not numbers.
 */
export function applyPalette(history: ScoreHistory, map: ScoreMap, at: ScorePosition, action: PaletteAction) {
  const measure = at.measure;
  history.change((document) => {
    switch (action.kind) {
      case "key":
        setKey(document, measure, action.fifths);
        break;
      case "time":
        setTime(document, measure, action.beats, action.beatType);
        break;
      case "tempo":
        setTempo(document, at, { beatUnit: "quarter", dots: 0, perMinute: action.perMinute });
        break;
      case "barline": {
        const element = map.measures[measure]?.element;
        const barlines = element ? barlinesOf(element) : null;
        if (action.barline === "startRepeat") setRepeatStart(document, measure);
        else if (action.barline === "endRepeat") setRepeatEnd(document, measure);
        else if (action.barline === "normal") {
          if (barlines?.startRepeat) removeRepeatStart(document, measure);
          if (barlines?.endRepeat) removeRepeatEnd(document, measure);
          setBarStyle(document, measure, "regular");
        } else setBarStyle(document, measure, action.barline);
        break;
      }
      case "ending": {
        const numbers = endingNumbers(action.numbers);
        if (!numbers) throw new RangeError("ending numbers");
        setEnding(document, measure, measure, { numbers });
        break;
      }
      case "jump":
        setNavigationMark(document, measure, JUMPS[action.jump]);
        break;
      case "measures":
        if (action.change === "insert") insertMeasures(document, measure, 1);
        else if (action.change === "append") appendMeasures(document, 1);
        else removeMeasures(document, measure, 1);
        break;
    }
  });
}
