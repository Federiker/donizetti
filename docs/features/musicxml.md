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
  and `<voice>`, as MuseScore writes them) of the time in force before them,
  and a plain final barline moves to the new last measure. Measures put first
  (owner decision, 27 October 2026) take with them what starts the score, so
  it still starts as before: the `<print>` layout, the opening `<attributes>`
  (key, time, clef, divisions) and the opening tempo mark (a `<direction>`
  with a `<metronome>` or `<sound tempo>` at onset 0), each moved as it was
  written; the old first measure keeps its barlines, chord symbols, other
  directions and a tempo later in it. `no_time_signature` and `length_not_in_divisions` refuse a length
  the score cannot write.
- `removeMeasures(document, from, count)` moves on to the measure after what
  the removed measures changed that it still goes by: key, time, clef,
  divisions and transposition (into its opening `<attributes>`) and the tempo
  (before its first note), unless it sets its own. An ending that began or
  stopped in them begins or stops beside them; ties into or out of them and
  hyphens across them are taken away. A part keeps one measure
  (`last_measure`).
- **Numbering** (owner decision, 27 October 2026), wherever measures are
  added or removed (`insertMeasures`, `appendMeasures`, `removeMeasures`, a
  note running past the end in `writeNote`, `setLength` and `addTiedNote`,
  re-barring in `setTime`): measures numbered 1, 2, 3… (from any start, a
  pickup's 0 included) are renumbered so. Others keep their numbers, and a
  new measure takes the number of the one before it with a letter, never
  refused: 12a and 12b after 12, 12c after 12b, the next letter free when one
  is taken (a to z, then aa, bb…); measures put first are 0a, 0b….

## Editing: notes and rhythm

The edit operations behind MuseScore 4's note input (decision 8), in
`src/edit/`. Each takes the `ScoreDocument` and changes its DOM as one edit:
`revision` rises by one, so undo and redo can tell versions apart. Each first
checks that the score is editable (`not_editable` otherwise) and that the notes
given are its part's (`not_in_score`), and is tried on a copy of the score
before the real one, so an edit that cannot be made throws its
`ScoreEditError` with **nothing changed**. Positions are `{ measure, onset }`:
the measure's index in the part and whole notes from its start, as in the
score map; `{ measure: measures.length, onset: 0 }` is the end of the score.

After every edit, what follows from it is written again in the measures it
touched: beams (when the rhythm changed), stems (of the notes changed, their
chords and beamed groups) and accidentals (also in the measures of tie
partners whose ties changed). New elements go where MusicXML's schema puts
them, laid out as their siblings are, MuseScore's hanging end tags included;
elements moved keep their own text, so a moved chord symbol is written back
byte for byte.

### Lengths and divisions

- A `NoteLength` is a `<type>` (`1024th` to `maxima`, `NOTE_TYPES`) with 0 to
  4 dots; `wholeNotesOf` gives its length (a dotted quarter is 3/8),
  `noteLengthOf` the one length of a duration, if any, and `splitLength` the
  tied notes any length is written as, each the longest plain or dotted type
  that fits (5/8 is a half and an eighth).
- `<type>`, `<dot>` and `<duration>` always agree. A note becoming a whole note
  or longer loses its `<stem>`; one becoming shorter gets one where the part
  writes stems.
- When a length, a position or the beat of the measure is not a whole number
  of `<divisions>`, the divisions are multiplied by the power of two that makes
  it so: every `<divisions>` of the part (in its first `<attributes>` and any
  later change), and every `<duration>` (notes, `<backup>`, `<forward>`,
  figured bass) and `<offset>` with them, so every note keeps its length. A
  part without `<divisions>` gets one in its first measure.
- **Not this round: tuplets.** An edit that would cut into a note with
  `<time-modification>`, or re-bar one, throws `unsupported_rhythm`; notes
  outside a tuplet can be edited around it.

### Writing at the cursor

`writeNote(document, position, { pitch | null, length })` is A–G and 0 in note
input: it **overwrites** as MuseScore does, and returns the notes written (one
for each tied piece) and `next`, the cursor's position after them.

- Notes and rests begun before the cursor are cut short there (split into tied
  notes when one type cannot write what is left), those inside are removed,
  and the part of one reaching past the new note is left as rests. A measure
  that stops short of the cursor is filled with rests up to it.
- Rests are written as MuseScore writes them: each the longest that fits,
  starting on a multiple of its own length and, off the beat, ending by the
  next beat (after a quarter in 4/4, a quarter rest then a half; after a
  quarter in 6/8, an eighth then a dotted quarter); dotted rests only of a beat
  or more, in compound time. A whole empty measure is a measure rest,
  `<rest measure="yes"/>` without a `<type>`, as MuseScore writes it.
- A note crossing the barline is split and tied into the next measure; past
  the last measure, measures are added as `appendMeasures` adds them (see
  [Measures](#measures)): each a measure rest of the last measure's time,
  numbered as new measures are, a plain final barline moved on to the new
  last measure. The other barlines stay where they were.
- Chord symbols, directions, sounds and the other elements keep their time:
  before the note that starts at it, or, when it now falls inside a note,
  before that note with an `<offset>` (`<harmony>`, `<direction>`, `<sound>`);
  an `<offset>` no longer needed goes. Grace notes and other elements that take
  no offset stay before the next note. Left barlines stay first, right ones
  last.
- The lyrics of a note replaced at the same onset go to the new note (also to
  the tied piece in the next measure); a rest takes none. Ties of the notes
  removed or cut short are undone at both ends.
- `setLength(document, note, length)`: a longer note (with its chord)
  overwrites what follows, across barlines with ties; a shorter one leaves
  rests. The note keeps its lyrics and everything else; a tie on from it is
  undone when its end moves.

### Pitches, chords and rests

- `setPitch(document, note, pitch)` sets `<step>`, `<alter>` (none for a
  natural) and `<octave>`; a rest becomes a note of its length (a measure rest
  needs a length one type can write, else `unsupported_rhythm`). A tie to or
  from it is undone at both ends when the pitch changes.
- `transpose(document, note, semitones)` is Up and Down (±1) and Ctrl+Up and
  Down (±12). Spelt as the key signature has it (F sharp in G major, B flat in
  F major), else as a natural (E up in G major is F natural), else with a sharp
  going up and a flat going down; whole octaves keep the spelling. As in
  MuseScore, the notes tied to it move with it, so the tie stays.
- `pitchForStep(document, position, step, { above? })` is the pitch A–G enter:
  the letter in the octave nearest the note before (within a fourth; the
  clef's middle line before the first note), or the nearest above a pitch
  (Shift+A–G, adding to a chord), altered as the key signature and the
  accidentals earlier in the measure have it. `pitchAbove(document, note,
  interval)` is Alt+1–9: the interval above on the same scale.
- `addChordNote(document, note, pitch)` adds a note after the chord's last,
  with its length, tuplet and stem (`duplicate_pitch` for a pitch already
  there, `not_a_note` on a rest or a grace note).
  `removeChordNote(document, note)` removes one of a chord's notes
  (`not_a_chord` for a note alone); when it is the first, the next note takes
  its place, its lyrics and its notations other than ties.
- `toRest(document, note)` is Delete: a note alone becomes a rest of its length
  (its pitch, accidental, stem, notehead, beams and lyrics go, everything else
  stays); a note of a chord is removed from it.

### Ties

- Ties are written twice, `<tie type>` after the `<duration>` and
  `<notations><tied type>` (made when missing, removed when left empty), a
  stop before a start, across barlines too: as MuseScore writes them, so
  untying and tying again gives MuseScore's own file back.
- `toggleTie(document, note)` (T on a selected note) ties a note to the next
  chord's note of the same pitch (`no_tie_partner` when there is none) or
  unties it; returns the note it is tied to, or null.
- `addTiedNote(document, note, length?)` (T in note input) adds after a note's
  chord a chord of the same pitches tied to it, of its length unless another
  is given, overwriting what follows as `writeNote` does.

### Accidentals, beams and stems

- `updateAccidentals(document, measure)`: an `<accidental>` on every note
  whose alteration differs from what the key signature and the earlier notes
  of its step and octave in the measure give it (a natural to cancel), none on
  a note continuing a tie; a tie from the measure before does not count for
  the later notes, so they show theirs. Accidentals no longer needed are
  removed unless marked as a courtesy (`cautionary`, `editorial`,
  `parentheses`, `bracket`) and still right; one already right is left as
  written; microtones keep theirs.
- `rebeam(document, measure)`: `<beam number="1">` (and 2, 3… for 16ths,
  32nds) `begin`, `continue`, `end`, `forward hook`, `backward hook`, grouped
  as MuseScore 4 groups them by default: in 4/4, 2/2, 3/2 and 4/2 eighths by
  half bar, 16ths by quarter; in 2/4 and 3/4 eighths by bar (the six eighths of
  3/4 in one group), 16ths by quarter; in 3/8, 6/8, 9/8 and 12/8 by dotted
  quarter; 32nds and shorter by eighth; other signatures by beat (a dotted one
  in compound time). Rests and notes of a quarter or longer break beams; a
  lone eighth is not beamed. Beams go on a chord's first note (and on its
  others where the file already writes them). Measures with tuplets are left
  as they are; grace notes keep their own beams. Only beams that differ are
  rewritten.
- Stems: a note's `<stem>` (only where one is written `up` or `down`) is set as
  a reader would by default when its pitch or its group changes: up below the
  middle line of the clef in force, down from it; a chord and a beamed group
  by the note farthest from the middle line (down when as far above as
  below). Notes without a `<stem>` are left for the reader; `none` and
  `double` stay.

### Key and time

- `setKey(document, measure, fifths)` (−7 to 7) writes the `<key>` in the
  `<attributes>` the measure starts with, made after its `<print>` and left
  barline when missing; a key that would repeat the one in force is removed
  instead (with `<attributes>` left empty). Pitches stay as they are: the
  accidentals are written again up to the next key change. A non-traditional
  key becomes a traditional one.
- `setTime(document, measure, beats, beatType)` writes the `<time>` the same
  way (a repeat of the one in force removed; `symbol="common"` or `cut`
  dropped when it no longer fits; composite signatures replaced) and
  **re-bars** the music up to the next time change: the measures are read as
  one stream, each as long as its old time signature made it (so 2/4 bars
  going to 4/4 join in twos), each note goes into the new bar it starts in, split and tied
  across the new barlines, and the last bar is filled with rests; a measure
  rest is kept only where its bar stays a bar. Chord symbols, directions and
  lyrics keep their times; a left barline stays at the bar it starts, a right
  one (a final barline, a repeat) at the bar it ends, a `<print>` at the start
  of its bar. The old measure elements are kept in order (their attributes,
  `width` included, as written), new ones added after them or the extra ones
  removed. A pickup (`implicit="yes"`) at the measure keeps its length and the
  bars after it are re-barred. Returns the measures now in the new time.
- When the count changes, the measures are numbered as
  [new measures are](#measures): 1, 2, 3… renumbered, other numbers kept and
  the new bars lettered after the one before. `cannot_rebar` says why the music cannot be re-barred without the user:
  `pickup` (an incomplete measure inside), `key` (a key change that would fall
  inside a new bar), `barline` (a repeat, ending or other barline that would)
  or `divisions` (the divisions change inside).

### Not done here

Tuplets; inserting notes (shifting the rest of the bar rather than
overwriting); several voices or staves; beaming grace notes; MuseScore's other
rest groupings (its full rhythmic split, beyond the beat rule above). Layout
hints from the program that wrote the file (`default-x`, `default-y`, measure
`width`) are left as they were.
