import { describe, expect, it } from "vitest";

import { editabilityOf, readScore } from "../../src";
import { fixture, score } from "../fixtures";

describe("editabilityOf", () => {
  it("lets lead sheets be edited, whatever wrote them", () => {
    for (const path of ["invented/lead-sheet.musicxml", "musescore/lead-sheet.musicxml", "musescore/lead-sheet.mxl"]) {
      expect(editabilityOf(readScore(fixture(path)).root)).toEqual({ editable: true });
    }
  });

  it("gives every reason a score can only be drawn and played", () => {
    const twoParts = score(
      "<attributes><staves>2</staves></attributes><note><rest/><duration>1</duration><voice>1</voice></note><backup><duration>1</duration></backup><note><rest/><duration>1</duration><voice>2</voice></note>",
    ).replace("</part></score-partwise>", `</part><part id="P2"/></score-partwise>`);
    expect(editabilityOf(readScore(twoParts).root)).toEqual({
      editable: false,
      reasons: [
        { code: "several_parts", params: { parts: 2 } },
        { code: "several_staves", params: { staves: 2 } },
        { code: "several_voices", params: { voices: 2 } },
        { code: "backup_or_forward" },
      ],
    });
    expect(editabilityOf(readScore(`<score-partwise version="4.0"/>`).root)).toEqual({
      editable: false,
      reasons: [{ code: "no_parts" }],
    });
  });
});
