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
11. **Distribution: tarballs on GitHub releases, the plugin by git**
    (owner decisions, 27 October 2026, replacing "by path or git now, npm
    and crates.io later"; no npm registry and no crates.io).
    `@donizetti/musicxml`, `@donizetti/playback`, `@donizetti/react` and
    `@donizetti/tauri` keep their names and are released as tarballs
    attached to the GitHub release of the tag `v<version>` of
    `github.com/Federiker/donizetti`, named as `npm pack` names them
    (`donizetti-react-0.1.0.tgz`). A host installs them by URL:
    `bun add https://github.com/Federiker/donizetti/releases/download/v0.1.0/donizetti-react-0.1.0.tgz`.
    In the workspace the packages export their TypeScript sources, so the
    demo app and the tests need no build step; the tarballs hold **built
    files**: each package's `dist/index.js` (Vite's library mode, ES
    modules, every dependency left external) with tsc's declarations of
    `src` (each package's `tsconfig.build.json`), and for the editor one
    `dist/style.css` with its imports inlined (`@donizetti/react/style.css`).
    Their manifests are made in `tmp/release/<package>/`, never in the
    tracked `package.json` files: the catalog's ranges resolved, a sibling
    as its tarball's URL on the same release, React and React DOM as peers,
    no devDependencies; each tarball holds `dist`, the package's README and
    the licence. SpessaSynth's AudioWorklet processor stays a `?url` import
    of `spessasynth_lib` in the built `@donizetti/playback`, for the host's
    Vite to serve (see [Playback](features/playback.md#the-processor-url):
    a Vite build needs nothing, Vite's dev server needs
    `optimizeDeps.exclude: ["@donizetti/playback"]`, other bundlers pass
    `processorUrl`). `tauri-plugin-donizetti` is not published: a Cargo host
    takes it by git at the release's tag,
    `tauri-plugin-donizetti = { git = "https://github.com/Federiker/donizetti", tag = "v0.1.0" }`,
    and Cargo takes the crates it uses (`donizetti_soundfonts`,
    `donizetti_pdf`) by their paths in the same checkout. One version for
    all, the root `Cargo.toml`'s `[workspace.package]` version (0.1.0
    first).

    `scripts/release.ts` makes the release. `mise run release:dry` runs the
    type-check, the tests and Clippy, builds and packs the packages,
    installs the four tarballs together in a throwaway consumer (the
    siblings' URLs overridden by the local tarballs; imported with Node,
    type-checked with `nodenext`, and a small Vite app built on them and
    served by Vite's dev server, each giving the processor's address) and
    lists what releasing would do: the tag's checks, the calls to GitHub
    and the release's notes.

    To release, `mise run tag` (`scripts/tag.ts`) asks at each step, Enter
    taking the default. On `main`, with nothing uncommitted or untracked and
    nothing on origin's main this one lacks, it asks the new version (the
    next patch; the current one when it was never tagged, as for 0.1.0;
    `x.y.z` or a pre-release such as `0.2.0-alpha.1`, after the current one,
    its tag not taken here or on origin), writes it to the root
    `Cargo.toml` and `Cargo.lock` (only the workspace's own crates' lines),
    commits those two files alone (`[release] Donizetti <version>`, the
    hooks run, no trailer: the owner's commit), makes the annotated tag
    `v<version>`, shows what goes to origin and asks before
    `git push --atomic origin main v<version>`, then asks before running the
    release. Ctrl+C or the end of the input at a question changes nothing
    before the commit; after it, the script says what it has done and the
    commands that undo it here (`git tag -d`, `git reset --hard HEAD~1`),
    printed, never run. `mise run release` releases a pushed tag: it stops
    unless `v<version>` is at HEAD here and on origin with HEAD on origin's
    main, runs the checks and the build, creates the release when there is
    none (its notes from `scripts/release/notes.ts`) and uploads each
    tarball, skipping one already there, so a release that stopped half way
    is run again as it is. The token (`GITHUB_TOKEN`, fine-grained,
    Contents: read and write) is in the gitignored `.env`
    ([.env.example](../.env.example)) and goes only in the requests to
    GitHub's API. jerome may install the released tarballs instead of
    depending on a checkout by path.
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

Owner decisions, 27 October 2026, on what the editor looks like:

15. **Dark mode draws the score light on dark**: in a dark theme the score's
    paper goes dark and its ink light (OpenSheetMusicDisplay's dark mode),
    following `prefers-color-scheme` or the host's `theme`. Exports (SVG, PDF)
    and printing are always black on white.
16. **Lyrics and chord symbols are typed inline at the note**, as in
    MuseScore: a small field under the note (lyrics, Ctrl+L) or above it
    (chord symbols, Ctrl+K); Space goes to the next note, `-` to the next
    syllable, `_` adds an extender, Esc ends.
17. **The palette is a collapsible side panel** beside the score (key, time,
    tempo, barlines, repeats, endings, jumps), applying to the selection; at
    narrow widths it moves under the toolbar.
18. **Save writes the format the score was read in**: `.mxl` stays `.mxl`,
    `.musicxml` stays `.musicxml`; a host may offer the other as Save As.
19. **A new score** (owner decision, 27 October 2026): `newScore(options)` in
    `@donizetti/musicxml` writes a new lead sheet's MusicXML, which the host
    hands to `<ScoreEditor>` like any file (the component still manages no
    files). The demo app's **New…** opens one small dialog: title and
    composer, key, time, a pickup measure or not, tempo and the number of
    measures (16 by default). The part is "Melody", treble clef, played with
    a piano sound (General MIDI program 1); measures are whole-measure rests,
    the last with a final barline.
