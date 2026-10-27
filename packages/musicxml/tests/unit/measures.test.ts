import { describe, expect, it } from "vitest";

import {
  appendMeasures,
  endingsOf,
  insertMeasures,
  lyricOf,
  mapScore,
  readScore,
  removeMeasures,
  scoreText,
} from "../../src";
import { nth, refusal, replaceOnce, twoParts } from "../editing";
import { fixtureText, score } from "../fixtures";

const time = (beats: number, beatType: number) =>
  `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`;
const attributes = (content: string) => `<attributes>${content}</attributes>`;
const OPENING = attributes(
  `<divisions>1</divisions><key><fifths>0</fifths></key>${time(4, 4)}<clef><sign>G</sign><line>2</line></clef>`,
);
const note = (step: string, duration = 4, extra = "") =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice>${extra}</note>`;
const rest = (duration: number) => `<note><rest measure="yes"/><duration>${duration}</duration><voice>1</voice></note>`;

/** The text of a measure, from its start tag to its end tag, as written. */
function measureText(text: string, number: string): string {
  const start = text.indexOf(`<measure number="${number}"`);
  const end = text.indexOf("</measure>", start) + "</measure>".length;
  return text.slice(start, end);
}

describe("insertMeasures and appendMeasures", () => {
  it("adds whole-measure rests at the end, laid out as the file is", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    const added = appendMeasures(document, 1);
    expect(added).toHaveLength(1);
    expect(document.revision).toBe(1);
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `      </measure>
    </part>`,
        `      </measure>
    <measure number="5">
      <note>
        <rest measure="yes"/>
        <duration>8</duration>
        <voice>1</voice>
        </note>
      </measure>
    </part>`,
      ),
    );
    expect(mapScore(document.root)!.measures[4]!.length).toBe(1);
  });

  it("moves the opening key, time and clef to new first measures, and renumbers", () => {
    const document = readScore(score(OPENING + note("C"), note("D")));
    insertMeasures(document, 0, 2);
    expect(scoreText(document)).toBe(score(OPENING + rest(4), rest(4), note("C"), note("D")));
  });

  it("takes the time in force before the measures it goes before", () => {
    const document = readScore(
      score(attributes(`<divisions>2</divisions>${time(3, 4)}`) + note("C", 6), attributes(time(2, 4)) + note("D", 4)),
    );
    insertMeasures(document, 1, 1);
    expect(measureText(scoreText(document), "2")).toBe(`<measure number="2">${rest(6)}</measure>`);
    expect(measureText(scoreText(document), "3")).toContain(time(2, 4));
  });

  it("moves a final barline to the new last measure", () => {
    const final = `<barline location="right"><bar-style>light-heavy</bar-style></barline>`;
    const document = readScore(score(OPENING + note("C") + final));
    appendMeasures(document, 1);
    expect(scoreText(document)).toBe(score(OPENING + note("C"), rest(4) + final));
  });

  it("keeps measure numbers that are not 1, 2, 3…, and numbers new ones after the one before", () => {
    const document = readScore(score(OPENING + note("C"), note("D")).replace(`number="2"`, `number="X1"`));
    insertMeasures(document, 1, 2);
    insertMeasures(document, 0, 1);
    const numbers = Array.from(document.root.getElementsByTagName("measure")).map((measure) =>
      measure.getAttribute("number"),
    );
    expect(numbers).toEqual(["0a", "1", "1a", "1b", "X1"]);
  });

  it("goes on with the letters after a lettered number, skipping numbers taken, past z", () => {
    const document = readScore(score(OPENING + note("C"), note("D"), note("E")).replace(`number="3"`, `number="1b"`));
    const numbers = () =>
      Array.from(document.root.getElementsByTagName("measure")).map((measure) => measure.getAttribute("number"));
    // After 2 comes 2a; after 1, 1a; after 1a, 1c, as 1b is taken.
    insertMeasures(document, 2, 1);
    insertMeasures(document, 1, 2);
    expect(numbers()).toEqual(["1", "1a", "1c", "2", "2a", "1b"]);
    // After 1b, at the end: 1d to 1z (1c is taken), then 1aa, 1bb…
    appendMeasures(document, 25);
    expect(numbers().slice(-3)).toEqual(["1z", "1aa", "1bb"]);
  });

  it("refuses counts below one, places outside the part, no time signature and lengths the divisions cannot write", () => {
    const document = readScore(score(OPENING + note("C")));
    expect(refusal(document, () => insertMeasures(document, 0, 0))).toBe("invalid_count");
    expect(refusal(document, () => insertMeasures(document, 2, 1))).toBe("not_in_score");
    expect(refusal(document, () => insertMeasures(document, -1, 1))).toBe("not_in_score");
    const free = readScore(score(attributes("<divisions>1</divisions>") + note("C")));
    expect(refusal(free, () => appendMeasures(free, 1))).toBe("no_time_signature");
    const sevenEight = readScore(
      score(attributes(`<divisions>1</divisions>${time(7, 8)}`) + note("C", 3) + note("D", 0.5)),
    );
    expect(refusal(sevenEight, () => appendMeasures(sevenEight, 1))).toBe("length_not_in_divisions");
    const parts = twoParts();
    expect(refusal(parts, () => appendMeasures(parts, 1))).toBe("not_editable");
  });
});

describe("removeMeasures", () => {
  it("removes a measure, its ties into it and its number", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    removeMeasures(document, 2, 1);
    let expected = replaceOnce(text, `\n    ${measureText(text, "3")}`, "");
    expected = replaceOnce(expected, `\n        <tie type="start"/>`, "");
    expected = replaceOnce(
      expected,
      `
        <notations>
          <tied type="start"/>
          </notations>`,
      "",
    );
    expected = replaceOnce(expected, `<measure number="4"`, `<measure number="3"`);
    expect(scoreText(document)).toBe(expected);
  });

  it("leaves the file as it was after measures inserted are removed, ties across them kept", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    insertMeasures(document, 2, 2);
    expect(mapScore(document.root)!.measures.map((measure) => measure.number)).toEqual(["1", "2", "3", "4", "5", "6"]);
    removeMeasures(document, 2, 2);
    expect(scoreText(document)).toBe(text);
  });

  it("moves the opening key, time, clef, divisions and tempo on to the measure after", () => {
    const document = readScore(fixtureText("musescore/lead-sheet.musicxml"));
    removeMeasures(document, 0, 1);
    const map = mapScore(document.root)!;
    expect(map.measures).toHaveLength(3);
    expect(map.measures[0]).toMatchObject({ number: "1", divisions: 2, fifths: 1, time: { beats: 4, beatType: 4 } });
    expect(map.measures[0]!.notes[0]!.length).toBe(0.25);
    const first = scoreText(document).slice(scoreText(document).indexOf(`<measure number="1"`));
    expect(first).toMatch(
      /^<measure number="1" width="219\.49">\n {6}<attributes>\n {8}<divisions>2<\/divisions>\n {8}<key>\n {10}<fifths>1<\/fifths>\n {10}<\/key>/,
    );
    expect(first.indexOf("<clef>")).toBeLessThan(first.indexOf("<harmony"));
    expect(first.indexOf(`<sound tempo="96"/>`)).toBeGreaterThan(first.indexOf("</harmony>"));
    expect(first.indexOf(`<sound tempo="96"/>`)).toBeLessThan(first.indexOf("<note"));
  });

  it("carries only the changes the measure after does not make or already has", () => {
    const keyOf = (fifths: number) => `<key><fifths>${fifths}</fifths></key>`;
    const document = readScore(
      score(OPENING + note("C"), attributes(keyOf(2)) + note("D"), attributes(time(3, 4)) + note("E", 3), note("F", 3)),
    );
    removeMeasures(document, 1, 2);
    expect(scoreText(document)).toBe(score(OPENING + note("C"), attributes(keyOf(2) + time(3, 4)) + note("F", 3)));
    const own = readScore(
      score(OPENING + note("C"), attributes(keyOf(2)) + note("D"), attributes(keyOf(3)) + note("E")),
    );
    removeMeasures(own, 1, 1);
    expect(scoreText(own)).toBe(score(OPENING + note("C"), attributes(keyOf(3)) + note("E")));
    const same = readScore(score(OPENING + note("C"), attributes(keyOf(0)) + note("D"), note("E")));
    removeMeasures(same, 1, 1);
    expect(scoreText(same)).toBe(score(OPENING + note("C"), note("E")));
  });

  it("adds carried changes to the measure's own attributes, after its barline", () => {
    const tempo = `<direction placement="above"><direction-type><words>Slow</words></direction-type><offset>1</offset><sound tempo="60"/></direction>`;
    const left = `<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>`;
    const document = readScore(
      score(
        OPENING + note("C"),
        attributes(time(3, 4)) + note("D", 1) + tempo + note("E", 2),
        left + note("F", 3),
        attributes("<clef><sign>F</sign><line>4</line></clef>") + note("G", 3),
      ),
    );
    removeMeasures(document, 1, 1);
    expect(measureText(scoreText(document), "2")).toBe(
      `<measure number="2">${left}${attributes(time(3, 4))}${tempo.replace("<offset>1</offset>", "")}${note("F", 3)}</measure>`,
    );
    removeMeasures(document, 0, 1);
    expect(measureText(scoreText(document), "1")).toBe(
      `<measure number="1">${left}${attributes(`<divisions>1</divisions><key><fifths>0</fifths></key>${time(3, 4)}<clef><sign>G</sign><line>2</line></clef>`)}${tempo.replace("<offset>1</offset>", "")}${note("F", 3)}</measure>`,
    );
  });

  it("moves an ending's start or stop to the measures beside those removed", () => {
    const start = `<barline location="left"><ending number="1" type="start">1.</ending></barline>`;
    const stop = `<barline location="right"><ending number="1" type="stop"/></barline>`;
    const build = () =>
      readScore(score(OPENING + note("C"), start + note("D"), note("E"), note("F") + stop, note("G")));
    const late = build();
    removeMeasures(late, 1, 1);
    expect(endingsOf(mapScore(late.root)!).map((ending) => [ending.from, ending.to])).toEqual([[1, 2]]);
    expect(measureText(scoreText(late), "2")).toBe(`<measure number="2">${start}${note("E")}</measure>`);
    const early = build();
    removeMeasures(early, 3, 1);
    expect(endingsOf(mapScore(early.root)!).map((ending) => [ending.from, ending.to, ending.open])).toEqual([
      [1, 2, false],
    ]);
    const gone = build();
    removeMeasures(gone, 1, 3);
    expect(endingsOf(mapScore(gone.root)!)).toEqual([]);
  });

  it("keeps the hyphens across the measures removed consistent", () => {
    const lyric = (syllabic: string, text: string) =>
      `<lyric number="1"><syllabic>${syllabic}</syllabic><text>${text}</text></lyric>`;
    const document = readScore(
      score(
        OPENING + note("C", 4, lyric("begin", "won")),
        note("D", 4, lyric("middle", "der")),
        note("E", 4, lyric("end", "land")),
        note("F", 4, lyric("single", "day")),
      ),
    );
    removeMeasures(document, 1, 1);
    expect(lyricOf(nth(document, "note", 0))!.syllabic).toBe("begin");
    expect(lyricOf(nth(document, "note", 1))!.syllabic).toBe("end");
    removeMeasures(document, 1, 1);
    expect(lyricOf(nth(document, "note", 0))!.syllabic).toBe("single");
    expect(lyricOf(nth(document, "note", 1))!.syllabic).toBe("single");
  });

  it("refuses removing every measure, counts below one and measures not there", () => {
    const document = readScore(score(OPENING + note("C"), note("D")));
    expect(refusal(document, () => removeMeasures(document, 0, 2))).toBe("last_measure");
    expect(refusal(document, () => removeMeasures(document, 0, 0))).toBe("invalid_count");
    expect(refusal(document, () => removeMeasures(document, 1, 2))).toBe("not_in_score");
    expect(refusal(document, () => removeMeasures(document, -1, 1))).toBe("not_in_score");
  });
});
