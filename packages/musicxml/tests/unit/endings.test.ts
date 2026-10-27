import { describe, expect, it } from "vitest";

import { endingsOf, mapScore, readScore, removeEnding, scoreText, setEnding, setRepeatEnd } from "../../src";
import { meaningOf, nth, refusal, replaceOnce, twoParts } from "../editing";
import { fixtureText, score } from "../fixtures";

const rest = `<note><rest/><duration>4</duration><voice>1</voice></note>`;
const summary = (document: ReturnType<typeof readScore>) =>
  endingsOf(mapScore(document.root)!).map(
    (ending) => `${ending.from}-${ending.to} "${ending.number}" "${ending.text}"${ending.open ? " open" : ""}`,
  );

describe("endingsOf", () => {
  it("reads MuseScore's endings, closed and open", () => {
    const document = readScore(fixtureText("musescore/repeats-and-endings.musicxml"));
    expect(summary(document)).toEqual([`2-3 "1" "1"`, `4-4 "2" "2" open`, `6-6 "1, 2" "1, 2"`, `7-7 "3" "3"`]);
  });

  it("reads an ending the file never stops as running to the next one or the end", () => {
    const start = (number: string) => `<barline location="left"><ending number="${number}" type="start"/></barline>`;
    const document = readScore(score(start("1") + rest, rest, start("2") + rest, rest));
    expect(summary(document)).toEqual([`0-1 "1" "" open`, `2-3 "2" "" open`]);
    expect(endingsOf(mapScore(document.root)!)[0]!.stop).toBeNull();
  });
});

describe("setEnding", () => {
  it("writes an ending's start and stop in the barlines of its first and last measures", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    const ending = setEnding(document, 1, 2, { numbers: [1] });
    expect(ending).toMatchObject({ from: 1, to: 2, number: "1", text: "1.", open: false });
    expect(document.revision).toBe(1);
    expect(scoreText(document)).toBe(
      replaceOnce(
        replaceOnce(
          text,
          `<measure number="2" width="219.49">
      <harmony`,
          `<measure number="2" width="219.49">
      <barline location="left">
        <ending number="1" type="start">1.</ending>
      </barline>
      <harmony`,
        ),
        `<text>the</text>
          </lyric>
        </note>
      </measure>`,
        `<text>the</text>
          </lyric>
        </note>
      <barline location="right">
        <ending number="1" type="stop"/>
      </barline>
      </measure>`,
      ),
    );
  });

  it("writes MuseScore's endings, beside a repeat and open", () => {
    const fixture = readScore(fixtureText("musescore/repeats-and-endings.musicxml"));
    const document = readScore(score(rest, rest, rest, rest));
    setRepeatEnd(document, 1);
    setEnding(document, 0, 1, { numbers: [1], text: "1" });
    setEnding(document, 2, 2, { numbers: [2], text: "2", open: true });
    setEnding(document, 3, 3, { numbers: [1, 2] });
    const barlines = Array.from(document.root.getElementsByTagName("barline")).map(meaningOf);
    expect(barlines.slice(0, 4)).toEqual([2, 3, 4, 5].map((index) => meaningOf(nth(fixture, "barline", index))));
    expect(barlines[4]).toBe(`<barline location="left"><ending number="1, 2" type="start">1, 2.</ending></barline>`);
  });

  it("refuses overlapping endings, measures out of order or not there, and numbers below one", () => {
    const document = readScore(fixtureText("musescore/repeats-and-endings.musicxml"));
    expect(refusal(document, () => setEnding(document, 3, 4, { numbers: [3] }))).toBe("ending_overlaps");
    expect(refusal(document, () => setEnding(document, 0, 2, { numbers: [3] }))).toBe("ending_overlaps");
    expect(refusal(document, () => setEnding(document, 1, 0, { numbers: [1] }))).toBe("invalid_ending");
    expect(refusal(document, () => setEnding(document, 0, 0, { numbers: [] }))).toBe("invalid_ending");
    expect(refusal(document, () => setEnding(document, 0, 0, { numbers: [0] }))).toBe("invalid_ending");
    expect(refusal(document, () => setEnding(document, 0, 10, { numbers: [1] }))).toBe("not_in_score");
    const parts = twoParts();
    expect(refusal(parts, () => setEnding(parts, 0, 0, { numbers: [1] }))).toBe("not_editable");
  });
});

describe("removeEnding", () => {
  it("removes an ending's start and stop, and the barlines left empty", () => {
    const text = fixtureText("musescore/repeats-and-endings.musicxml");
    const document = readScore(text);
    removeEnding(document, 3);
    expect(scoreText(document)).toBe(
      replaceOnce(
        replaceOnce(
          text,
          `
      <barline location="left">
        <ending number="1" type="start" default-y="32.95">1</ending>
        </barline>`,
          "",
        ),
        `
        <ending number="1" type="stop"/>`,
        "",
      ),
    );
    removeEnding(document, 4);
    expect(summary(document)).toEqual([`6-6 "1, 2" "1, 2"`, `7-7 "3" "3"`]);
    expect(refusal(document, () => removeEnding(document, 4))).toBe("no_ending");
    expect(refusal(document, () => removeEnding(document, 12))).toBe("not_in_score");
  });

  it("removes an ending the file never stops", () => {
    const document = readScore(
      score(`<barline location="left"><ending number="1" type="start"/></barline>${rest}`, rest),
    );
    removeEnding(document, 1);
    expect(scoreText(document)).toBe(score(rest, rest));
  });
});
