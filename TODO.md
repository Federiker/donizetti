# Donizetti roadmap

This is the shared, persistent checklist for human contributors and Claude.
Read it at the start of each task and update relevant items before finishing.
Add newly discovered work here; split large tasks into actionable items as
implementation approaches. Check an item only when its stated outcome is
implemented and verified, and do not check off an entire feature for a stub.

Write a piece of work with several parts as a short list of slices, which may
be split, merged or reordered as the work shows what it needs. Tick a slice
when it is done; when the whole item is done and documented in its feature
document, remove it from here. Owner decisions belong in the docs
([development.md](docs/development.md)), with a short work item here. Checks
that need the native window or real-world files go in **Verification**.

Sections: **Now**, **Verification**, **Later**, **Awaiting owner decisions**.

## Now

The first round (owner decisions, 27 October 2026; see
[development.md](docs/development.md#decisions)), in order:

- [x] Foundation: the workspaces, the tools and hooks, CI, the docs, the
  licence.
- [x] Reading and writing (`@donizetti/musicxml`):
  - [x] Parse and serialise with the browser's DOM, the text written back
    exactly as read when nothing changed (declaration, DOCTYPE, comments,
    vendor elements); `partwise` only, `timewise` refused with a reason.
  - [x] `.mxl`: `META-INF/container.xml`, the root file, other files in the
    archive kept; written back as `.mxl`.
  - [x] Errors as codes with parameters, not English text.
  - [x] Editability: one part, one staff, one voice (no `backup`/`forward`
    beyond what one voice allows), with the reason when not.
- [x] The score map: measures, notes and their onsets in the part; a note
  found from a measure and a time in it (the click-to-XML mapping).
- [ ] The edit operations, each tested on plain XML, with a round trip proving
  the rest of the file is unchanged:
  - [ ] Pitch (step, alter, octave; the accidental against the key), length
    and dots, rest, insert and delete with the bar refilled, notes split at
    the barline with ties.
  - [ ] Ties (`<tie>` and `<notations><tied>`), beams written by beat.
  - [ ] Lyrics (syllabic, extend, verses), chord symbols (`<harmony>`).
  - [ ] Key, time, tempo, repeat and ending barlines, measures added and
    removed.
- [ ] Playback (`@donizetti/playback`): jerome's score timing and MIDI file,
  the SpessaSynth player with the soundfont from the host, MIDI export.
- [ ] The viewer (`@donizetti/react`): drawing, Play/Pause/Stop and the
  cursor, a click to move the music there, the read-only notice, strings and
  theming (light, dark, forced colours).
- [ ] Selection: the note under the pointer found in the XML and drawn
  selected, proven on real MuseScore, Sibelius and Finale exports
  (public-domain or invented music only).
- [ ] Keyboard entry, MuseScore 4's keys, every key in `keyboard/shortcuts.ts`.
- [ ] Lyrics entry and chord-symbol entry.
- [ ] The palette and toolbar: key, time, tempo, repeats, endings.
- [ ] Undo and redo; Save; exports: MIDI, SVG, PDF.
- [ ] Rust: `donizetti_soundfonts` (MuseScore General, checked),
  `donizetti_pdf` (SVG pages to PDF) and `tauri-plugin-donizetti` (files,
  soundfont, PDF, permissions); `@donizetti/tauri`, its typed client.
- [ ] The demo app: browser and Tauri window, open and save, the soundfont;
  Playwright tests.
- [ ] The Claude workflow: the `donizetti-` skills and the implementer agent.

## Verification

- [ ] The XML round trip and the timings in WebView2, WKWebView and
  WebKitGTK.
- [ ] Real exports from MuseScore, Sibelius, Finale and Dorico (plain and
  `.mxl`) opened, played, edited and saved, then read back by MuseScore.
- [ ] Sound in the native window on Windows, macOS and Linux (CSP,
  AudioWorklet).

## Later

- ABC text input for new sheets or selected bars (an ABC subset; see
  [Score editing](docs/research/score-editing.md#typed-notation)).
- More than one staff (piano, multi-part), then more than one voice.
- Transposition, parts, page and system layout settings.
- Publishing to npm and crates.io (decision 11).
- Replacing jerome's `ScoreView` with `<ScoreEditor>`.

## Awaiting owner decisions

None yet.
