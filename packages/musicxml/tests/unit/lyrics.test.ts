import { describe, expect, it } from "vitest";

import {
  lyricOf,
  lyricsOf,
  mapScore,
  nextLyricNote,
  previousLyricNote,
  readScore,
  removeLyric,
  scoreText,
  setLyric,
} from "../../src";
import { nth, refusal, replaceOnce, twoParts } from "../editing";
import { fixtureText, score } from "../fixtures";

const note = (step: string, extra = "") =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type>${extra}</note>`;
const lyric = (syllabic: string, text: string, number = "1") =>
  `<lyric number="${number}"><syllabic>${syllabic}</syllabic><text>${text}</text></lyric>`;
const ATTRIBUTES = `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`;

/** A measure of four quarter notes, C D E F, with the lyrics given (one string a note). */
const fourNotes = (...lyrics: string[]) =>
  readScore(score(ATTRIBUTES + ["C", "D", "E", "F"].map((step, index) => note(step, lyrics[index] ?? "")).join("")));

const syllabics = (document: ReturnType<typeof readScore>, verse = "1") =>
  Array.from(document.root.getElementsByTagName("note")).map((element) => {
    const found = lyricOf(element, verse);
    return found ? `${found.text}:${found.syllabic}` : "";
  });

describe("reading lyrics", () => {
  it("reads MuseScore's syllables, verses and extender lines", () => {
    const document = readScore(fixtureText("musescore/lead-sheet.musicxml"));
    const [first] = lyricsOf(nth(document, "note", 0));
    expect(first).toMatchObject({ verse: "1", text: "Hap", syllabic: "begin", hyphenBefore: false, hyphenAfter: true });
    expect(lyricOf(nth(document, "note", 1))).toMatchObject({ text: "py", syllabic: "end", hyphenBefore: true });
    // MuseScore writes a melisma as <extend/> on the syllable it starts from; the invented sheet types it.
    expect(lyricOf(nth(document, "note", 6))!.extend).toEqual({ type: null });
    const invented = readScore(fixtureText("invented/lead-sheet.musicxml"));
    expect(lyricOf(nth(invented, "note", 6))!.extend).toEqual({ type: "start" });
    expect(lyricOf(nth(document, "note", 7))).toBeNull();
  });

  it("reads elisions, untyped syllables and lyrics that only carry an extender", () => {
    const document = fourNotes(
      `<lyric number="2"><syllabic>single</syllabic><text>a</text><elision>‿</elision><syllabic>begin</syllabic><text>e</text></lyric>`,
      `<lyric><text>la</text></lyric>`,
      `<lyric number="1"><extend type="stop"/></lyric>`,
      `<lyric number="1"><text>a</text><elision/><text>e</text></lyric>`,
    );
    expect(lyricOf(nth(document, "note", 0), "2")).toMatchObject({
      text: "a‿e",
      syllabic: "single",
      elided: true,
      hyphenBefore: false,
      hyphenAfter: true,
    });
    expect(lyricOf(nth(document, "note", 1))).toMatchObject({ verse: "1", text: "la", syllabic: "single" });
    expect(lyricOf(nth(document, "note", 2))).toMatchObject({
      text: "",
      hyphenAfter: false,
      extend: { type: "stop" },
    });
    expect(lyricOf(nth(document, "note", 3))!.text).toBe("a‿e");
  });
});

describe("moving between lyric notes", () => {
  it("skips rests and tied continuations, as MuseScore does", () => {
    const document = readScore(fixtureText("musescore/lead-sheet.musicxml"));
    const map = mapScore(document.root)!;
    const out = nth(document, "note", 6);
    const all = nth(document, "note", 9);
    expect(nextLyricNote(map, out)!.element).toBe(all);
    expect(previousLyricNote(map, all)!.element).toBe(out);
    expect(previousLyricNote(map, nth(document, "note", 0))).toBeNull();
    expect(nextLyricNote(map, nth(document, "note", 11))).toBeNull();
  });

  it("skips a chord's other notes and grace notes", () => {
    const document = readScore(
      score(
        ATTRIBUTES +
          note("C") +
          note("E", "<chord/>") +
          `<note><grace/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice></note>` +
          note("F"),
      ),
    );
    const map = mapScore(document.root)!;
    expect(nextLyricNote(map, nth(document, "note", 0))!.element).toBe(nth(document, "note", 3));
    expect(previousLyricNote(map, nth(document, "note", 3))!.element).toBe(nth(document, "note", 0));
    expect(previousLyricNote(map, nth(document, "note", 1))).toBeNull();
  });
});

describe("setLyric", () => {
  it("writes a new syllable in the schema's place, laid out as the file is", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    const written = setLyric(document, nth(document, "note", 7 + 3), { text: "way", verse: "2" });
    expect(written.getAttribute("number")).toBe("2");
    expect(document.revision).toBe(1);
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `<text>the</text>
          </lyric>
        </note>
      </measure>
    <measure number="4"`,
        `<text>the</text>
          </lyric>
        <lyric number="2">
          <syllabic>single</syllabic>
          <text>way</text>
          </lyric>
        </note>
      </measure>
    <measure number="4"`,
      ),
    );
  });

  it("changes only the text of an existing syllable", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    setLyric(document, nth(document, "note", 4), { text: "you" });
    expect(scoreText(document)).toBe(replaceOnce(text, "<text>we</text>", "<text>you</text>"));
  });

  it("hyphenates syllable by syllable, as MuseScore's - and Space do", () => {
    const document = fourNotes();
    const notes = Array.from(document.root.getElementsByTagName("note"));
    setLyric(document, notes[0]!, { text: "won", hyphen: true });
    setLyric(document, notes[1]!, { text: "der", hyphen: true });
    setLyric(document, notes[2]!, { text: "land" });
    setLyric(document, notes[3]!, { text: "day" });
    expect(syllabics(document)).toEqual(["won:begin", "der:middle", "land:end", "day:single"]);
    expect(document.revision).toBe(4);
    // Taking the hyphen after "der" away ends the word there: the next syllable starts a word of its own.
    setLyric(document, notes[1]!, { text: "der", hyphen: false });
    expect(syllabics(document)).toEqual(["won:begin", "der:end", "land:single", "day:single"]);
    // A hyphen after "land" joins it to "day".
    setLyric(document, notes[2]!, { text: "land", hyphen: true });
    expect(syllabics(document)).toEqual(["won:begin", "der:end", "land:begin", "day:end"]);
    expect(scoreText(document)).toContain(
      `${lyric("begin", "won")}</note>` +
        note("D", lyric("end", "der")) +
        note("E", lyric("begin", "land")) +
        note("F", lyric("end", "day")),
    );
  });

  it("keeps the hyphenation it finds when none is given", () => {
    // A hyphen from "won" runs over the second note to "land": a syllable there takes it on.
    const document = fourNotes(lyric("begin", "won"), "", lyric("end", "land"));
    setLyric(document, nth(document, "note", 1), { text: "der" });
    expect(syllabics(document)).toEqual(["won:begin", "der:middle", "land:end", ""]);
    setLyric(document, nth(document, "note", 0), { text: "Won" });
    expect(syllabics(document)).toEqual(["Won:begin", "der:middle", "land:end", ""]);
  });

  it("keeps an elision while the text stays, and writes new text as one syllable", () => {
    const elided = `<lyric number="1" default-y="-40"><syllabic>single</syllabic><text>a</text><elision>‿</elision><syllabic>single</syllabic><text>e</text></lyric>`;
    const document = fourNotes(elided, lyric("single", "la"));
    setLyric(document, nth(document, "note", 0), { text: "a‿e", hyphen: true });
    expect(scoreText(document)).toContain(
      elided.replace("<syllabic>single</syllabic><text>e", "<syllabic>begin</syllabic><text>e"),
    );
    expect(syllabics(document)).toEqual(["a‿e:single", "la:end", "", ""]);
    setLyric(document, nth(document, "note", 0), { text: "o" });
    expect(scoreText(document)).toContain(
      `<lyric number="1" default-y="-40"><syllabic>begin</syllabic><text>o</text></lyric>`,
    );
  });

  it("adds a syllabic where a syllable had none", () => {
    const document = fourNotes(`<lyric><text>la</text></lyric>`, lyric("single", "di"));
    setLyric(document, nth(document, "note", 0), { text: "la", hyphen: true });
    expect(scoreText(document)).toContain(`<lyric><syllabic>begin</syllabic><text>la</text></lyric>`);
    expect(syllabics(document)).toEqual(["la:begin", "di:end", "", ""]);
  });

  it("writes and removes extender lines (MuseScore's _)", () => {
    const document = fourNotes();
    setLyric(document, nth(document, "note", 0), { text: "Ah", extend: true });
    expect(scoreText(document)).toContain(
      `<lyric number="1"><syllabic>single</syllabic><text>Ah</text><extend/></lyric>`,
    );
    setLyric(document, nth(document, "note", 0), { text: "Ah", extend: true });
    setLyric(document, nth(document, "note", 0), { text: "Oh" });
    expect(lyricOf(nth(document, "note", 0))!.extend).toEqual({ type: null });
    setLyric(document, nth(document, "note", 0), { text: "Oh", extend: false });
    expect(lyricOf(nth(document, "note", 0))!.extend).toBeNull();
  });

  it("gives a lyric that only carried an extender its syllable", () => {
    const document = fourNotes(
      lyric("single", "Ah"),
      `<lyric number="1" default-y="-40"><extend type="stop"/></lyric>`,
    );
    setLyric(document, nth(document, "note", 1), { text: "men" });
    expect(scoreText(document)).toContain(
      `<lyric number="1" default-y="-40"><syllabic>single</syllabic><text>men</text></lyric>`,
    );
  });

  it("puts verses in order and a chord's lyric on its first note", () => {
    const document = readScore(score(ATTRIBUTES + note("C", lyric("single", "two", "2")) + note("E", "<chord/>")));
    setLyric(document, nth(document, "note", 1), { text: "one" });
    setLyric(document, nth(document, "note", 0), { text: "three", verse: "3" });
    expect(lyricsOf(nth(document, "note", 0)).map((found) => found.verse)).toEqual(["1", "2", "3"]);
    expect(lyricsOf(nth(document, "note", 1))).toEqual([]);
  });

  it("refuses rests, grace notes, tied continuations, empty text and other scores", () => {
    const document = readScore(fixtureText("musescore/lead-sheet.musicxml"));
    expect(refusal(document, () => setLyric(document, nth(document, "note", 7), { text: "la" }))).toBe(
      "lyric_not_allowed",
    );
    expect(refusal(document, () => setLyric(document, nth(document, "note", 8), { text: "la" }))).toBe(
      "lyric_not_allowed",
    );
    expect(refusal(document, () => setLyric(document, nth(document, "note", 0), { text: "" }))).toBe("empty_lyric");
    const graced = readScore(
      score(
        `${ATTRIBUTES}<note><grace/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice></note>${note("C")}`,
      ),
    );
    expect(refusal(graced, () => setLyric(graced, nth(graced, "note", 0), { text: "la" }))).toBe("lyric_not_allowed");
    const other = readScore(score(ATTRIBUTES + note("C")));
    expect(refusal(document, () => setLyric(document, nth(other, "note", 0), { text: "la" }))).toBe("not_in_score");
    const parts = twoParts();
    expect(refusal(parts, () => setLyric(parts, nth(parts, "note", 0), { text: "la" }))).toBe("not_editable");
  });
});

describe("removeLyric", () => {
  it("removes the lyric with its line", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    removeLyric(document, nth(document, "note", 4));
    expect(scoreText(document)).toBe(
      replaceOnce(
        text,
        `
        <lyric number="1" default-x="6.5" default-y="-40.32" relative-y="-30">
          <syllabic>single</syllabic>
          <text>we</text>
          </lyric>`,
        "",
      ),
    );
  });

  it("ends or begins the word on the syllable beside the one removed", () => {
    const document = fourNotes(
      lyric("begin", "won"),
      lyric("middle", "der"),
      lyric("end", "land"),
      lyric("single", "a"),
    );
    removeLyric(document, nth(document, "note", 1));
    expect(syllabics(document)).toEqual(["won:begin", "", "land:end", "a:single"]);
    removeLyric(document, nth(document, "note", 2));
    expect(syllabics(document)).toEqual(["won:single", "", "", "a:single"]);
    const again = fourNotes(lyric("begin", "won"), lyric("middle", "der"), lyric("end", "land"));
    removeLyric(again, nth(again, "note", 0));
    expect(syllabics(again)).toEqual(["", "der:begin", "land:end", ""]);
    expect(refusal(again, () => removeLyric(again, nth(again, "note", 0)))).toBe("no_lyric");
    expect(refusal(again, () => removeLyric(again, nth(again, "note", 1), "2"))).toBe("no_lyric");
  });
});
