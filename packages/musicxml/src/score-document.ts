import { MusicXmlError } from "./errors";
import { isZip, MXL_MEDIA_TYPE, type MxlArchive, newMxl, readMxl, rootFileOf, writeMxl } from "./mxl";
import { hasChanged, type SourceText, stopTracking, trackSource, writeSource } from "./source-text";
import { declaredEncoding, decodeText, encodeText, type TextEncoding } from "./text-encoding";

/** The media type of uncompressed MusicXML. */
export const MUSICXML_MEDIA_TYPE = "application/vnd.recordare.musicxml+xml";

/** How a score is stored: plain MusicXML text, or compressed in a `.mxl` archive. */
export type ScoreFormat = "musicxml" | "mxl";

/**
 * A MusicXML score as a document (decision 3): the parsed XML is the score, edits change it, and it is written
 * back with everything they did not touch exactly as it was written. What the DOM does not keep is kept beside
 * it: the text before the root element (the XML declaration, the DOCTYPE, comments) and after it, where each
 * node was in the text, the encoding and, for `.mxl`, the other files of the archive.
 */
export type ScoreDocument = {
  /** The parsed score; the edit operations change it, and count each change in `revision`. */
  readonly xml: XMLDocument;
  /** The root element, `<score-partwise>`. */
  readonly root: Element;
  /** A number the edit operations raise with each change: undo and redo tell versions apart by it. */
  revision: number;
  /** How it was stored when read. */
  readonly format: ScoreFormat;
  /** What is kept to write it back as it was. */
  readonly source: {
    /** The file's bytes as read: written back as they are while the score is still the text read from them. */
    bytes: Uint8Array;
    /** The text read from those bytes. */
    original: string;
    /** The text before the root element (declaration, DOCTYPE, comments), exactly as read. */
    prologue: string;
    /** The text after the root element's end, exactly as read. */
    epilogue: string;
    /** The text the tree was parsed from, where each node was in it and what has changed since. */
    text: SourceText;
    encoding: TextEncoding;
    /** The `.mxl` archive the score came from, or null for plain MusicXML. */
    archive: MxlArchive | null;
  };
};

function parseXml(text: string): XMLDocument {
  if (typeof DOMParser === "undefined") throw new MusicXmlError("no_dom");
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const error = xml.getElementsByTagName("parsererror")[0];
  if (error) throw new MusicXmlError("not_xml", { detail: (error.textContent ?? "").trim() });
  return xml;
}

/** Where the root element starts and ends in the text: everything before and after it is kept as written. */
function rootSpan(text: string, rootName: string): { start: number; end: number } {
  // Skip the prologue's comments, processing instructions and DOCTYPE (whose internal subset may hold "<").
  let at = 0;
  for (;;) {
    at = text.indexOf("<", at);
    if (at < 0) return { start: 0, end: text.length };
    if (text.startsWith("<?", at)) at = text.indexOf("?>", at) + 2;
    else if (text.startsWith("<!--", at)) at = text.indexOf("-->", at) + 3;
    else if (text.startsWith("<!DOCTYPE", at)) {
      const subset = text.indexOf("[", at);
      const close = text.indexOf(">", at);
      at = subset >= 0 && subset < close ? text.indexOf(">", text.indexOf("]", subset)) + 1 : close + 1;
    } else break;
  }
  const closing = `</${rootName}>`;
  const end = text.lastIndexOf(closing);
  if (end >= 0) return { start: at, end: end + closing.length };
  // A root written `<score-partwise …/>`.
  return { start: at, end: text.indexOf(">", at) + 1 };
}

/** The parsed tree of a score's text, watched for changes. */
function parseScore(text: string): { xml: XMLDocument; prologue: string; epilogue: string; tracked: SourceText } {
  const xml = parseXml(text);
  const root = xml.documentElement;
  const span = rootSpan(text, root.nodeName);
  return {
    xml,
    prologue: text.slice(0, span.start),
    epilogue: text.slice(span.end),
    tracked: trackSource(text, root, span.start, span.end),
  };
}

/**
 * Reads a score from a file's bytes (MusicXML, `.musicxml`, `.xml` or compressed `.mxl`, told apart by their
 * content) or from its text. Throws a `MusicXmlError` when it is not a MusicXML score Donizetti reads.
 */
export function readScore(input: Uint8Array | ArrayBuffer | string): ScoreDocument {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  const archive = isZip(bytes) ? readMxl(bytes) : null;
  // Text given as a string is already decoded; it is written as UTF-8.
  const { text, encoding, declared } =
    typeof input === "string"
      ? { text: input, encoding: { name: "utf-8", bom: false } as const, declared: declaredEncoding(input) }
      : decodeText(archive ? rootFileOf(archive) : bytes);
  const { xml, prologue, epilogue, tracked } = parseScore(text);
  const root = xml.documentElement;
  if (root.localName === "score-timewise") throw new MusicXmlError("timewise_unsupported");
  if (root.localName !== "score-partwise") throw new MusicXmlError("not_musicxml", { root: root.localName });
  return {
    xml,
    root,
    revision: 0,
    format: archive ? "mxl" : "musicxml",
    source: {
      bytes,
      original: text,
      // Text read from another encoding is written back as UTF-8, so the declaration must say so.
      prologue:
        declared && encoding.name === "utf-8" && declared !== "utf-8" && declared !== "utf8"
          ? prologue.replace(/(<\?xml[^>]*\bencoding\s*=\s*["'])[^"']+(["'])/, "$1UTF-8$2")
          : prologue,
      epilogue,
      text: tracked,
      encoding,
      archive,
    },
  };
}

/** Whether the score differs from the file it was read from. */
export function isChanged(document: ScoreDocument): boolean {
  return document.source.text.text !== document.source.original || hasChanged(document.source.text);
}

/**
 * The score's MusicXML text: its prologue and epilogue as read, every untouched node as it was written, and the
 * changed ones written afresh.
 */
export function scoreText(document: ScoreDocument): string {
  return document.source.prologue + writeSource(document.source.text, document.root) + document.source.epilogue;
}

/**
 * The score as a file's bytes, in the format it was read in unless another is asked for. A score not changed
 * since it was read is the very bytes it was read from; a changed one keeps its prologue, its encoding, every
 * untouched node as written and, in a `.mxl` archive, every other file.
 */
export function writeScore(document: ScoreDocument, format: ScoreFormat = document.format): Uint8Array {
  if (format === document.format && !isChanged(document)) return document.source.bytes;
  const score = encodeText(scoreText(document), document.source.encoding);
  if (format === "musicxml") return score;
  return writeMxl(document.source.archive ?? newMxl("score.musicxml"), score);
}

/** The media type of a score written in this format. */
export function mediaTypeOf(format: ScoreFormat): string {
  return format === "mxl" ? MXL_MEDIA_TYPE : MUSICXML_MEDIA_TYPE;
}

/**
 * The document with its score replaced by an earlier text of it (undo and redo keep `scoreText` snapshots):
 * the encoding and archive stay those it was read with. The old tree is no longer watched.
 */
export function restoreScore(document: ScoreDocument, text: string, revision: number): ScoreDocument {
  stopTracking(document.source.text);
  const { xml, prologue, epilogue, tracked } = parseScore(text);
  const restored = { ...document, xml, root: xml.documentElement, revision };
  return { ...restored, source: { ...document.source, prologue, epilogue, text: tracked } };
}
