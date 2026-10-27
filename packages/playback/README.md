# @donizetti/playback

The notes of a MusicXML score as played, repeats, endings, D.C. and D.S.
unrolled through OpenSheetMusicDisplay's iterator; MIDI files of them with
the score's tempo map; and the SpessaSynth player, with the host's soundfont,
that plays them and previews single notes.

```ts
import { createScoreEngine, cursorSteps, exportMidi, midiFile, scoreNotes } from "@donizetti/playback";

const timing = scoreNotes(osmd.Sheet);
const steps = cursorSteps(osmd.cursor, timing);
const engine = createScoreEngine({ soundfont: () => loadSoundfontBytes() });
const playback = await engine.load(midiFile(timing), "song");
await playback.play();
const file = exportMidi(osmd.Sheet);
```

The API, the soundfont contract, the AudioWorklet processor's address and the
limits are in [docs/features/playback.md](../../docs/features/playback.md).

- `src/timing.ts`: the notes as played, the tempo map and time signatures.
- `src/cursor.ts`: the cursor's steps, and the step of a note or a time.
- `src/midi-file.ts`: the MIDI file writer and the score's MIDI export.
- `src/engine.ts`: the SpessaSynth engine and the loaded score's playback.
- `src/preview.ts`: single notes sounded apart from the score.

Tests: `bun run --filter @donizetti/playback test` (OSMD under happy-dom,
SpessaSynth faked); the scores in `tests/fixtures/scores` are invented music
from jerome's tests.
