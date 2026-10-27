import { describe, expect, it } from "vitest";

import { readScore, scoreText } from "../../src";
import { cloneUnlaidOut, insertElement, moveElement } from "../../src/edit/xml-edit";
import { nth } from "../editing";

const PRETTY = `<score-partwise version="4.0">
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
      </attributes>
      <note>
        <rest/>
      </note>
    </measure>
    <measure number="2">
      <note>
        <rest/>
      </note>
    </measure>
  </part>
</score-partwise>`;

describe("moving and copying elements", () => {
  it("moves an element with its children as laid out, taking its new siblings' indentation", () => {
    const document = readScore(PRETTY);
    const attributes = nth(document, "attributes", 0);
    moveElement(attributes, nth(document, "measure", 1), nth(document, "note", 1));
    expect(scoreText(document)).toBe(
      PRETTY.replace(
        `
      <attributes>
        <divisions>1</divisions>
      </attributes>`,
        "",
      ).replace(
        `<measure number="2">`,
        `<measure number="2">
      <attributes>
        <divisions>1</divisions>
      </attributes>`,
      ),
    );
    moveElement(attributes, nth(document, "measure", 0));
    expect(scoreText(document)).toContain(`<rest/>
      </note>
      <attributes>
        <divisions>1</divisions>
      </attributes>
    </measure>`);
  });

  it("moves into a parent written on one line, or one ended without whitespace", () => {
    const document = readScore(
      `<score-partwise><part id="P1"><measure number="1"><note><rest/></note></measure><measure number="2">\n  <note/></measure></part></score-partwise>`,
    );
    moveElement(nth(document, "note", 1), nth(document, "measure", 0), nth(document, "note", 0));
    expect(scoreText(document)).toContain(
      `<measure number="1"><note/><note><rest/></note></measure><measure number="2"></measure>`,
    );
    const indented = readScore(
      `<score-partwise><part id="P1">\n  <measure number="1"/>\n  <measure number="2"/></part></score-partwise>`,
    );
    moveElement(nth(indented, "measure", 0), nth(indented, "part", 0));
    expect(scoreText(indented)).toBe(
      `<score-partwise><part id="P1">\n  <measure number="2"/>\n  <measure number="1"/></part></score-partwise>`,
    );
  });

  it("copies an element without its layout, to be laid out where it goes", () => {
    const document = readScore(PRETTY);
    const copy = cloneUnlaidOut(nth(document, "attributes", 0));
    insertElement(nth(document, "measure", 1), copy, nth(document, "note", 1));
    expect(scoreText(document)).toContain(`<measure number="2">
      <attributes>
        <divisions>1</divisions>
      </attributes>
      <note>`);
  });
});
