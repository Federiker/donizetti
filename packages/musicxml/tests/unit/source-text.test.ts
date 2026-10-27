import { describe, expect, it } from "vitest";

import { readScore, scoreText } from "../../src";

const ROOT = `<score-partwise version='4.0'>
  <work><work-title>D&#233;j&#224; &amp; vu</work-title></work>
  <part-list><score-part id="P1"><part-name></part-name><part-abbreviation/></score-part></part-list>
  <part id="P1">
    <measure number="1" width = "200">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
      <!-- a comment --><?vendor keep?><![CDATA[ raw <text> ]]>
    </measure>
  </part>
</score-partwise>`;

const TEXT = `<?xml version="1.0" encoding="UTF-8"?>\n${ROOT}\n`;

function edited(change: (root: Element, xml: XMLDocument) => void): string {
  const document = readScore(TEXT);
  change(document.root, document.xml);
  return scoreText(document);
}

describe("writing a changed score", () => {
  it("keeps untouched quotes, entities, spaces in tags and empty elements as written", () => {
    const text = edited((root) => {
      root.getElementsByTagName("step")[0]!.textContent = "D";
    });
    expect(text).toBe(TEXT.replace("<step>C</step>", "<step>D</step>"));
  });

  it("writes only the start tag of an element whose attributes changed", () => {
    const text = edited((root) => {
      root.getElementsByTagName("measure")[0]!.setAttribute("number", "2");
    });
    expect(text).toBe(TEXT.replace(`<measure number="1" width = "200">`, `<measure number="2" width="200">`));
  });

  it("serialises new elements and keeps their neighbours as written", () => {
    const text = edited((root, xml) => {
      const measure = root.getElementsByTagName("measure")[0]!;
      const rest = xml.createElement("note");
      rest.appendChild(xml.createElement("rest"));
      measure.insertBefore(rest, measure.firstChild);
    });
    expect(text).toBe(TEXT.replace(`width = "200">`, `width = "200"><note><rest/></note>`));
  });

  it("keeps an element's form when its children come and go", () => {
    const text = edited((root, xml) => {
      root.getElementsByTagName("part-name")[0]!.appendChild(xml.createTextNode("Flute < Oboe"));
      root.getElementsByTagName("part-abbreviation")[0]!.appendChild(xml.createTextNode("Fl."));
      const work = root.getElementsByTagName("work")[0]!;
      work.removeChild(work.firstChild!);
    });
    expect(text).toBe(
      TEXT.replace("<part-name></part-name>", "<part-name>Flute &lt; Oboe</part-name>")
        .replace("<part-abbreviation/>", "<part-abbreviation>Fl.</part-abbreviation>")
        .replace("<work><work-title>D&#233;j&#224; &amp; vu</work-title></work>", "<work></work>"),
    );
  });

  it("moves an untouched element with its text as written", () => {
    const text = edited((root) => {
      const work = root.getElementsByTagName("work")[0]!;
      root.appendChild(work);
    });
    expect(text).toContain(`</part>
<work><work-title>D&#233;j&#224; &amp; vu</work-title></work></score-partwise>`);
  });

  it("writes a changed attribute's special characters as entities", () => {
    const text = edited((root) => {
      root.getElementsByTagName("score-part")[0]!.setAttribute("id", `a"b<c&d\te`);
    });
    expect(text).toContain(`<score-part id="a&quot;b&lt;c&amp;d&#9;e">`);
  });
});
