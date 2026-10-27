# Playback

`@donizetti/playback`: the notes of a score as a performer plays them, MIDI
files of them, and the SpessaSynth player that sounds them with the host's
soundfont. It continues jerome's score player
([Score playback](../research/score-playback.md)); `@donizetti/react` draws
the score and moves the cursor, this package says when and what to play.

## The notes as played

`scoreNotes(sheet)` takes a score parsed by OpenSheetMusicDisplay
(`osmd.Sheet`) and walks OSMD's iterator, which follows the road map: repeat
barlines, first and second endings, D.C., D.S., Fine, To Coda and Coda (after
a D.C. or D.S. the repeats are not taken again). Each measure is timed with
its tempo, so the result is:

- `notes`: each note with its time and duration in seconds and its `start`
  and `length` in whole notes of the score as played, its MIDI key,
  velocity, channel and General MIDI program, in the order they sound. A
  tied note sounds once for the whole tie; rests and grace notes are left
  out.
- `duration` (seconds) and `length` (whole notes) of the whole performance.
- `tempos`: the tempo map, the first tempo and each change, in quarter notes
  a minute; a score without one plays at 120.
- `timeSignatures`: the first time signature and each change.
- `secondsAt(playedWholeNotes)`: seconds from the start at a point of the
  performance.

Each pitched part plays on its own channel (0 to 14 counted from 0, leaving
out 9 for drums and 15 for note previews) with the instrument its
`<midi-instrument>` names, as loud as its `<volume>`.
Unpitched percussion (a part on MIDI channel 10, with a `midi-unpitched`
sound, or on a percussion clef) plays on channel 10 with each note's
`midi-unpitched` sound, and is silent without one.

## The cursor

- `cursorSteps(osmd.cursor, timing)`: each step of the cursor through the
  performance (seconds, measure, whole notes into the measure), so the cursor
  follows the music through the repeats. The cursor is left at the start.
- `stepOfNote(steps, measure, inMeasure)`: the step of a written note (a
  click on it), the first time the music plays it; null when its measure is
  never played.
- `stepAt(steps, seconds)`: the step the music has reached at a time.

## MIDI files

`midiFile(score)` writes a standard MIDI file (format 0, one track, 480
ticks a quarter note) from the notes in whole notes, with the tempo map and
time signatures as meta events, each channel's program at the start and the
end of the track at the end of the score (trailing rests included). Its
times in seconds are the timing's, so the player and the cursor agree.
`exportMidi(sheet)` is the whole score as played, for **Export MIDI**
(decision 9): `midiFile(scoreNotes(sheet))`. jerome wrote the notes in
seconds at a fixed 120; Donizetti writes the score's own tempo and bars, so a
sequencer or MuseScore reading the file shows the right tempo and measures.

## The player

```ts
import { createScoreEngine, scoreNotes, midiFile } from "@donizetti/playback";

const engine = createScoreEngine({ soundfont: () => loadSoundfontBytes() });
const playback = await engine.load(midiFile(scoreNotes(osmd.Sheet)), "song");
await playback.play(); // from a click: it resumes the audio context
engine.previewNote(67, { program: 73 }); // a note entered or selected
engine.dispose(); // when the component goes
```

`createScoreEngine(options)` makes the engine; nothing is loaded until it is
first used (`start`, `load` or `previewNote`). It then loads SpessaSynth's
AudioWorklet, makes a `WorkletSynthesizer` with the soundfont and a
`Sequencer` for it. A failed start is forgotten, so the next call tries
again.

- `start()`: starts the engine now, for a host that wants the soundfont
  loaded before the first Play.
- `load(midi, name?)`: a MIDI file loaded paused at its start, as a
  `ScorePlayback`: `play()`, `pause()`, `stop()` (pause and back to the
  start), `seek(seconds)`, `time()` (smoothed for the cursor) and
  `paused()`. One score plays at a time: loading another, or disposing the
  engine, ends the earlier playback, whose `play` then rejects with an
  `AbortError` and which reports paused at 0.
