import { describe, expect, it } from "vitest";

import { editabilityOf, mapScore, readScore } from "../../src";
import { newScore } from "../../src/new-score";

describe("newScore", () => {
  it("writes an editable lead sheet with the defaults: C major, 4/4, 120, 16 measures", () => {
    const score = readScore(newScore());
    expect(editabilityOf(score.root)).toEqual({ editable: true });
    const map = mapScore(score.root)!;
    expect(map.measures).toHaveLength(16);
    expect(map.measures.every((measure) => measure.length === 1 && measure.notes[0]!.rest)).toBe(true);
    expect(map.measures[0]!.time).toEqual({ beats: 4, beatType: 4 });
    expect(score.root.getElementsByTagName("part-name")[0]!.textContent).toBe("Melody");
    expect(score.root.getElementsByTagName("midi-program")[0]!.textContent).toBe("1");
    expect(score.root.getElementsByTagName("sound")[0]!.getAttribute("tempo")).toBe("120");
    expect(score.root.getElementsByTagName("work")).toHaveLength(0);
    const last = score.root.getElementsByTagName("measure")[15]!;
    expect(last.getElementsByTagName("bar-style")[0]!.textContent).toBe("light-heavy");
  });

  it("writes the title, composer, key, time, tempo, pickup and measures asked for", () => {
    const score = readScore(
      newScore({
        title: "Rock & Roll",
        composer: "A. Nonymous",
        fifths: -3,
        beats: 6,
        beatType: 8,
        pickup: true,
        tempo: 90,
        measures: 4,
      }),
    );
    const map = mapScore(score.root)!;
    expect(score.root.getElementsByTagName("work-title")[0]!.textContent).toBe("Rock & Roll");
    expect(score.root.getElementsByTagName("creator")[0]!.textContent).toBe("A. Nonymous");
    expect(map.measures).toHaveLength(5);
    expect(map.measures[0]!).toMatchObject({ implicit: true, number: "0", length: 1 / 8, fifths: -3 });
    expect(map.measures[1]!).toMatchObject({ number: "1", length: 6 / 8, expectedLength: 6 / 8 });
    expect(score.root.getElementsByTagName("per-minute")[0]!.textContent).toBe("90");
  });

  it("refuses what a score cannot be made with", () => {
    expect(() => newScore({ fifths: 8 })).toThrow(RangeError);
    expect(() => newScore({ beatType: 3 })).toThrow(RangeError);
    expect(() => newScore({ measures: 0 })).toThrow(RangeError);
    expect(() => newScore({ beats: 0 })).toThrow(RangeError);
    expect(() => newScore({ tempo: 0 })).toThrow(RangeError);
  });
});
