# Score fixtures

Scores for the tests of `@donizetti/musicxml`. All the music is invented for
these tests, so the files may be used with the rest of the repository (CC0-1.0).
Every file is kept byte for byte as written (`.gitattributes`), since the round
trips compare bytes.

- `invented/lead-sheet.musicxml`: four bars in G written by hand: a repeat,
  a metronome mark, chord symbols, lyrics with a two-syllable word and a
  melisma, eighths beamed, a dotted quarter, a rest and a tie across the
  barline, plus a comment and a `<print>` element the editor never touches.
- `musescore/lead-sheet.musicxml` and `musescore/lead-sheet.mxl`: the same
  sheet opened in MuseScore Studio 4.6.5 and exported (`MuseScore4.exe -o`),
  so the tests read what MuseScore really writes (its layout, `<defaults>`,
  its closing-tag indentation).
