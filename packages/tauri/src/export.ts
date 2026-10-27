import { call } from "./call";

/**
 * Writes an export the app made itself (a MIDI file's bytes, an SVG page's text) to `path`, in one rename
 * as a score is. There is no hash guard: whatever is at `path` is replaced, so ask first (a save dialog
 * does). The bytes are the request's raw body and the path travels in a header, percent-encoded, as in
 * `writeScore`.
 *
 * @throws DonizettiPluginError `write_failed` (with `path` and `detail`) or `invalid_request`; the file is
 * as it was after either.
 */
export async function writeExport(path: string, content: Uint8Array | string): Promise<void> {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  await call("write_export", bytes, { headers: { "Donizetti-Path": encodeURIComponent(path) } });
}
