/** Why a file could not be read or written, as a code the interface turns into words (never English text). */
export type MusicXmlErrorCode =
  /** The bytes are not well-formed XML; `params.detail` holds the parser's own message, for developers. */
  | "not_xml"
  /** Well-formed XML, but its root is not a MusicXML score; `params.root` names it. */
  | "not_musicxml"
  /** A `<score-timewise>` file, which Donizetti does not read yet. */
  | "timewise_unsupported"
  /** A compressed `.mxl` file that is not a readable zip archive. */
  | "mxl_not_zip"
  /** A `.mxl` archive without `META-INF/container.xml`, or one naming no score. */
  | "mxl_no_root_file"
  /** A `.mxl` archive whose container names a file it does not hold; `params.path` names it. */
  | "mxl_missing_file"
  /** The file's text encoding is not one Donizetti can read; `params.encoding` names it. */
  | "unsupported_encoding"
  /** No `DOMParser` here (outside a browser or a DOM environment). */
  | "no_dom";

/** A file that could not be read or written: a code and its parameters, for the interface to say in words. */
export class MusicXmlError extends Error {
  readonly code: MusicXmlErrorCode;
  readonly params: Readonly<Record<string, string>>;

  constructor(code: MusicXmlErrorCode, params: Record<string, string> = {}) {
    super(Object.keys(params).length > 0 ? `${code} (${JSON.stringify(params)})` : code);
    this.name = "MusicXmlError";
    this.code = code;
    this.params = params;
  }
}
