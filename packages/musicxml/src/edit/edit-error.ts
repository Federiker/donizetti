/** Why an edit could not be made, as a code with parameters for the interface to say in words. */
export type ScoreEditErrorCode =
  /** The score has several parts, staves or voices (decision 4): `editabilityOf` says why. */
  | "not_editable"
  /** The note, measure or element given is not in this score's part. */
  | "not_in_score"
  // Lyrics, chord symbols and the score's structure.
  /** Lyrics go on notes: not on a rest, a grace note or a note tied from the one before (`params.reason`). */
  | "lyric_not_allowed"
  /** A syllable with no text: removing the lyric is another operation. */
  | "empty_lyric"
  /** The note has no lyric in the verse given (`params.verse`). */
  | "no_lyric"
  /** Text that is not a chord symbol Donizetti reads (`params.text`): it is refused, not guessed at. */
  | "chord_symbol_unreadable"
  /** No chord symbol at the moment given. */
  | "no_chord_symbol"
  /** A metronome mark needs a beat unit and a positive number of beats a minute (`params.reason`). */
  | "invalid_tempo"
  /** No metronome mark at the moment given. */
  | "no_tempo"
  /** The measure has no repeat sign there to remove (`params.direction`: forward or backward). */
  | "no_repeat"
  /** An ending needs measures in order and numbers from 1 (`params.reason`). */
  | "invalid_ending"
  /** The measures given already have an ending, which would overlap the new one. */
  | "ending_overlaps"
  /** The measure is not under an ending. */
  | "no_ending"
  /** The measure has no such navigation mark (`params.mark`). */
  | "no_navigation_mark"
  /** A number of measures below one (`params.count`). */
  | "invalid_count"
  /** Every measure of the part would go: a part keeps at least one. */
  | "last_measure"
  /** New measures take their length from the time signature, and there is none in force. */
  | "no_time_signature"
  /** A whole-measure rest that the divisions in force cannot write (`params.divisions`, `params.length`). */
  | "length_not_in_divisions"
  // Notes and rhythm.
  /** A note length that is not one of MusicXML's types with up to four dots; `params.length` says what was given. */
  | "invalid_length"
  /** A pitch MusicXML and MIDI cannot write (a step other than A to G, an octave outside 0 to 9, a MIDI key outside 0 to 127). */
  | "invalid_pitch"
  /**
   * Music the edit would have to write in tuplets (`<time-modification>`), which notes and rhythm do not edit
   * yet, or a length no plain note, dotted or tied, can take; `params.measure` is the measure's index.
   */
  | "unsupported_rhythm"
  /** The edit needs a pitched note and was given a rest. */
  | "not_a_note"
  /** The edit needs a note of a chord (a note with others sounding with it). */
  | "not_a_chord"
  /** The chord already has a note of this pitch. */
  | "duplicate_pitch"
  /** No next note of the same pitch to tie to. */
  | "no_tie_partner"
  /** A key signature other than −7 to 7 fifths. */
  | "invalid_key"
  /** A time signature other than a positive whole number of beats over a power of two up to 1024. */
  | "invalid_time"
  /**
   * The music cannot be put into new bars without a decision that is the user's: `params.reason` is `pickup`
   * (an incomplete measure inside), `key` (a key change that would fall inside a new bar), `barline` (a repeat,
   * ending or other barline that would) or `divisions` (the divisions change inside); `params.measure` says where.
   */
  | "cannot_rebar";

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
