/** Why an edit could not be made, as a code with parameters for the interface to say in words. */
export type ScoreEditErrorCode =
  /** The score has several parts, staves or voices (decision 4): `editabilityOf` says why. */
  | "not_editable"
  /** The note, measure or element given is not in this score's part. */
  | "not_in_score";

/** An edit the score cannot take: nothing was changed. */
export class ScoreEditError extends Error {
  readonly code: ScoreEditErrorCode;
  readonly params: Readonly<Record<string, string>>;

  constructor(code: ScoreEditErrorCode, params: Record<string, string> = {}) {
    super(Object.keys(params).length > 0 ? `${code} (${JSON.stringify(params)})` : code);
    this.name = "ScoreEditError";
    this.code = code;
    this.params = params;
  }
}
