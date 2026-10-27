import { MusicXmlError } from "./errors";

/** How a file's text was encoded, so it is written back the same way. */
export type TextEncoding = { name: "utf-8" | "utf-16le" | "utf-16be"; bom: boolean };

/** The encoding named in the XML declaration (`<?xml … encoding="…"?>`), lower-cased, or null. */
export function declaredEncoding(head: string): string | null {
  const match = /^\s*<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/.exec(head);
  return match ? match[1]!.toLowerCase() : null;
}

/**
 * The text of a MusicXML file and how it was encoded: a byte order mark first, then UTF-16 recognised by
 * the zero bytes of `<?`, then the declaration's encoding. UTF-8 and UTF-16 are read; a file declaring
 * another encoding (Latin-1 from old exporters) is read with it but marked to be written as UTF-8.
 */
export function decodeText(bytes: Uint8Array): { text: string; encoding: TextEncoding; declared: string | null } {
  const [b0, b1, b2] = bytes;
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) {
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes.subarray(3));
    return { text, encoding: { name: "utf-8", bom: true }, declared: declaredEncoding(text) };
  }
  if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0x3c && b1 === 0x00)) {
    const bom = b0 === 0xff;
    const text = new TextDecoder("utf-16le", { ignoreBOM: true }).decode(bytes.subarray(bom ? 2 : 0));
    return { text, encoding: { name: "utf-16le", bom }, declared: declaredEncoding(text) };
  }
  if ((b0 === 0xfe && b1 === 0xff) || (b0 === 0x00 && b1 === 0x3c)) {
    const bom = b0 === 0xfe;
    const text = new TextDecoder("utf-16be", { ignoreBOM: true }).decode(bytes.subarray(bom ? 2 : 0));
    return { text, encoding: { name: "utf-16be", bom }, declared: declaredEncoding(text) };
  }
  const ascii = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const declared = declaredEncoding(ascii);
  if (declared === null || declared === "utf-8" || declared === "utf8") {
    return { text: new TextDecoder("utf-8").decode(bytes), encoding: { name: "utf-8", bom: false }, declared };
  }
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(declared);
  } catch {
    throw new MusicXmlError("unsupported_encoding", { encoding: declared });
  }
  return { text: decoder.decode(bytes), encoding: { name: "utf-8", bom: false }, declared };
}

/** The text as bytes in the encoding it was read with (another declared encoding was turned into UTF-8). */
export function encodeText(text: string, encoding: TextEncoding): Uint8Array {
  if (encoding.name === "utf-8") {
    const body = new TextEncoder().encode(text);
    if (!encoding.bom) return body;
    const bytes = new Uint8Array(body.length + 3);
    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(body, 3);
    return bytes;
  }
  const start = encoding.bom ? 2 : 0;
  const bytes = new Uint8Array(start + text.length * 2);
  const view = new DataView(bytes.buffer);
  const little = encoding.name === "utf-16le";
  if (encoding.bom) view.setUint16(0, 0xfeff, little);
  for (let index = 0; index < text.length; index += 1)
    view.setUint16(start + index * 2, text.charCodeAt(index), little);
  return bytes;
}
