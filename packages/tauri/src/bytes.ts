/**
 * A binary answer as bytes. Tauri hands one over as an `ArrayBuffer`; where it falls back to
 * `postMessage` (Android, or a webview that blocks its protocol) it may be an array of numbers. Null for
 * anything else.
 */
export function binaryAnswer(value: unknown): Uint8Array | null {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return Uint8Array.from(value);
  }
  return null;
}
