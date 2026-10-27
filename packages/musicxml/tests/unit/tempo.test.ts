import { describe, expect, it } from "vitest";

import {
  mapScore,
  quarterNotesPerMinute,
  readScore,
  readTempo,
  removeTempo,
  scoreText,
  setTempo,
  tempoAt,
} from "../../src";
import { nth, refusal, replaceOnce, twoParts } from "../editing";
import { fixtureText, score } from "../fixtures";

const note = (step: string, duration = 1) =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice></note>`;
const ATTRIBUTES = `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`;

describe("quarterNotesPerMinute", () => {
  it("converts the beat unit to quarter notes, as <sound tempo> counts", () => {
    const tempo = (beatUnit: "half" | "quarter" | "eighth" | "16th", dots: number, perMinute: number) =>
      quarterNotesPerMinute({ beatUnit, dots, perMinute });
    expect(tempo("quarter", 0, 96)).toBe(96);
    expect(tempo("half", 0, 60)).toBe(120);
    expect(tempo("quarter", 1, 80)).toBe(120);
    expect(tempo("eighth", 0, 120)).toBe(60);
    expect(tempo("half", 1, 40)).toBe(120);
    expect(tempo("quarter", 2, 60)).toBe(105);
    expect(tempo("16th", 1, 90)).toBe(33.75);
  });
});

describe("reading tempos", () => {
  it("reads MuseScore's metronome marks, dotted or not, with their words", () => {
    const document = readScore(fixtureText("musescore/repeats-and-endings.musicxml"));
    const map = mapScore(document.root)!;
    expect(readTempo(tempoAt(map, { measure: 0, onset: 0 })!)).toEqual({ beatUnit: "half", dots: 0, perMinute: 60 });
    expect(readTempo(tempoAt(map, { measure: 1, onset: 0.5 })!)).toEqual({
      beatUnit: "quarter",
      dots: 1,
      perMinute: 80,
    });
    expect(tempoAt(map, { measure: 1, onset: 0 })).toBeNull();
    const worded = readScore(
      score(
        `${ATTRIBUTES}<direction><direction-type><words>Allegro</words></direction-type><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>132</per-minute></metronome></direction-type></direction>${note("C", 4)}`,
      ),
    );
    expect(readTempo(nth(worded, "direction", 0))).toEqual({
      beatUnit: "quarter",
      dots: 0,
      perMinute: 132,
      words: "Allegro",
    });
    const odd = readScore(
      score(
        `<direction><direction-type><metronome><beat-unit>long</beat-unit><per-minute>1</per-minute></metronome></direction-type></direction><direction><direction-type><words>Lento</words></direction-type></direction>`,
      ),
    );
    expect(readTempo(nth(odd, "direction", 0))).toBeNull();
    expect(readTempo(nth(odd, "direction", 1))).toBeNull();
  });
});

describe("setTempo", () => {
  it("rewrites the metronome mark already there, keeping the rest of it", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    const direction = setTempo(document, { measure: 0 }, { beatUnit: "quarter", dots: 1, perMinute: 80 });
    expect(direction).toBe(nth(document, "direction", 0));
    expect(document.revision).toBe(1);
    expect(scoreText(document)).toBe(
      replaceOnce(
        replaceOnce(
          text,
          `<per-minute>96</per-minute>`,
          `<beat-unit-dot/>
            <per-minute>80</per-minute>`,
        ),
        `<sound tempo="96"/>`,
        `<sound tempo="120"/>`,
      ),
    );
  });

  it("writes a new mark above, before the note at its moment and after that note's chord symbol", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    setTempo(document, { measure: 2, onset: 0.5 }, { beatUnit: "half", dots: 0, perMinute: 60 });
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `<kind>major</kind>
        </harmony>
      <note default-x="129.75" default-y="-5">`,
        `<kind>major</kind>
        </harmony>
      <direction placement="above" system="only-top">
        <direction-type>
          <metronome parentheses="no">
            <beat-unit>half</beat-unit>
            <per-minute>60</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="120"/>
        </direction>
      <note default-x="129.75" default-y="-5">`,
      ),
    );
  });

  it("writes words before the mark, and an offset within a note", () => {
    const document = readScore(score(ATTRIBUTES + note("C", 4)));
    setTempo(document, { measure: 0, onset: 0.5 }, { beatUnit: "quarter", dots: 0, perMinute: 72, words: "Slower" });
    expect(scoreText(document)).toContain(
      `</attributes><direction placement="above" system="only-top"><direction-type><words>Slower</words></direction-type><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>72</per-minute></metronome></direction-type><offset>2</offset><sound tempo="72"/></direction><note>`,
    );
    const map = mapScore(document.root)!;
    expect(readTempo(tempoAt(map, { measure: 0, onset: 0.5 })!)!.words).toBe("Slower");
    expect(tempoAt(map, { measure: 0, onset: 0 })).toBeNull();
  });

  it("changes, adds and removes the words of a mark already there", () => {
    const document = readScore(
      score(
        `${ATTRIBUTES}<direction placement="above"><direction-type><words>Allegro</words></direction-type><sound tempo="120"/></direction>${note("C", 4)}`,
      ),
    );
    setTempo(document, { measure: 0 }, { beatUnit: "quarter", dots: 0, perMinute: 120 });
    expect(scoreText(document)).toContain(
      `<direction placement="above"><direction-type><words>Allegro</words></direction-type><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>`,
    );
    setTempo(document, { measure: 0 }, { beatUnit: "quarter", dots: 0, perMinute: 126, words: "Vivace" });
    expect(readTempo(nth(document, "direction", 0))).toEqual({
      beatUnit: "quarter",
      dots: 0,
      perMinute: 126,
      words: "Vivace",
    });
    setTempo(document, { measure: 0 }, { beatUnit: "quarter", dots: 0, perMinute: 126, words: "" });
    expect(scoreText(document)).toContain(
      `<direction placement="above"><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>126</per-minute></metronome></direction-type><sound tempo="126"/></direction>`,
    );
    setTempo(document, { measure: 0 }, { beatUnit: "quarter", dots: 0, perMinute: 126, words: "Presto" });
    expect(scoreText(document)).toContain(
      `<direction placement="above"><direction-type><words>Presto</words></direction-type><direction-type><metronome`,
    );
  });

  it("gives a direction without a sound one", () => {
    const document = readScore(
      score(
        `${ATTRIBUTES}<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type></direction>${note("C", 4)}`,
      ),
    );
    setTempo(document, { measure: 0, onset: 0 }, { beatUnit: "quarter", dots: 0, perMinute: 66 });
    expect(scoreText(document)).toContain(
      `<per-minute>66</per-minute></metronome></direction-type><sound tempo="66"/></direction>`,
    );
  });

  it("refuses marks without a beat unit, dots or a positive tempo, and other scores", () => {
    const document = readScore(fixtureText("musescore/lead-sheet.musicxml"));
    const set = (tempo: Parameters<typeof setTempo>[2]) => () => setTempo(document, { measure: 0 }, tempo);
    expect(refusal(document, set({ beatUnit: "crotchet" as "quarter", dots: 0, perMinute: 60 }))).toBe("invalid_tempo");
    expect(refusal(document, set({ beatUnit: "quarter", dots: 3, perMinute: 60 }))).toBe("invalid_tempo");
    expect(refusal(document, set({ beatUnit: "quarter", dots: 0, perMinute: 0 }))).toBe("invalid_tempo");
    expect(refusal(document, set({ beatUnit: "quarter", dots: 0, perMinute: Number.NaN }))).toBe("invalid_tempo");
    expect(
      refusal(document, () => setTempo(document, { measure: 9 }, { beatUnit: "quarter", dots: 0, perMinute: 60 })),
    ).toBe("not_in_score");
    const parts = twoParts();
    expect(refusal(parts, () => setTempo(parts, { measure: 0 }, { beatUnit: "quarter", dots: 0, perMinute: 60 }))).toBe(
      "not_editable",
    );
  });
});

describe("removeTempo", () => {
  it("removes a tempo's direction with its line", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    removeTempo(document, { measure: 0 });
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `
      <direction placement="above" system="only-top">
        <direction-type>
          <metronome parentheses="no" default-x="-64.03" default-y="47.9" relative-y="20">
            <beat-unit>quarter</beat-unit>
            <per-minute>96</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="96"/>
        </direction>`,
        "",
      ),
    );
    expect(refusal(document, () => removeTempo(document, { measure: 0 }))).toBe("no_tempo");
  });

  it("keeps what else the direction says", () => {
    const document = readScore(
      score(
        `${ATTRIBUTES}<direction><direction-type><dynamics><f/></dynamics></direction-type><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type><sound tempo="60" dynamics="88"/></direction>` +
          `<direction><direction-type><words>Lento</words></direction-type><sound tempo="50"/></direction>${note("C", 4)}`,
      ),
    );
    removeTempo(document, { measure: 0 });
    expect(scoreText(document)).toContain(
      `<direction><direction-type><dynamics><f/></dynamics></direction-type><sound dynamics="88"/></direction><direction>`,
    );
    removeTempo(document, { measure: 0 });
    expect(scoreText(document)).toContain(`<sound dynamics="88"/></direction><note>`);
  });
});
