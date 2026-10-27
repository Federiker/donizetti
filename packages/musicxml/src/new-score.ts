/** What a new lead sheet starts with (decision 19). */
export type NewScoreOptions = {
  title?: string;
  composer?: string;
  /** The key signature in fifths, −7 to 7; C major (0) by default. */
  fifths?: number;
  /** The time signature; 4/4 by default. */
  beats?: number;
  beatType?: number;
  /** A pickup measure of one beat before the first full measure; none by default. */
  pickup?: boolean;
  /** Quarter notes a minute, written as a metronome mark; 120 by default. */
  tempo?: number;
  /** Full measures; 16 by default. */
  measures?: number;
};

const NOTE_TYPES: Record<number, string> = { 1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "16th", 32: "32nd" };

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Throws a `RangeError` naming the option that a score cannot be made with. */
function check(condition: boolean, option: string) {
  if (!condition) throw new RangeError(`newScore: ${option}`);
}

/**
 * A new lead sheet's MusicXML (decision 19): one part, "Melody", in the treble clef with a piano sound (General
 * MIDI program 1), the key, time and tempo asked for, an optional one-beat pickup, and whole-measure rests,
 * the last measure closed with a final barline. Laid out as MuseScore lays out its files, two spaces a level.
 * Read it with `readScore` as any file.
 */
export function newScore(options: NewScoreOptions = {}): string {
  const { title = "", composer = "", fifths = 0, beats = 4, beatType = 4, pickup = false, tempo = 120 } = options;
  const count = options.measures ?? 16;
  check(Number.isInteger(fifths) && fifths >= -7 && fifths <= 7, "fifths");
  check(Number.isInteger(beats) && beats >= 1 && beats <= 99, "beats");
  check(beatType in NOTE_TYPES, "beatType");
  check(Number.isInteger(count) && count >= 1 && count <= 999, "measures");
  check(Number.isFinite(tempo) && tempo > 0 && tempo <= 1000, "tempo");

  // Divisions of a quarter note such that a beat is a whole number of them.
  const divisions = Math.max(1, beatType / 4);
  const beat = (divisions * 4) / beatType;
  const full = beats * beat;
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>`,
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">`,
    `<score-partwise version="4.0">`,
  ];
  if (title) lines.push("  <work>", `    <work-title>${escapeXml(title)}</work-title>`, "  </work>");
  lines.push("  <identification>");
  if (composer) lines.push(`    <creator type="composer">${escapeXml(composer)}</creator>`);
  lines.push(
    "    <encoding>",
    "      <software>Donizetti</software>",
    `      <encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date>`,
    "    </encoding>",
    "  </identification>",
    "  <part-list>",
    `    <score-part id="P1">`,
    "      <part-name>Melody</part-name>",
    `      <score-instrument id="P1-I1">`,
    "        <instrument-name>Piano</instrument-name>",
    "      </score-instrument>",
    `      <midi-instrument id="P1-I1">`,
    "        <midi-channel>1</midi-channel>",
    "        <midi-program>1</midi-program>",
    "      </midi-instrument>",
    "    </score-part>",
    "  </part-list>",
    `  <part id="P1">`,
  );

  const measures = pickup ? count + 1 : count;
  for (let index = 0; index < measures; index += 1) {
    const isPickup = pickup && index === 0;
    const number = pickup ? index : index + 1;
    lines.push(isPickup ? `    <measure number="0" implicit="yes">` : `    <measure number="${number}">`);
    if (index === 0) {
      lines.push(
        "      <attributes>",
        `        <divisions>${divisions}</divisions>`,
        "        <key>",
        `          <fifths>${fifths}</fifths>`,
        "        </key>",
        "        <time>",
        `          <beats>${beats}</beats>`,
        `          <beat-type>${beatType}</beat-type>`,
        "        </time>",
        "        <clef>",
        "          <sign>G</sign>",
        "          <line>2</line>",
        "        </clef>",
        "      </attributes>",
        `      <direction placement="above">`,
        "        <direction-type>",
        `          <metronome parentheses="no">`,
        "            <beat-unit>quarter</beat-unit>",
        `            <per-minute>${tempo}</per-minute>`,
        "          </metronome>",
        "        </direction-type>",
        `        <sound tempo="${tempo}"/>`,
        "      </direction>",
      );
    }
    if (isPickup) {
      lines.push(
        "      <note>",
        "        <rest/>",
        `        <duration>${beat}</duration>`,
        "        <voice>1</voice>",
        `        <type>${NOTE_TYPES[beatType]}</type>`,
        "      </note>",
      );
    } else {
      lines.push(
        "      <note>",
        `        <rest measure="yes"/>`,
        `        <duration>${full}</duration>`,
        "        <voice>1</voice>",
        "      </note>",
      );
    }
    if (index === measures - 1) {
      lines.push(`      <barline location="right">`, "        <bar-style>light-heavy</bar-style>", "      </barline>");
    }
    lines.push("    </measure>");
  }
  lines.push("  </part>", "</score-partwise>", "");
  return lines.join("\n");
}
