import { describe, expect, it } from "vitest";

import {
  barlinesOf,
  readScore,
  removeRepeatEnd,
  removeRepeatStart,
  scoreText,
  setBarStyle,
  setRepeatEnd,
  setRepeatStart,
} from "../../src";
import { meaningOf, nth, refusal, replaceOnce, twoParts } from "../editing";
import { fixtureText, score } from "../fixtures";

const rest = `<note><rest/><duration>4</duration><voice>1</voice></note>`;

describe("reading barlines", () => {
  it("reads MuseScore's repeats, double and final barlines", () => {
    const document = readScore(fixtureText("musescore/repeats-and-endings.musicxml"));
    const measures = Array.from(document.root.getElementsByTagName("measure")).map(barlinesOf);
    expect(measures[0]).toEqual({ startRepeat: false, endRepeat: null, endStyle: "light-light" });
    expect(measures[1]).toEqual({ startRepeat: true, endRepeat: null, endStyle: null });
    expect(measures[3]).toEqual({ startRepeat: false, endRepeat: 2, endStyle: "light-heavy" });
    expect(measures[6]!.endRepeat).toBe(3);
    expect(measures[8]).toEqual({ startRepeat: false, endRepeat: null, endStyle: null });
    expect(measures[9]!.endStyle).toBe("light-heavy");
    // A barline without a location is at the right; a regular style is no style.
    const plain = readScore(score(`${rest}<barline><bar-style>regular</bar-style></barline>`));
    expect(barlinesOf(nth(plain, "measure", 0))).toEqual({ startRepeat: false, endRepeat: null, endStyle: null });
  });
});

describe("repeats", () => {
  it("starts a repeat with a new left barline, laid out as the measure is", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    setRepeatStart(document, 2);
    expect(document.revision).toBe(1);
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `<measure number="3" width="244.96">
      <note`,
        `<measure number="3" width="244.96">
      <barline location="left">
        <bar-style>heavy-light</bar-style>
        <repeat direction="forward"/>
      </barline>
      <note`,
      ),
    );
    // A start repeat already there stays as it is.
    const again = scoreText(document);
    setRepeatStart(document, 0);
    expect(scoreText(document)).toBe(again);
  });

  it("writes MuseScore's start and end repeats", () => {
    const fixture = readScore(fixtureText("musescore/repeats-and-endings.musicxml"));
    const document = readScore(score(rest, rest, rest, rest, rest, rest, rest));
    setRepeatStart(document, 1);
    setRepeatEnd(document, 6, 3);
    expect(meaningOf(nth(document, "barline", 0))).toBe(meaningOf(nth(fixture, "barline", 1)));
    expect(meaningOf(nth(document, "barline", 1))).toBe(
      meaningOf(nth(fixture, "barline", 8)).replace(`<ending number="1, 2" type="stop"/>`, ""),
    );
  });

  it("goes after <print> at the start of a measure, and keeps a left barline's other children", () => {
    const document = readScore(
      score(
        `<print new-system="yes"/><barline location="left"><ending number="2" type="start">2.</ending></barline>${rest}`,
        rest,
      ),
    );
    setRepeatStart(document, 0);
    setRepeatStart(document, 1);
    expect(scoreText(document)).toContain(
      `<barline location="left"><bar-style>heavy-light</bar-style><ending number="2" type="start">2.</ending><repeat direction="forward"/></barline>`,
    );
    expect(scoreText(document)).toContain(
      `<measure number="2"><barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>${rest}`,
    );
    removeRepeatStart(document, 0);
    expect(scoreText(document)).toContain(
      `<print new-system="yes"/><barline location="left"><ending number="2" type="start">2.</ending></barline>`,
    );
  });

  it("removes a start repeat with its barline", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    removeRepeatStart(document, 0);
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `
      <barline location="left">
        <bar-style>heavy-light</bar-style>
        <repeat direction="forward"/>
        </barline>`,
        "",
      ),
    );
    expect(refusal(document, () => removeRepeatStart(document, 0))).toBe("no_repeat");
  });

  it("ends a repeat at the end of the measure, and says how many times it plays", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    setRepeatEnd(document, 1);
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `          </lyric>
        </note>
      </measure>
    <measure number="3"`,
        `          </lyric>
        </note>
      <barline location="right">
        <bar-style>light-heavy</bar-style>
        <repeat direction="backward"/>
      </barline>
      </measure>
    <measure number="3"`,
      ),
    );
    setRepeatEnd(document, 3, 3);
    expect(scoreText(document)).toContain(`<repeat direction="backward" times="3"/>`);
    setRepeatEnd(document, 3);
    expect(scoreText(document)).toContain(`<repeat direction="backward" times="3"/>`);
    setRepeatEnd(document, 3, 2);
    expect(scoreText(document)).not.toContain(`times=`);
  });

  it("removes an end repeat, leaving a regular barline", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    removeRepeatEnd(document, 3);
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `
      <barline location="right">
        <bar-style>light-heavy</bar-style>
        <repeat direction="backward"/>
        </barline>`,
        "",
      ),
    );
    expect(refusal(document, () => removeRepeatEnd(document, 3))).toBe("no_repeat");
  });

  it("refuses repeats played fewer than twice, measures not there and other scores", () => {
    const document = readScore(score(rest));
    expect(refusal(document, () => setRepeatEnd(document, 0, 1))).toBe("invalid_count");
    expect(refusal(document, () => setRepeatEnd(document, 0, 2.5))).toBe("invalid_count");
    expect(refusal(document, () => setRepeatStart(document, 1))).toBe("not_in_score");
    const parts = twoParts();
    expect(refusal(parts, () => setRepeatStart(parts, 0))).toBe("not_editable");
  });
});

describe("setBarStyle", () => {
  it("writes a double barline at the end of a measure, laid out as the file is", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    setBarStyle(document, 2, "double");
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `          </lyric>
        </note>
      </measure>
    <measure number="4"`,
        `          </lyric>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
      </barline>
      </measure>
    <measure number="4"`,
      ),
    );
  });

  it("writes double and final barlines as MuseScore does, and regular ones as none", () => {
    const fixture = readScore(fixtureText("musescore/repeats-and-endings.musicxml"));
    const document = readScore(score(rest, rest));
    setBarStyle(document, 0, "double");
    expect(meaningOf(nth(document, "barline", 0))).toBe(meaningOf(nth(fixture, "barline", 0)));
    setBarStyle(document, 1, "final");
    expect(meaningOf(nth(document, "barline", 1))).toBe(meaningOf(nth(fixture, "barline", 11)));
    setBarStyle(document, 0, "final");
    expect(scoreText(document)).toContain(
      `${rest}<barline location="right"><bar-style>light-heavy</bar-style></barline></measure>`,
    );
    expect(setBarStyle(document, 0, "regular")).toBeNull();
    expect(setBarStyle(document, 0, "regular")).toBeNull();
    expect(scoreText(document)).toBe(
      score(rest, `${rest}<barline location="right"><bar-style>light-heavy</bar-style></barline>`),
    );
  });

  it("replaces an end repeat and keeps an ending's stop", () => {
    const document = readScore(
      score(
        `${rest}<barline location="right"><bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward"/></barline>`,
      ),
    );
    setBarStyle(document, 0, "double");
    expect(scoreText(document)).toContain(
      `<barline location="right"><bar-style>light-light</bar-style><ending number="1" type="stop"/></barline>`,
    );
    const barline = setBarStyle(document, 0, "regular");
    expect(scoreText(document)).toContain(`<barline location="right"><ending number="1" type="stop"/></barline>`);
    expect(barline).toBe(nth(document, "barline", 0));
  });
});
