# Score editing research (26 October 2026)

Carried over from jerome's research of the same date (its `docs/research/score-editing.md`),
which led to Donizetti; the measurements and candidates are unchanged, and
"Jerome" below is the app the research was made for. The owner's decisions on
it are in [development.md](../development.md#decisions).

How hard would it be to edit, and not only draw and play, the MusicXML scores
of a Musical? Desk research from npm, crates.io, the projects' repositories
and the W3C's MusicXML pages on 26 October 2026, plus measurements with
OpenSheetMusicDisplay 2.2.1 as Jerome already installs it. Drawing and playing
are described in jerome's Scripts document
and their research in [Score playback](score-playback.md). Licence readings
are from each project's LICENSE file and are not legal advice.

## The question, as the owner set it

- **A lead sheet**: one melody staff with lyrics (syllable by syllable) and
  chord symbols; notes, rests, ties, key, time, tempo, repeats and endings.
  Imported full scores stay as they are: drawn and played.
- **Saved into the MusicXML asset itself**, keeping everything the editor does
  not change, so MuseScore and the others read the file as before.
- **Only permissive licences** in the app (MIT, BSD, Apache and the like).
- **Input** by the computer keyboard (MuseScore's way), by pointer and palette,
  and by typing a text notation.
- Offline.

## Short answer

No permissive project does this. The ready-made editors rebuild the file from
their own model, losing what they do not model, and the one toolkit built to
keep unknown content is four months old. Jerome can build the editor itself,
though: the browser's own XML parser keeps a file intact, and OpenSheetMusicDisplay
redraws a 128-bar lead sheet after an edit in under 0.1 s. The work is in the
edit layer: keeping each bar's durations right, beams, ties, lyrics and chord
symbols in MusicXML's order, and finding the XML note behind a click. It would
be a round about the size of the Plot or Timelines work, in eight slices
(see [Recommendation](#recommendation)).

## Candidates

| Name | Version, date | Licence | Size (npm, unpacked) | Edits | MusicXML | Notes |
| --- | --- | --- | ---: | --- | --- | --- |
| [Smoosic](https://github.com/Smoosic/Smoosic) | 2.0.3, 20 Oct 2026 | MIT (its VexFlow fork too) | 91.7 MB (`smoosic.js` 29.7 MB) | A whole app: keyboard and pointer entry, lyrics, chords, repeats | In and out through its own model; no `<harmony>` at all, so chord symbols are lost both ways | Vue 3 and Tiptap; the npm build is a development build using `eval()`, refused by Jerome's CSP; one author |
| [RiffScore](https://github.com/joekotvas/RiffScore) | 1.0.0-alpha.18, 18 Sep 2026 | MIT | 9.5 MB | React editor: keyboard entry, chord symbols, undo | Its importer ignores lyrics, repeats, endings and later time changes | Alpha; Tone.js |
| [@stringsync/mdom](https://github.com/stringsync/mdom) | 0.7.0, 5 Oct 2026 (first release 21 Jun 2026) | MIT, with four MPL-2.0 files (Guitar Pro code from alphaTab) in the same bundle | 0.33 MB | No UI: typed edits (`setPitch`, `setDuration`, `addTie`, `setKey`, `setTime`, `addHarmony`, `addBarline`), undo; no lyric writer | In and out; unknown elements kept, but comments, processing instructions and whitespace dropped (read from its source, not run) | One author; the MPL files would have to be cut out |
| [@stringsync/vexml](https://github.com/stringsync/vexml) | 1.12.1, 11 Oct 2026 | MIT | 1.4 MB | Selection, `setPitch`, arrows, undo | Through mdom | VexFlow 5; would replace OSMD |
| [abcjs](https://github.com/paulrosen/abcjs) | 6.7.2, 16 Oct 2026 | MIT | 6.0 MB (basic build 0.51 MB minified) | ABC text with live drawing; dragged notes leave the text for the app to rewrite | None | The base for typed notation, if its parser is used |
| [VexFlow](https://github.com/vexflow/vexflow) | 5.0.0, 5 Mar 2025 | MIT (fonts OFL; Gonville unrestricted) | 21.3 MB | Draws only | None | |
| [music21j](https://github.com/cuthbertLab/music21j) | 0.24.0, 29 Sep 2026 | BSD-3-Clause | 11.2 MB | Demos only | Its 0.24.0 build does not read `harmony`, `direction` or `barline` | |
| [musicxml-io](https://www.npmjs.com/package/musicxml-io) | 0.12.2, 20 Oct 2026 | MIT | | Edit operations, ABC↔MusicXML, MIDI | Claims a 99.6% round trip, so not lossless | One maintainer; "API not yet stable" |
| [tonal](https://github.com/tonaljs/tonal) | 6.5.1, 14 Oct 2026 | MIT | | Theory helpers: chord names (`Chord.get("Cmaj7")`), transposition, intervals | | Useful for chord symbols and transposing |
| OpenSheetMusicDisplay (in Jerome) | 2.2.1, 12 Oct 2026 | BSD-3-Clause | 2.3 MB | Draws; "a renderer, not a full interactive sheet music editor" (its README) | Reads only; no writer, and its model keeps no link to the XML | Hit-testing (`GraphicSheet.GetNearestNote`), cursor, display-only transposition |

Not considered, for their licence or because they need the network:
alphaTab and alphaTex (MPL-2.0; MusicXML in only), Verovio (LGPL-3.0; edits
MEI, writes no MusicXML), webmscore and MuseScore (GPL; no commits to
webmscore since January 2023), mei-friend and Nubium (AGPL), VexTab
(non-commercial), `musicxml-interfaces` (AGPL-3.0), `@grame/libmusicxml`
(MPL-2.0), Wim Vree's `abc2xml` and `xml2abc` (LGPL, Python; the npm port
`xml2abc` is LGPL-3.0), and Flat and Noteflight (hosted services).
OpenSheetMusicDisplay's sponsor build (`osmd-extended` 1.9.2, 7 Aug 2025,
"UNLICENSED") mentions no editing.

Rust crates, if the editing ran in the backend: `musicxml` 1.1.2 (MIT, 5 Nov
2024) is typed, so it is unlikely to keep what it does not model; `xot`
0.31.2 (MIT) and `quick-xml` 0.42.0 (MIT) are generic XML trees. The edits
are made where the score is drawn, so the WebView is the natural place.

## Measurements

On an AMD Ryzen 7 5800H (16 threads, 31 GB), Windows 11, in the Chromium of
the repository's Playwright 1.64.1 (the engine of WebView2; WKWebView and
WebKitGTK not measured). Invented lead sheets: one part, 4/4 in C, five notes
a bar with a lyric syllable each, a chord symbol a bar, a metronome mark and a
repeat around the first eight bars. Medians of ten runs.

| Bars | Load and draw | An edit: one pitch changed in the XML, loaded and drawn again | Draw only | Nearest note to a point | SVG elements |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 16 | 28 ms | 32 ms | 18 ms | 0.08 ms | 1 014 |
| 32 | 47 ms | 43 ms | 31 ms | 0.17 ms | 2 002 |
| 64 | 55 ms | 62 ms | 41 ms | 0.30 ms | 3 983 |
| 128 | 72 ms | 85 ms | 44 ms | 0.30 ms | 7 946 |

- **Redrawing everything after each edit is fast enough** for a lead sheet: a
  song is usually 32 to 64 bars. OSMD 2.0 (15 June 2026) made a second draw
  match the first (its issues #1683 and #1636) and added `renderNext()` for
  drawing in steps, should a long score need it.
- **The browser's own XML round trip keeps the file.** `DOMParser` and
  `XMLSerializer` on the 128-bar sheet with an added comment, a vendor
  element in its own namespace and extra attributes gave back the same text,
  except the two line breaks between the XML declaration, the DOCTYPE and the
  root (cosmetic; they can be written back). 16 ms a round trip.
- OSMD drew the chord symbols, lyrics, the metronome mark and the repeat as
  written. Eighths were not beamed, as the file had no `<beam>`: an editor
  writes its beams (readers do not beam for themselves).

The scripts are in `tmp/score-editor/bench/` (not tracked): `leadsheet.ts`
makes the invented sheets, `bench.ts` the timings, `roundtrip.ts` the round
trip and `shot.ts` a picture. From the repository root:
`bun tmp/score-editor/bench/bench.ts`.

## What the edit layer has to get right

What the MusicXML 4.0 reference requires (W3C Music Notation Community Group
final report, 1 June 2021, under the W3C Community Final Specification
Agreement, so royalty-free to implement; the 4.1 draft is not released):

- **Every bar adds up** to its time signature (a pickup is `implicit="yes"`),
  in whole `divisions`: triplets need a multiple of 3, and changing
  `divisions` rescales every later duration. `type` and `dot` agree with the
  duration.
- **Order matters**: `<attributes>` (divisions, key, time, clef) and each
  note's children follow the schema's sequence; a `<harmony>` comes before the
  note it belongs to (with `<offset>` when the chord changes mid-note).
- **Ties are written twice**, `<tie>` for playback and `<notations><tied>`
  for drawing, and a note split at a barline needs both ends.
- **Beams** are written (`<beam number="1">` begin, continue, end).
- **Lyrics**: `<lyric number="1">` with `syllabic` (single, begin, middle,
  end), `text`, `extend` for a melisma and `elision`; inserting or deleting a
  note keeps the syllables in step.
- **Existing files** may have `<backup>`, `<forward>`, several voices or
  staves: the editor either handles them or declines the file.
- **Finding the XML behind a click**: OSMD's notes keep no link to the XML, so
  a click is mapped through `GetNearestNote` to its measure and its place in
  the voice, then to the same note in the XML. This mapping is the riskiest
  part, and the first thing to prove.

## Typed notation

**ABC** (standard 2.1, December 2011) covers a lead sheet in one text: `K:`,
`M:`, `L:`, `Q:`, chord symbols in quotes before a note (`"Am7"`), `w:`
lyric lines (`-` between syllables, `_` for a melisma), ties with `-`,
repeats and endings (`|:`, `:|`, `[1`, `[2`). No permissive converter to
MusicXML is good enough (musicxml-io's is young and lossy), so Jerome would
write its own for a subset: durations from `L:`, notes split at barlines
with ties, beams by beat, syllables matched to notes, chord symbols placed.
Converting a whole existing file to ABC and back would lose what ABC cannot
say; the text is safer for a new lead sheet, or for replacing selected bars.
ChordPro (chords and lyrics, no melody), Humdrum (columns) and LilyPond (GPL)
suit less.

## Recommendation

Build the editor in Jerome, keeping OpenSheetMusicDisplay to draw:

- **The score is the XML document.** Edits change the parsed MusicXML in the
  WebView (`DOMParser`), the file is written back with `XMLSerializer` under
  the music's hash guard, and everything the editor does not touch stays as
  it was. Undo keeps the serialised text before each edit (about 130 kB for
  128 bars).
- **Jerome's own edit operations** in a package of their own, tested on plain
  XML without drawing: set pitch, length, rest, tie, insert and delete (bars
  refilled), key, time, tempo, repeat and ending barlines, lyric syllables,
  chord symbols (named with `tonal`, MIT), beams written by beat.
- **Editable files**: those with one part, one staff and one voice (whatever
  made them); others stay drawn and played, saying why.
- **Not adopted**: Smoosic and RiffScore (they rebuild the file and lose
  chord symbols, or lyrics and repeats); mdom for now (young, MPL files in its
  bundle, comments dropped), worth watching.

Slices, in order (sizes are a judgement against earlier rounds, not
measured):

1. **Click to XML** (small, but first): selecting the note under the pointer
   and finding it in the XML, on real MuseScore, Sibelius and Finale exports;
   if this fails, the plan changes.
2. **The edit operations** with their tests (large): bars kept whole, ties,
   beams, order.
3. **Keyboard entry** (medium): A–G for pitch, digits for length, arrows,
   Up and Down for a semitone, Ctrl+Up and Down an octave, Delete for a
   rest, T a tie, the selection drawn; every key in
   `services/shortcuts.ts`.
4. **Lyrics** (medium): typing under the notes, Space to the next note,
   hyphen to the next syllable, as MuseScore does; verses.
5. **Chord symbols** (small): typed above a note (`Am7`, `F/A`), checked with
   `tonal`.
6. **Key, time, tempo, repeats and endings**, and the palette for the
   pointer (medium).
7. **A new lead sheet** from a musical number: a MusicXML asset created and
   linked (small).
8. **ABC for new sheets or selected bars** (medium to large): the subset
   above, with its errors shown in place.

Playback, the soundfont and seeking already work on any MusicXML, so an
edited sheet plays as soon as it is saved.

## Open questions for the owner

- Which files can be edited: any file with one part, one staff and one voice
  (recommended), or only lead sheets made in Jerome?
- Where a new lead sheet starts: from a musical number (**New lead sheet**,
  linked to it), from Assets, or both.
- Whether edits to a score are part of revision at all: tracked changes and
  History cover the text; a score could have undo only, while it is open.
- The text notation: an ABC subset (recommended, readable by other tools) or a
  notation of Jerome's own.
- The SMuFL fonts (Bravura, Leland, Petaluma) are under the OFL 1.1. OSMD
  draws with the glyphs it ships, already in Jerome; a palette drawn with
  them adds no licence, a separately bundled music font would.

Still to check: the XML round trip and the timings in WKWebView and
WebKitGTK; real exports from MuseScore, Sibelius and Finale in slice 1.
