# Code organisation and tooling

How the code is organised and checked, and the owner decisions behind it.
What each part does is in [features/](features/); setup is in the
[README](../README.md).

## Decisions

Owner decisions, 27 October 2026, for the first round (slices in the
[TODO](../TODO.md)):

1. **Licence: CC0-1.0**, as for jespersen: a public-domain dedication, so
   anyone may use, change and sell Donizetti without conditions. Everything the
   packages and crates bundle or link must therefore be under a **permissive
   licence** (MIT, BSD, Apache-2.0, ISC, Zlib, CC0 and the like): no GPL, LGPL,
   AGPL or MPL code of our own choosing. `cargo deny` (deny.toml) checks the
   crates and `scripts/licences.ts` the npm packages; a new licence needs the
   owner's approval. MuseScore, Verovio and webmscore stay out for their
   licence (see [Score editing](research/score-editing.md)).
2. **Repository: a Bun workspace and a Cargo workspace**, small packages
   with one job each:
   - `@donizetti/musicxml`: the score as a MusicXML document, its reading and
     writing (`.musicxml`, `.xml`, `.mxl`) and the edit operations. Plain
     TypeScript on the DOM, no drawing.
   - `@donizetti/playback`: the notes as played (repeats unrolled), MIDI files
     and the SpessaSynth player.
   - `@donizetti/react`: the `<ScoreEditor>` component, drawn with
     OpenSheetMusicDisplay.
   - `@donizetti/tauri`: the typed client of the Tauri plugin.
   - `@donizetti/app`: the demo app, in the browser and as a Tauri window.
   - `crates/`: `tauri-plugin-donizetti` (files, the soundfont, PDF) and the
     crates it is built from (`donizetti_<name>`).
3. **The score is the MusicXML document.** The file is parsed with the
   browser's `DOMParser`; edits change that document and it is written back
   with `XMLSerializer`, so everything the editor does not touch (other
   programs' elements, comments, layout, vendor extensions) stays as it was.
   OpenSheetMusicDisplay (BSD-3-Clause) draws it again after each edit (under
   0.1 s for 128 bars, measured in [Score editing](research/score-editing.md)).
   No model of our own is the source of truth.
4. **Editing scope: lead sheets first.** One melody staff with lyrics
   (syllable by syllable) and chord symbols: notes, rests, ties, key, time,
   tempo, repeats and endings. **Any file with one part, one staff and one
   voice can be edited**, whatever made it; other files open read-only (drawn
   and played), and the component says why. The code stays general so that
   more staves and voices can follow.
5. **Interface: plain React and CSS custom properties**, no UI framework.
   One small stylesheet, themed by `--dz-*` variables that the host may
   override; light, dark and forced colours.
6. **Interface text: typed en-GB strings with an override.** UK English. The
   component ships its own en-GB messages; the host passes a partial
   `strings` object or a `t(key, values)` function (jerome routes them through
   its own translations).
7. **Component API: bytes in, changes and saves out.** `<ScoreEditor
   source={bytes | text} onChange onSave readOnly />`. Undo and redo live in
   the component; the host decides when and where to write the file. An
   imperative handle (a ref) offers play, save, undo, redo and the exports.
   The component never reads or writes files itself, so it is not tied to
   Tauri.
8. **Keyboard: MuseScore 4's defaults.** N for note input, A–G for pitch,
   1–9 for lengths (5 a quarter, 4 an eighth, 6 a half, 7 a whole), `.` a dot,
   0 a rest, Up and Down a semitone, Ctrl+Up and Down an octave, T a tie,
   Ctrl+L lyrics, Ctrl+K a chord symbol, Ctrl+Z and Ctrl+Y. Every key is
   listed in one place in `@donizetti/react`.
9. **Formats, first round:** MusicXML read and written (`.musicxml`, `.xml`
   and compressed `.mxl`, with fflate, MIT), MIDI export, SVG export and PDF
   export. ABC text input is not in this round.
10. **The soundfont comes from the host.** The component takes the soundfont's
    bytes (or a function that loads them); nothing large is bundled. The Tauri
    plugin downloads MuseScore General (MIT, 38 MB as SF3, checksum
    verified), as jerome does; the web demo loads it from a URL.
11. **Distribution: git dependencies now, npm and crates.io later.**
    Packages build to `dist/` with their types, so jerome can depend on them
    from GitHub (or by `link:`) before anything is published. The repository
    is meant for `github.com/Federiker/donizetti`.
12. **Tooling, as in jerome:** mise pins the tools (`mise.toml`), Bun runs
    the packages, Biome formats and lints, Vitest and Playwright test,
    lefthook runs the hooks (Biome and rustfmt before a commit, the
    commit-message prefix, the type-check before a push), typos checks
    spelling in UK English, knip finds unused code, lychee broken links,
    cargo-nextest, Clippy and cargo-deny check the Rust, Renovate updates
    weekly, GitHub Actions runs `mise run ci`, and Git LFS holds binary
    files. TypeScript sources are imported without an extension.
13. **Tests: 80% coverage or more** on every measure for TypeScript (lines,
    statements, functions, branches) and lines and regions for Rust; CI fails
    below. Each edit operation has its tests on plain XML, and round-trip
    tests prove that what the editor does not touch is written back unchanged.
14. **Demo app: one Vite app that is also a Tauri window**: in the browser
    for development and the end-to-end tests, and as a small desktop app
    (open, play, edit and save `.musicxml` and `.mxl`) that shows how a host
    integrates Donizetti.
