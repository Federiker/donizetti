import { describe, expect, it } from "vitest";

import { readScore, scoreText } from "../../src";
import {
  createElement,
  edit,
  insertElement,
  insertInOrder,
  removeChildren,
  removeElement,
  setChildText,
} from "../../src/edit/xml-edit";

const PRETTY = `<score-partwise version="4.0">
  <part id="P1">
    <measure number="1">
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

const COMPACT = `<score-partwise version="4.0"><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>`;

describe("editing the XML", () => {
  it("counts each edit in the revision", () => {
    const document = readScore(COMPACT);
    expect(edit(document, () => 7)).toBe(7);
    expect(document.revision).toBe(1);
  });

  it("puts a new child where the schema orders it, indented as its siblings", () => {
    const document = readScore(PRETTY);
    const note = document.root.getElementsByTagName("note")[0]!;
    const pitch = note.getElementsByTagName("pitch")[0]!;
    insertInOrder(pitch, createElement(document.xml, "alter", "1"), "pitch");
    insertInOrder(note, createElement(document.xml, "voice", "1"), "note");
    insertInOrder(note, createElement(document.xml, "lyric", [createElement(document.xml, "text", "la")]), "note");
    expect(scoreText(document)).toBe(`<score-partwise version="4.0">
  <part id="P1">
    <measure number="1">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <lyric>
          <text>la</text>
        </lyric>
      </note>
    </measure>
  </part>
</score-partwise>`);
  });

  it("writes new children inline where the file is on one line", () => {
    const document = readScore(COMPACT);
    const note = document.root.getElementsByTagName("note")[0]!;
    setChildText(note, "type", "quarter", "note");
    setChildText(note, "duration", "2", "note");
    insertElement(
      document.root.getElementsByTagName("measure")[0]!,
      createElement(document.xml, "note", [createElement(document.xml, "rest")]),
    );
    expect(scoreText(document)).toBe(
      COMPACT.replace("<duration>1</duration>", "<duration>2</duration><type>quarter</type>").replace(
        "</note></measure>",
        "</note><note><rest/></note></measure>",
      ),
    );
  });

  it("inserts before a sibling with its indentation, and removes without leaving a blank line", () => {
    const document = readScore(PRETTY);
    const measure = document.root.getElementsByTagName("measure")[0]!;
    const note = measure.getElementsByTagName("note")[0]!;
    const rest = insertElement(
      measure,
      createElement(document.xml, "note", [createElement(document.xml, "rest")]),
      note,
    );
    expect(scoreText(document)).toContain(`<measure number="1">
      <note>
        <rest/>
      </note>
      <note>
        <pitch>`);
    removeElement(rest);
    removeChildren(note, "type");
    expect(scoreText(document)).toBe(PRETTY.replace("\n        <type>quarter</type>", ""));
  });

  it("adds attributes to new elements and leaves names the schema does not order at the end", () => {
    const document = readScore(COMPACT);
    const note = document.root.getElementsByTagName("note")[0]!;
    insertInOrder(note, createElement(document.xml, "vendor-thing", undefined, { a: "b" }), "note");
    expect(scoreText(document)).toContain(`<duration>1</duration><vendor-thing a="b"/></note>`);
  });
});
