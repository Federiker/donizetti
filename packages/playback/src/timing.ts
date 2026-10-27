import type { Instrument, MusicPartManagerIterator, MusicSheet, Note, SubInstrument } from "opensheetmusicdisplay";

import { PREVIEW_CHANNEL } from "./preview";

/**
 * A note to play: when and for how long, in seconds from the start and in whole notes of the score as played
 * (repeats unrolled), which key, how loud, on which channel and instrument.
 */
export type ScoreNote = {
  time: number;
  duration: number;
  /** Where the note starts, in whole notes from the start of the score as played. */
  start: number;
  /** How long it sounds, in whole notes. */
  length: number;
  midi: number;
  velocity: number;
  channel: number;
  program: number;
};

/** A tempo from a point of the score as played (whole notes from the start), in quarter notes a minute. */
export type TempoChange = { start: number; bpm: number };

/** A time signature from a point of the score as played (whole notes from the start), as MusicXML writes it. */
export type TimeSignatureChange = { start: number; beats: number; beatType: number };

export type ScoreTiming = {
  /** The notes in the order they sound (by time, then by key). */
  notes: ScoreNote[];
  /** The length of the score as played, repeats and all, in seconds. */
  duration: number;
  /** The same length in whole notes. */
  length: number;
  /** The tempo map: the first tempo, then each change, as the measures are played. */
  tempos: TempoChange[];
  /** The time signature of the first measure played, then each change. */
  timeSignatures: TimeSignatureChange[];
  /** Seconds from the start at a point of the score as played: whole notes with the repeats unrolled. */
  secondsAt: (playedWholeNotes: number) => number;
};

/** OSMD numbers middle C as 48; MIDI as 60. */
const MIDI_OFFSET = 12;
/** General MIDI's drums: channel 10, numbered 9 from 0. */
const PERCUSSION_CHANNEL = 9;
/** OSMD's instrument for a part on MIDI channel 10 (`MidiInstrument.Percussion`). */
const PERCUSSION_INSTRUMENT = 128;
/** OSMD's percussion clef (`ClefEnum.percussion`). */
const PERCUSSION_CLEF = 3;
/** A walk through a score that never ends (a broken repeat) stops after this many steps. */
export const MAX_STEPS = 1_000_000;
/** A score without a tempo plays at MusicXML's (and MIDI's) default. */
const DEFAULT_TEMPO = 120;

/**
 * The channel of the score's nth instrument: 0 to 14, leaving out channel 10 (9), which General MIDI keeps for
 * drums, and channel 16 (15), which note previews sound on.
 */
function channelOf(index: number): number {
  const channel = index < PERCUSSION_CHANNEL ? index : index + 1;
  return Math.min(channel, PREVIEW_CHANNEL - 1);
}

function velocityOf(volume: number): number {
  return Math.max(1, Math.min(127, Math.round(100 * (volume > 0 ? volume : 1))));
}

/**
 * Whether a part is unpitched percussion: on MIDI channel 10, with a `midi-unpitched` sound, or written on a
 * percussion clef.
 */
function isPercussion(sheet: MusicSheet, instrument: Instrument): boolean {
  if (instrument.MidiInstrumentId === PERCUSSION_INSTRUMENT) return true;
  if (instrument.SubInstruments.some((sound) => sound.fixedKey > 0)) return true;
  const first = sheet.SourceMeasures[0]?.FirstInstructionsStaffEntries ?? [];
  return instrument.Staves.some((staff) =>
    (first[sheet.Staves.indexOf(staff)]?.Instructions ?? []).some(
      (instruction) => (instruction as { ClefType?: number }).ClefType === PERCUSSION_CLEF,
    ),
  );
}

/**
 * The sound of a percussion note: the part's instrument the note names (`<instrument id>`), else the part's
 * first, with its `midi-unpitched` (1 to 128 in MusicXML, which OSMD keeps as written), or none.
 */
function percussionKey(instrument: Instrument, note: Note): { midi: number; sound: SubInstrument } | null {
  const sounds = instrument.SubInstruments;
  const sound = sounds.find((candidate) => candidate.idString === note.PlaybackInstrumentId) ?? sounds[0];
  if (!sound || sound.fixedKey < 1 || sound.fixedKey > 128) return null;
  return { midi: sound.fixedKey - 1, sound };
}

/** A measure as it is played: where it starts, in whole notes as played and in seconds, its tempo and length. */
type Pass = { whole: number; seconds: number; tempo: number; length: number };