- `previewNote(midi, { velocity?, durationMs?, program?, channel? })`: one
  note, as when the user enters or selects it, apart from the sequencer.
  Defaults: velocity 100, half a second, a piano (program 0), on the preview
  channel (`PREVIEW_CHANNEL`, 15 counted from 0), which no score uses, so a
  preview never changes the score's instruments. (A 17th channel would leave
  all 16 to the score, but SpessaSynth 4.4 reports a new channel's settings
  before the channel and the page throws for each.) With `channel` (0 to 15;
  9 for drums) the
  note sounds on that channel and its program is changed only when `program`
  is given. The same key played again before it ends starts again. A key or
  option out of range rejects with a `RangeError` without starting the
  engine.
- `dispose()`: stops the sound, destroys the synthesiser and closes the
  audio context if the engine made it (a host's context is left open). A
  start under way rejects with an `AbortError`. The next call starts the
  engine again.

### The soundfont

`soundfont: () => Promise<ArrayBuffer | Uint8Array>` (decision 10): the
host's SF2, SF3 or DLS bytes (MuseScore General in the Tauri plugin, a URL in
the web demo). It is called when the engine first starts, while the worklet
loads, and again only after a failed start. SpessaSynth takes the buffer it
is given, so the engine copies the bytes: the host may keep and reuse its
own.

### The processor URL

SpessaSynth's AudioWorklet processor
(`spessasynth_lib/dist/spessasynth_processor.min.js`, 0.6 MB) must be served
as a file. By default the engine imports its address with Vite's `?url`
suffix, through a dynamic import, as jerome does. The released
`@donizetti/playback` (decision 11) keeps that import as it is, an import of
`spessasynth_lib` (a dependency of its own), so the host's Vite does the
work, from the sources in the workspace or from the tarball:

- **Vite builds** emit the processor as an asset, loaded only on first play
  (checked with a Vite 7 app outside the repository, in Chromium; for the
  tarballs, `mise run release:dry` builds a Vite app on them and finds the
  processor among its assets).
- **Vite's dev server** serves it from `node_modules`, but only from inside
  `server.fs.allow`. A host whose workspace contains Donizetti needs nothing;
  a host that links a Donizetti checkout from elsewhere (jerome by `link:` or
  `file:`) adds it, for example
  `server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), "../donizetti"] } }`.
  Otherwise Vite serves the processor itself in place of its address and the
  engine fails with an error that says so.
- **Vite's dev server with the tarballs** pre-bundles dependencies with
  esbuild, which cannot read the `?url` import, so the dev server fails
  before the page loads. The host leaves the package out of pre-bundling,
  `optimizeDeps: { exclude: ["@donizetti/playback"] }`; Vite then serves it
  as built and gives the processor's address (`mise run release:dry` checks
  this too). `processorUrl` alone does not help here: the import is in the
  code esbuild reads.
- **Other bundlers**, or a host that serves the file itself (copied to its
  public folder, for a strict CSP or a CDN), pass `processorUrl`.

The worklet is loaded from the app's own origin, so a Content Security
Policy needs `script-src 'self'` for it.

### The audio context

`context` is optional: by default the engine makes an `AudioContext` when it
starts and closes it when disposed. Browsers start it suspended until a
user's gesture, so `play` and `previewNote` resume it and should be called
from one.

## Limits

- Tempo is taken per measure (OSMD's measure tempo): a change within a
  measure applies from its start; ritardando, accelerando, fermatas and
  swing are not played.
- Dynamics and articulations are not played: every note of a part has the
  part's volume and its written length.
- The fifteenth pitched part and those after it share the fourteenth's
  channel; unpitched percussion without a `midi-unpitched` sound is silent.
- MIDI files are the performance, repeats unrolled, not the written
  structure; time signatures whose beat type is not a power of two are left
  out of them, and a pickup measure moves the bar lines a sequencer shows.
- One score is loaded at a time, and previews share one channel.
