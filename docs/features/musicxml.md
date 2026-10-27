# The score document

`@donizetti/musicxml` holds the score as a MusicXML document (decision 3):
the parsed XML is the score, the edit operations change it, and it is written
back with everything they did not touch exactly as it was written. There is no
model of our own to drift from the file.

## Reading

`readScore(bytes | text)` reads `.musicxml`, `.xml` and compressed `.mxl`,
told apart by their content (a zip archive starts with `PK`), not by the file
name.

- **Encodings**: UTF-8 (with or without a byte order mark) and UTF-16 in
  either byte order are read and written back as they were. A file declaring
  another encoding (Latin-1 from old exporters) is read with it and written as
  UTF-8, its declaration changed to say so.
- **`.mxl`**: the score is the first `<rootfile>` in
  `META-INF/container.xml` with the MusicXML media type (or none, as
  MusicXML 1 and 2 wrote). Every other file in the archive is kept.
- **Refused**, with a `MusicXmlError` carrying a code and parameters, never
  English text: `not_xml`, `not_musicxml`, `timewise_unsupported` (a
  `<score-timewise>` file), `mxl_not_zip`, `mxl_no_root_file`,
  `mxl_missing_file`, `unsupported_encoding`, `no_dom` (no `DOMParser` here).

## Writing

`writeScore(document, format?)` gives the file's bytes, as `.musicxml` or
`.mxl` (the format it was read in, unless another is asked for).

- **Unchanged**: the very bytes that were read.
- **Changed**: the text before and after the root element (declaration,
  DOCTYPE, comments) as read; every element, attribute, entity, quote and
  space the edits did not touch **exactly as written**; only what changed is
  written afresh. A tokenizer notes where each node was in the text when it is
  read, and a `MutationObserver` notes what the edits change: an untouched
  subtree is copied from the original text; an element whose attributes
  changed gets a new start tag (its children still copied when untouched); an
  element keeps its form (`<a/>` or `<a></a>`) while empty. Plain
  `XMLSerializer` would rewrite `<a></a>` as `<a/>` and quotes and entities its
  own way. If the text and the parsed tree ever cannot be matched, the score
  is still written correctly, through `XMLSerializer`, only without the
  original spelling.
- **`.mxl`**: the score is replaced in its archive and every other file kept;
  the `mimetype` file comes first, stored uncompressed, as the specification
  asks (added when the archive had none: MuseScore 4 writes none). Plain
  MusicXML asked to be `.mxl` goes into a new archive as `score.musicxml`.
- `restoreScore(document, text, revision)` replaces the tree with an earlier
  `scoreText` (undo and redo), keeping the encoding and archive;
  `isChanged(document)` says whether the score differs from the file read.

## The score map