/**
 * The notes of a score parsed by OpenSheetMusicDisplay, as a performer plays them: OSMD's iterator follows
 * the road map (repeat barlines, first and second endings, D.C., D.S., Fine, To Coda and Coda; after a D.C.
 * or D.S. the repeats are not taken again), and each measure is timed with its tempo. A tied note sounds once
 * for the whole tie; rests and grace notes are left out. Each pitched part plays on its own channel with the
 * instrument its MusicXML names, as loud as its volume; unpitched percussion plays on channel 10 with each
 * note's `midi-unpitched` sound, and is silent without one. The tempo map and time signatures come with the
 * notes, so a MIDI file of them keeps the score's own tempo and bars.
 */
export function scoreNotes(sheet: MusicSheet): ScoreTiming {
  const fallbackTempo = sheet.DefaultStartTempoInBpm > 0 ? sheet.DefaultStartTempoInBpm : DEFAULT_TEMPO;
  const passes: Pass[] = [];
  const tempos: TempoChange[] = [];
  const timeSignatures: TimeSignatureChange[] = [];
  const secondsAt = (whole: number): number => {
    let low = 0;
    let high = passes.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (passes[middle]!.whole <= whole) low = middle;
      else high = middle - 1;
    }
    const pass = passes[low] ?? { whole: 0, seconds: 0, tempo: fallbackTempo };
    return pass.seconds + ((whole - pass.whole) * 240) / pass.tempo;
  };

  const instruments = sheet.Instruments;
  const percussion = new Map(instruments.map((instrument) => [instrument, isPercussion(sheet, instrument)]));
  const pending: Omit<ScoreNote, "time" | "duration">[] = [];
  const iterator: MusicPartManagerIterator = sheet.MusicPartManager.getIterator();
  let measureIndex = -1;
  for (let steps = 0; !iterator.EndReached && steps < MAX_STEPS; steps += 1, iterator.moveToNext()) {
    const measure = iterator.CurrentMeasure;
    if (!measure) continue;
    if (iterator.CurrentMeasureIndex !== measureIndex || iterator.JumpOccurred || passes.length === 0) {
      measureIndex = iterator.CurrentMeasureIndex;
      const whole = iterator.CurrentEnrolledTimestamp.RealValue - iterator.CurrentRelativeInMeasureTimestamp.RealValue;
      const previous = passes.at(-1);
      // Only a new pass of a measure starts a new entry: a jump within the same measure is the same pass.
      if (!previous || whole >= previous.whole + previous.length - 1e-9) {
        const tempo = measure.TempoInBPM > 0 ? measure.TempoInBPM : fallbackTempo;
        passes.push({
          whole,
          seconds: previous ? previous.seconds + ((whole - previous.whole) * 240) / previous.tempo : 0,
          tempo,
          length: measure.Duration.RealValue,
        });
        if (tempos.at(-1)?.bpm !== tempo) tempos.push({ start: whole, bpm: tempo });
        const signature = measure.ActiveTimeSignature;
        const last = timeSignatures.at(-1);
        if (signature && (last?.beats !== signature.Numerator || last.beatType !== signature.Denominator))
          timeSignatures.push({ start: whole, beats: signature.Numerator, beatType: signature.Denominator });
      }
    }
    const passStart = passes.at(-1)!.whole;
    for (const voice of iterator.CurrentVoiceEntries) {
      if (voice.IsGrace) continue;
      const instrument = voice.ParentSourceStaffEntry.ParentStaff.ParentInstrument;
      const index = instruments.indexOf(instrument);
      if (index < 0) continue;
      const drums = percussion.get(instrument) === true;
      for (const note of voice.Notes) {
        if (note.isRest() || !note.Pitch) continue;
        const tie = note.NoteTie;
        if (tie && tie.StartNote !== note) continue;
        const length = (tie ? tie.Duration : note.Length).RealValue;
        if (length <= 0) continue;
        const start = passStart + voice.Timestamp.RealValue;
        if (drums) {
          const key = percussionKey(instrument, note);
          if (!key) continue;
          pending.push({
            start,
            length,
            midi: key.midi,
            velocity: velocityOf(key.sound.volume),
            channel: PERCUSSION_CHANNEL,
            program: 0,
          });
          continue;
        }
        const program = instrument.MidiInstrumentId;
        if (program < 0 || program > 127) continue;
        pending.push({
          start,
          length,
          midi: note.halfTone + MIDI_OFFSET,
          velocity: velocityOf(instrument.Volume),
          channel: channelOf(index),
          program,
        });
      }
    }
  }
  const last = passes.at(-1);
  const duration = last ? last.seconds + (last.length * 240) / last.tempo : 0;
  const length = last ? last.whole + last.length : 0;
  const notes = pending.map((note) => {
    const time = secondsAt(note.start);
    return { time, duration: secondsAt(note.start + note.length) - time, ...note };
  });
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  return { notes, duration, length, tempos, timeSignatures, secondsAt };
}
