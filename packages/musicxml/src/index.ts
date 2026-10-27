export { editabilityOf, type Editability, type ReadOnlyReason } from "./editability";
export { MusicXmlError, type MusicXmlErrorCode } from "./errors";
export { isZip, MXL_MEDIA_TYPE, type MxlArchive } from "./mxl";
export {
  EPSILON,
  mapScore,
  midiOf,
  noteAt,
  partsOf,
  type MappedMeasure,
  type MappedNote,
  type NoteQuery,
  type Pitch,
  type ScoreMap,
  type Step,
} from "./score-map";
export {
  MUSICXML_MEDIA_TYPE,
  mediaTypeOf,
  isChanged,
  readScore,
  restoreScore,
  scoreText,
  writeScore,
  type ScoreDocument,
  type ScoreFormat,
} from "./score-document";
export type { TextEncoding } from "./text-encoding";
export { ScoreEditError, type ScoreEditErrorCode } from "./edit/edit-error";
export { edit } from "./edit/xml-edit";
// Editing: lyrics, chord symbols and the score's structure.
export type { ScorePosition } from "./edit/edit-context";
export {
  type Extend,
  type Lyric,
  type LyricInput,
  lyricOf,
  lyricRefusal,
  lyricsOf,
  nextLyricNote,
  previousLyricNote,
  readLyric,
  removeLyric,
  setLyric,
  type Syllabic,
} from "./edit/lyrics";
export {
  type ChordDegree,
  type ChordNote,
  type ChordSymbol,
  chordSymbolText,
  type HarmonyKind,
  harmonyText,
  parseChordSymbol,
  readChordSymbol,
} from "./edit/chord-symbol-text";
export {
  chordSymbolAt,
  nextChordSymbolPosition,
  previousChordSymbolPosition,
  removeChordSymbol,
  setChordSymbol,
} from "./edit/chord-symbols";
export {
  type BeatUnit,
  quarterNotesPerMinute,
  readTempo,
  removeTempo,
  setTempo,
  type Tempo,
  tempoAt,
} from "./edit/tempo";
export {
  type BarlineLocation,
  type BarStyle,
  barlinesOf,
  type MeasureBarlines,
  removeRepeatEnd,
  removeRepeatStart,
  setBarStyle,
  setRepeatEnd,
  setRepeatStart,
} from "./edit/barlines";
export { type Ending, type EndingInput, endingsOf, removeEnding, setEnding } from "./edit/endings";
export {
  type NavigationMark,
  navigationMarkOf,
  navigationMarksOf,
  removeNavigationMark,
  setNavigationMark,
} from "./edit/jumps";
export { appendMeasures, insertMeasures, removeMeasures } from "./edit/measures";
// Editing: notes and rhythm.
export {
  isNoteLength,
  MAX_DOTS,
  NOTE_TYPES,
  noteLengthOf,
  splitLength,
  wholeNotesOf,
  type NoteLength,
  type NoteType,
} from "./edit/lengths";
export { setLength, writeNote, type NoteEdit, type WrittenNote } from "./edit/overwrite";
export { rebeam, updateAccidentals } from "./edit/notation";
export { pitchAbove, pitchForStep, setPitch, transpose } from "./edit/pitch";
export { addChordNote, removeChordNote, toRest } from "./edit/chords";
export { addTiedNote, toggleTie } from "./edit/tie-edit";
export { setKey, setTime } from "./edit/key-time";
export { newScore, type NewScoreOptions } from "./new-score";