`mapScore(root, part?)` lists a part's measures (their index, `number`,
divisions, key, time, whether implicit, the length the time signature asks
for and how far the notes reach) and notes (onset and length in whole notes,
voice, staff, chord, grace, rest, pitch), following `<backup>`, `<forward>`,
chords and changes of divisions, key and time. Positions are in whole notes,
as OpenSheetMusicDisplay's timestamps are, so `noteAt(map, measure, onset,
{ voice, staff, midi })` finds the `<note>` behind a note OSMD drew: the
click-to-XML mapping. Among notes starting together, timed notes come before
grace notes and the nearest pitch wins in a chord.

## What can be edited

`editabilityOf(root)` (decision 4): one part, one staff, one voice, no
`<backup>` or `<forward>`. Chords and grace notes within the one voice are
allowed. Otherwise every reason is given (`no_parts`, `several_parts`,
`several_staves`, `several_voices`, `backup_or_forward`) for the component to
say why the score is read-only.

## Editing: lyrics, chord symbols and structure

Each operation takes the `ScoreDocument`, changes it inside `edit()` (so its
`revision` rises) and returns what the editor needs next. One the score cannot
take throws a `ScoreEditError` with a code and parameters, and changes
nothing: `not_editable` for a score `editabilityOf` refuses, `not_in_score`
for a note, measure or moment outside the part, and the codes below. New
elements go where MusicXML 4.0's schema puts them, laid out as their siblings
are; everything else is written back as it was. What each writes is what
MuseScore Studio 4.6.5 writes, checked against its own exports
(`tests/fixtures/musescore/`), and a score edited with all of them is read
back by MuseScore with its lyrics, chord symbols, tempos, repeats and endings.

### Lyrics

- `lyricsOf(note)`, `lyricOf(note, verse)` and `readLyric(lyric)` read a
  `<lyric>`: its verse (`number`, "1" when unwritten), its text (syllables
  joined by their `<elision>`, an undertie ‿ when empty), its `syllabic`,
  whether a hyphen joins it to the verse's syllable before and after, and
  its `<extend>` with its `type` if written.
- `setLyric(document, note, { verse, text, hyphen, extend })` writes the
  syllable (MuseScore's Ctrl+L entry) and keeps the verse's hyphenation
  consistent: the syllable is `begin`, `middle`, `end` or `single` from the
  hyphen after the verse's syllable before it and the one after it (`hyphen`,
  MuseScore's `-`; not given, the hyphenation stays as it was), and the next
  syllable is changed to agree. `extend: true` writes `<extend/>` on it (a
  melisma, MuseScore's `_`): MuseScore writes only that, untyped, on the
  syllable the line starts from, and nothing on the notes under the line. A
  lyric already there keeps its attributes; its elisions stay while its text
  does (new text is written as one `<text>`, as MuseScore writes `a‿e`). A
  chord's lyric goes on its first note; rests, grace notes and notes tied from
  the one before are refused (`lyric_not_allowed`), as is empty text
  (`empty_lyric`).
- `removeLyric(document, note, verse)` takes it away (`no_lyric` without
  one); a word whose last syllable goes ends on the one before, one whose
  first goes begins on the one after.
- `nextLyricNote(map, note)` and `previousLyricNote` give the note entry goes
  to on Space, `-` and Shift+Space, skipping rests, grace notes, tied
  continuations and a chord's other notes, as MuseScore does.

### Chord symbols

- `parseChordSymbol(text)` reads what a user types (C, Am7, F/A, Bb7b9,
  F#m7b5, Csus4, Gmaj7, C6/9, D°, Dø7, C+, Cdim7, E7#9, N.C., ♭ and ♯ too)
  into a `ChordSymbol`: root, `kind` with the text typed for it (`<kind
  text>`, after its symbol with `use-symbols` for −, +, °, ø and Δ, as
  MuseScore keeps it), degrees added, altered or taken away (an addition's
  alteration from a dominant chord, as MusicXML says), parentheses and bass.
  Spellings that name the kind and degrees together (7sus4, 9sus4, 6/9, C2,
  7alt) write those degrees with `print-object="no"`, as MusicXML asks. Text
  it does not read is null, never a guess: a small parser of our own, no
  dependency.
- `readChordSymbol(harmony)`, `chordSymbolText(symbol)` and
  `harmonyText(harmony)` turn any program's `<harmony>` back into text that
  reads back as the same chord, for editing it: a `text` that does not spell
  its kind (MuseScore writes "4" for sus4) gives way to the kind's usual
  spelling; Roman numerals and functions show their text.
- `setChordSymbol(document, noteOrMoment, text)` writes `<harmony
  print-frame="no">` right before the note (a chord's first note, before its
  grace notes and the moment's directions), or at a moment within a note with
  `<offset>` in divisions, as MuseScore writes a chord change mid-note. One
  there is replaced: its chord written afresh (and a fretboard `<frame>`, which
  showed the old chord, dropped), its attributes, offset and staff kept.
  Unreadable text is `chord_symbol_unreadable`. `removeChordSymbol` takes one
  away (`no_chord_symbol`), `chordSymbolAt(map, noteOrMoment)` finds it.
- `nextChordSymbolPosition(map, moment)` and `previousChordSymbolPosition`
  give where Space and Shift+Space go in chord-symbol entry: the next note or
  beat, whichever comes first (a dotted beat in 6/8, 9/8, 12/8).

### Tempo

`setTempo(document, { measure, onset }, { beatUnit, dots, perMinute, words })`
writes `<direction placement="above" system="only-top">` with the words, if
any, and `<metronome parentheses="no">` as two `<direction-type>`s, and
`<sound tempo>` in quarter notes a minute (`quarterNotesPerMinute`: a dotted
quarter at 80 is 120), before the note at the moment or with `<offset>` within
a note. A mark there already is rewritten, everything else in it kept; its
words stay unless `words` is given ("" removes them). `removeTempo` takes the
mark away, the whole direction when it says nothing else (`no_tempo` without
one); `tempoAt` and `readTempo` read one. `invalid_tempo` refuses another beat
unit, more than two dots or a tempo not above zero.

### Repeats, barlines and endings

- `setRepeatStart(document, measure)`: the left barline `heavy-light` with
  `<repeat direction="forward"/>`; `setRepeatEnd(document, measure, times)`:
  the right one `light-heavy` with `<repeat direction="backward"/>`, `times`
  written only above two, as MuseScore does. `removeRepeatStart` and
  `removeRepeatEnd` leave a regular barline (`no_repeat` without one).
- `setBarStyle(document, measure, "regular" | "double" | "final")`: the closing
  barline `light-light` or `light-heavy`, or none for a regular one, replacing
  an end repeat there. `barlinesOf(measure)` reads them.
- `setEnding(document, from, to, { numbers, text, open })`: `<ending
  number="1" type="start">1.</ending>` in the first measure's left barline,
  `type="stop"` (`discontinue` when open, as a last ending usually is) in the
  last one's right barline, as MuseScore exports them; numbers are written
  "1, 2", the text is the numbers with a full stop unless given. Endings may
  not overlap (`ending_overlaps`); `removeEnding` takes one away,
  `endingsOf(map)` lists them.
- New barlines go first in the measure (after `<print>`) at the left, last at
  the right; a barline left with nothing to say is removed.

### Navigation marks

`setNavigationMark(document, measure, mark)` writes a `<direction
placement="above">` as MuseScore 4 exports its own markers and jumps: a
segno (`<segno/>`, `<sound segno="segno"/>`) or coda (`<coda/>`,
`coda="codab"`) at the measure's start, and at its end To Coda
(`tocoda="codab"`), Fine (`fine="yes"`), D.C., D.C. al Fine, D.C. al Coda
(`dacapo="yes"`), D.S., D.S. al Fine and D.S. al Coda (`dalsegno="segno"`) in
words. A measure has one jump; a new one replaces it. `navigationMarksOf`
reads them, from their `<sound>`, sign or words (for programs that write no
`<sound>`); `removeNavigationMark` takes one away. MuseScore 4.6.5 reads all
of these back, its own exports included, as plain staff text, not as jumps.

### Measures

- `insertMeasures(document, before, count)` and `appendMeasures(document,
  count)` add whole-measure rests (`<rest measure="yes"/>`, its `<duration>`
  and `<voice>`, as MuseScore writes them) of the time in force before them;
  measures put first take the opening `<attributes>` (key, time, clef,
  divisions) with them, and a plain final barline moves to the new last
  measure. `no_time_signature` and `length_not_in_divisions` refuse a length
  the score cannot write.
- `removeMeasures(document, from, count)` moves on to the measure after what
  the removed measures changed that it still goes by: key, time, clef,
  divisions and transposition (into its opening `<attributes>`) and the tempo
  (before its first note), unless it sets its own. An ending that began or
  stopped in them begins or stops beside them; ties into or out of them and
  hyphens across them are taken away. A part keeps one measure
  (`last_measure`).
- Measures numbered 1, 2, 3… (from any start) are renumbered; others keep
  their numbers, and new ones take the number before with a letter (12a).
