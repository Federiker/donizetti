import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A fixture's bytes, exactly as stored (see fixtures/README.md). */
export function fixture(path: string): Uint8Array {
  return new Uint8Array(readFileSync(join(import.meta.dirname, "fixtures", path)));
}

/** A fixture's text, read as UTF-8. */
export function fixtureText(path: string): string {
  return new TextDecoder().decode(fixture(path));
}

/** A small score in one part, its measures' content given as XML (one string a measure). */
export function score(...measures: string[]): string {
  const body = measures.map((content, index) => `<measure number="${index + 1}">${content}</measure>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}
