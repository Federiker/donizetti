import { describe, expect, it } from "vitest";

import { isChanged, MusicXmlError, readScore, restoreScore, scoreText, writeScore } from "../../src";
import { fixture, fixtureText, score } from "../fixtures";

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof MusicXmlError) return error.code;
    throw error;
  }
  return undefined;
}

describe("readScore and writeScore", () => {
  it("writes an unchanged score back as the very bytes it was read from", () => {
    for (const path of ["invented/lead-sheet.musicxml", "musescore/lead-sheet.musicxml", "musescore/lead-sheet.mxl"]) {
      const bytes = fixture(path);
      expect(writeScore(readScore(bytes))).toBe(bytes);
    }
  });

  it("serialises a score to the text it was read from, prologue, comments and layout included", () => {
    for (const path of ["invented/lead-sheet.musicxml", "musescore/lead-sheet.musicxml"]) {
      const document = readScore(fixture(path));
      expect(scoreText(document)).toBe(fixtureText(path));
    }
  });

  it("keeps everything an edit does not touch", () => {
    const text = fixtureText("musescore/lead-sheet.musicxml");
    const document = readScore(text);
    const step = document.root.getElementsByTagName("step")[0]!;
    step.textContent = "A";
    document.revision += 1;
    const written = new TextDecoder().decode(writeScore(document));
    expect(written).toBe(text.replace("<step>G</step>", "<step>A</step>"));
  });

  it("tells MusicXML text, bytes and archives apart by their content", () => {
    expect(readScore(fixtureText("invented/lead-sheet.musicxml")).format).toBe("musicxml");
    expect(readScore(fixture("musescore/lead-sheet.mxl")).format).toBe("mxl");
    const bytes = fixture("invented/lead-sheet.musicxml");
    expect(
      readScore(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer).format,
    ).toBe("musicxml");
  });

  it("writes a changed .mxl score back into its archive, and plain MusicXML out of it", () => {
    const document = readScore(fixture("musescore/lead-sheet.mxl"));
    document.root.getElementsByTagName("work-title")[0]!.textContent = "Another Tune";
    document.revision += 1;
    const again = readScore(writeScore(document));
    expect(again.format).toBe("mxl");
    expect(again.root.getElementsByTagName("work-title")[0]!.textContent).toBe("Another Tune");
    // MuseScore writes no mimetype file; one is added first, as the specification asks.
    expect(again.source.archive!.files.map((file) => file.path)).toEqual([
      "mimetype",
      ...document.source.archive!.files.map((file) => file.path),
    ]);
    const plain = readScore(writeScore(document, "musicxml"));
    expect(plain.format).toBe("musicxml");
    expect(plain.root.getElementsByTagName("work-title")[0]!.textContent).toBe("Another Tune");
  });

  it("puts plain MusicXML into a new archive when asked for .mxl", () => {
    const document = readScore(score("<note><rest/><duration>4</duration></note>"));
    const archived = readScore(writeScore(document, "mxl"));
    expect(archived.format).toBe("mxl");
    expect(archived.source.archive!.files[0]!.path).toBe("mimetype");
    expect(archived.source.archive!.rootPath).toBe("score.musicxml");
  });

  it("refuses what it cannot read, with a code", () => {
    expect(codeOf(() => readScore("<score-partwise><part>"))).toBe("not_xml");
    expect(codeOf(() => readScore("<html/>"))).toBe("not_musicxml");
    expect(codeOf(() => readScore('<score-timewise version="4.0"/>'))).toBe("timewise_unsupported");
  });

  it("keeps a DOCTYPE with an internal subset, and comments after the root", () => {
    const text = `<?xml version="1.0"?>\n<!DOCTYPE score-partwise [\n  <!ENTITY x "<y>">\n]>\n<!-- before -->\n<score-partwise version="4.0"><part-list/></score-partwise>\n<!-- after -->\n`;
    const document = readScore(text);
    document.revision += 1;
    expect(scoreText(document)).toBe(text);
  });

  it("restores an earlier text of the score, keeping how it is stored", () => {
    const document = readScore(fixture("musescore/lead-sheet.mxl"));
    const before = scoreText(document);
    document.root.getElementsByTagName("work-title")[0]!.textContent = "Changed";
    const changed = scoreText(document);
    const restored = restoreScore(document, before, 2);
    expect(restored.revision).toBe(2);
    expect(restored.format).toBe("mxl");
    expect(scoreText(restored)).toBe(before);
    expect(isChanged(restored)).toBe(false);
    expect(writeScore(restored)).toBe(document.source.bytes);
    // A restored text other than the file read is a change, even before anything is edited in it.
    const redone = restoreScore(restored, changed, 3);
    expect(isChanged(redone)).toBe(true);
    expect(readScore(writeScore(redone)).root.getElementsByTagName("work-title")[0]!.textContent).toBe("Changed");
  });
});
