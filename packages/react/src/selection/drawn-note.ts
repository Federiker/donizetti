import { type MappedNote, noteAt, type ScoreMap } from "@donizetti/musicxml";
import type { GraphicalNote, MusicSheet, Note, OpenSheetMusicDisplay, PointF2D } from "opensheetmusicdisplay";

/** OSMD numbers middle C as 48; MIDI as 60. */
const MIDI_OFFSET = 12;

/** Where a note OpenSheetMusicDisplay drew was written: its part, measure, onset, staff, voice and pitch. */
export type DrawnNoteLocation = {
  part: number;
  measure: number;
  /** Whole notes from the start of the measure. */
  onset: number;
  staff: number;
  grace: boolean;
  /** The MIDI key, or undefined for a rest. */
  midi?: number;
};

/**
 * Where a note OSMD parsed was written. OSMD keeps no link to the XML, but its measures are the score's
 * measures in order, its instruments the parts in order and its staves each part's staves in order, and a note's
 * timestamp is in whole notes from the start of its measure, as the score map's onsets are.
 */
export function locationOf(sheet: MusicSheet, note: Note): DrawnNoteLocation | null {
  const staff = note.ParentStaff;
  const instrument = staff?.ParentInstrument;
  const voiceEntry = note.ParentVoiceEntry;
  if (!instrument || !voiceEntry) return null;
  const part = sheet.Instruments.indexOf(instrument);
  const measure = sheet.SourceMeasures.indexOf(note.SourceMeasure);
  if (part < 0 || measure < 0) return null;
  return {
    part,
    measure,
    onset: voiceEntry.Timestamp.RealValue,
    staff: instrument.Staves.indexOf(staff) + 1,
    grace: voiceEntry.IsGrace || note.IsGraceNote,
    midi: note.isRest() || !note.Pitch ? undefined : note.halfTone + MIDI_OFFSET,
  };
}

/** The `<note>` behind a note OSMD drew, found in the maps of the score's parts. */
export function mappedNoteOf(maps: readonly (ScoreMap | null)[], location: DrawnNoteLocation): MappedNote | null {
  const map = maps[location.part];
  if (!map) return null;
  return noteAt(map, location.measure, location.onset, {
    staff: location.staff,
    grace: location.grace,
    midi: location.midi,
  });
}

/**
 * The note drawn nearest a point of the page (client coordinates, as a click's), or null away from the notes:
 * OSMD finds the nearest voice entry (a chord, or a single note or rest), then its note nearest the point.
 */
export function nearestDrawnNote(
  osmd: OpenSheetMusicDisplay,
  point: typeof PointF2D,
  clientX: number,
  clientY: number,
): GraphicalNote | null {
  const graphic = osmd.GraphicSheet;
  if (!graphic) return null;
  const position = graphic.svgToOsmd(graphic.domToSvg(new point(clientX, clientY)));
  return graphic.GetNearestNote(position, new point(0, 0)) ?? null;
}
