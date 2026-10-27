import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type MusicSheet, OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { vi } from "vitest";

/** A score read by OpenSheetMusicDisplay as the component reads it (drawing needs a real browser). */
export async function sheetOf(xml: string): Promise<MusicSheet> {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.append(container);
  const osmd = new OpenSheetMusicDisplay(container, { autoResize: false, backend: "svg" });
  await osmd.load(xml);
  return osmd.Sheet;
}

/** A score from `tests/fixtures/scores`. */
export function sheet(file: string): Promise<MusicSheet> {
  return sheetOf(readFileSync(join(import.meta.dirname, "fixtures/scores", file), "utf8"));
}

/** The events of a format-0 MIDI file as [tick, status, ...data], meta events as [tick, 0xff, type, ...data]. */
export function midiEvents(bytes: Uint8Array): number[][] {
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "MThd" || String.fromCharCode(...bytes.slice(14, 18)) !== "MTrk")
    throw new Error("Not a format-0 MIDI file");
  const events: number[][] = [];
  let at = 22;
  let tick = 0;
  while (at < bytes.length) {
    let delta = 0;
    let byte: number;
    do {
      byte = bytes[at++]!;
      delta = (delta << 7) | (byte & 0x7f);
    } while (byte & 0x80);
    tick += delta;
    const status = bytes[at]!;
    const size = status === 0xff ? 3 + bytes[at + 2]! : (status & 0xf0) === 0xc0 ? 2 : 3;
    events.push(
      status === 0xff
        ? [tick, 0xff, bytes[at + 1]!, ...bytes.slice(at + 3, at + size)]
        : [tick, ...bytes.slice(at, at + size)],
    );
    at += size;
  }
  return events;
}
