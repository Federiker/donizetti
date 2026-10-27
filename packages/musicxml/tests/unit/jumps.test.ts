import { describe, expect, it } from "vitest";

import {
  type NavigationMark,
  navigationMarkOf,
  navigationMarksOf,
  readScore,
  removeNavigationMark,
  scoreText,
  setNavigationMark,
} from "../../src";
import { meaningOf, nth, refusal, replaceOnce, twoParts } from "../editing";
import { fixtureText, score } from "../fixtures";

const rest = `<note><rest/><duration>4</duration><voice>1</voice></note>`;
const words = (text: string, sound = "") =>
  `<direction><direction-type><words>${text}</words></direction-type>${sound}</direction>`;

/** The marks of MuseScore's navigation fixture, a measure each, in order. */
const MARKS: [number, NavigationMark][] = [
  [0, "segno"],
  [3, "fine"],
  [4, "to-coda"],
  [5, "coda"],
  [6, "da-capo"],
  [7, "da-capo-al-fine"],
  [8, "dal-segno-al-coda"],
  [9, "dal-segno-al-fine"],
  [10, "da-capo-al-coda"],
  [11, "dal-segno"],
];

describe("reading navigation marks", () => {
  it("reads MuseScore's markers and jumps", () => {
    const document = readScore(fixtureText("musescore/navigation.musicxml"));
    const measures = Array.from(document.root.getElementsByTagName("measure"));
    expect(measures.flatMap((measure, index) => navigationMarksOf(measure).map(({ mark }) => [index, mark]))).toEqual(
      MARKS,
    );
  });

  it("reads the words of programs that write no <sound>, and nothing else", () => {
    const document = readScore(
      score(
        words("D.S. al Coda") +
          words("Da Capo") +
          words("dal segno al fine") +
          words("Fine") +
          words("To  Coda") +
          words("Allegro") +
          `<direction><direction-type><coda/></direction-type></direction>` +
          words("D.C.", `<sound dalsegno="segno"/>`),
      ),
    );
    expect(Array.from(document.root.getElementsByTagName("direction")).map(navigationMarkOf)).toEqual([
      "dal-segno-al-coda",
      "da-capo",
      "dal-segno-al-fine",
      "fine",
      "to-coda",
      null,
      "coda",
      "dal-segno",
    ]);
  });
});

describe("setNavigationMark", () => {
  it("writes each mark as MuseScore 4 does", () => {
    const fixture = readScore(fixtureText("musescore/navigation.musicxml"));
    for (const [index, mark] of MARKS) {
      const document = readScore(score(rest));
      const direction = setNavigationMark(document, 0, mark);
      const theirs = navigationMarksOf(nth(fixture, "measure", index))[0]!.direction;
      expect(meaningOf(direction), mark).toBe(meaningOf(theirs));
    }
  });

  it("puts a segno or coda at the start of the measure, after its chord symbol", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    setNavigationMark(document, 1, "segno");
    expect(document.revision).toBe(1);
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `<kind text="7">dominant</kind>
        </harmony>
      <note`,
        `<kind text="7">dominant</kind>
        </harmony>
      <direction placement="above">
        <direction-type>
          <segno/>
        </direction-type>
        <sound segno="segno"/>
      </direction>
      <note`,
      ),
    );
  });

  it("puts Fine, To Coda and jumps at the end of the measure, before its barline", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    setNavigationMark(document, 3, "dal-segno-al-coda");
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `          </lyric>
        </note>
      <barline location="right">`,
        `          </lyric>
        </note>
      <direction placement="above">
        <direction-type>
          <words>D.S. al Coda</words>
        </direction-type>
        <sound dalsegno="segno"/>
      </direction>
      <barline location="right">`,
      ),
    );
  });

  it("keeps one jump a measure, and a mark already there", () => {
    const document = readScore(score(rest + words("Allegro")));
    setNavigationMark(document, 0, "fine");
    setNavigationMark(document, 0, "da-capo");
    setNavigationMark(document, 0, "dal-segno-al-fine");
    const before = scoreText(document);
    const fine = setNavigationMark(document, 0, "fine");
    expect(scoreText(document)).toBe(before);
    expect(navigationMarkOf(fine)).toBe("fine");
    expect(navigationMarksOf(nth(document, "measure", 0)).map(({ mark }) => mark)).toEqual([
      "fine",
      "dal-segno-al-fine",
    ]);
    expect(scoreText(document)).toContain(
      `${words("Allegro")}<direction placement="above"><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction><direction placement="above"><direction-type><words>D.S. al Fine</words></direction-type><sound dalsegno="segno"/></direction></measure>`,
    );
  });
});

describe("removeNavigationMark", () => {
  it("removes the mark's direction with its line", () => {
    const text = fixtureText("musescore/navigation.musicxml");
    const document = readScore(text);
    removeNavigationMark(document, 5, "coda");
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `
      <direction placement="above">
        <direction-type>
          <coda default-x="-14.81" relative-y="20"/>
          </direction-type>
        <sound coda="codab"/>
        </direction>`,
        "",
      ),
    );
    expect(refusal(document, () => removeNavigationMark(document, 5, "coda"))).toBe("no_navigation_mark");
    expect(refusal(document, () => removeNavigationMark(document, 12, "coda"))).toBe("not_in_score");
    const parts = twoParts();
    expect(refusal(parts, () => setNavigationMark(parts, 0, "fine"))).toBe("not_editable");
  });
});
