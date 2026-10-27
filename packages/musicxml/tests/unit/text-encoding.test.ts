import { describe, expect, it } from "vitest";

import { MusicXmlError, readScore, scoreText, writeScore } from "../../src";
import { decodeText, encodeText } from "../../src/text-encoding";

const SCORE =
  '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Café</part-name></score-part></part-list></score-partwise>';

describe("text encodings", () => {
  it("reads and writes UTF-16 in both byte orders, with and without a byte order mark", () => {
    for (const name of ["utf-16le", "utf-16be"] as const) {
      for (const bom of [true, false]) {
        const text = `<?xml version="1.0" encoding="UTF-16"?>${SCORE}`;
        const bytes = encodeText(text, { name, bom });
        const decoded = decodeText(bytes);
        expect(decoded.text).toBe(text);
        expect(decoded.encoding).toEqual({ name, bom });
        const document = readScore(bytes);
        document.revision += 1;
        expect(writeScore(document)).toEqual(bytes);
      }
    }
  });

  it("keeps a UTF-8 byte order mark", () => {
    const bytes = encodeText(SCORE, { name: "utf-8", bom: true });
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const document = readScore(bytes);
    document.revision += 1;
    expect(writeScore(document)).toEqual(bytes);
  });

  it("reads Latin-1 and writes UTF-8, saying so in the declaration", () => {
    const text = `<?xml version="1.0" encoding="ISO-8859-1"?>${SCORE}`;
    const bytes = new Uint8Array([...text].map((character) => character.charCodeAt(0)));
    const document = readScore(bytes);
    expect(document.root.getElementsByTagName("part-name")[0]!.textContent).toBe("Café");
    expect(scoreText(document)).toBe(text.replace("ISO-8859-1", "UTF-8"));
  });

  it("refuses an encoding it does not know", () => {
    const bytes = new TextEncoder().encode(`<?xml version="1.0" encoding="x-unknown"?>${SCORE}`);
    expect(() => readScore(bytes)).toThrow(MusicXmlError);
  });
});
