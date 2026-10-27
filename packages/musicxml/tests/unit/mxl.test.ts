import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { MusicXmlError, readScore } from "../../src";
import { readMxl, writeMxl } from "../../src/mxl";
import { fixture } from "../fixtures";

const SCORE = strToU8('<score-partwise version="4.0"><part-list/></score-partwise>');
const container = (rootfiles: string) =>
  strToU8(`<?xml version="1.0"?><container><rootfiles>${rootfiles}</rootfiles></container>`);

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof MusicXmlError) return error.code;
    throw error;
  }
  return undefined;
}

describe(".mxl archives", () => {
  it("finds the score MuseScore names in its container", () => {
    const archive = readMxl(fixture("musescore/lead-sheet.mxl"));
    expect(archive.rootPath).toMatch(/\.(musicxml|xml)$/);
    expect(archive.files.some((file) => file.path === "META-INF/container.xml")).toBe(true);
  });

  it("skips root files that are not scores, and accepts one with no media type", () => {
    const bytes = zipSync({
      "META-INF/container.xml": container(
        '<rootfile full-path="cover.pdf" media-type="application/pdf"/><rootfile full-path="song.xml"/>',
      ),
      "song.xml": SCORE,
      "cover.pdf": strToU8("%PDF"),
    });
    expect(readMxl(bytes).rootPath).toBe("song.xml");
  });

  it("keeps every other file and puts an uncompressed mimetype first when writing", () => {
    const bytes = zipSync({
      "META-INF/container.xml": container('<rootfile full-path="song.xml"/>'),
      "song.xml": SCORE,
      "image.png": new Uint8Array([1, 2, 3]),
    });
    const written = writeMxl(readMxl(bytes), strToU8("<score-partwise/>"));
    // A stored entry: compression method 0 in the first local header, and "mimetype" as its name.
    expect(written[8]).toBe(0);
    expect(new TextDecoder().decode(written.subarray(30, 38))).toBe("mimetype");
    const again = readMxl(written);
    expect(again.files.map((file) => file.path)).toEqual([
      "mimetype",
      "META-INF/container.xml",
      "song.xml",
      "image.png",
    ]);
    expect([...again.files.find((file) => file.path === "image.png")!.bytes]).toEqual([1, 2, 3]);
  });

  it("refuses broken archives, with a code", () => {
    expect(codeOf(() => readScore(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])))).toBe("mxl_not_zip");
    expect(codeOf(() => readMxl(zipSync({ "song.xml": SCORE })))).toBe("mxl_no_root_file");
    const missing = zipSync({ "META-INF/container.xml": container('<rootfile full-path="gone.xml"/>') });
    expect(codeOf(() => readMxl(missing))).toBe("mxl_missing_file");
  });
});
