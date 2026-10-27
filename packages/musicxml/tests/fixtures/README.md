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

What MuseScore Studio 4.6.5 writes for what the editor writes, exported with
`MuseScore4.exe -o` from scores it read: the notes, lyrics, barlines, endings
and tempos from invented MusicXML, the chord symbols (as typed), markers and
jumps as MuseScore's own `.mscx` elements (its MusicXML import reads jumps
and markers as plain staff text):

- `musescore/chord-symbols.musicxml`: sixteen bars of quarters with 64 chord
  symbols typed into MuseScore, in this order: C, Cm, Am7, F/A, Bb7b9, F#m7b5,
  Csus4, Csus2, Csus, Gmaj7, C6/9, C6, Cm6, D°, Ddim, Dø7, Dø, Dm7b5, C+, Caug,
  C+7, C7#5, Cdim7, C°7, E7#9, C9, Cmaj9, Cm9, C11, Cm11, C13, Cmaj13, Cm13,
  C7sus4, C7b5, Cadd9, Cadd2, C5, Cm(maj7), CmMaj7, C7alt, C7#11, C9#11,
  C13b9, N.C., C(no3), Cmi7, C-7, Cmin, C7b9#11, Gb, Ebm, C/E, Am/G, D/F#,
  Csus4/G, C2, CΔ7, CM7, Cma7, Cm7b9, C7(b9), C9sus4, C(add9).
- `musescore/navigation.musicxml`: twelve bars with a segno, Fine, To Coda,
  a coda and the jumps D.C., D.C. al Fine, D.S. al Coda, D.S. al Fine,
  D.C. al Coda and D.S. as MuseScore's own markers and jumps; and lyrics in
  two verses, a hyphenated three-syllable word, a melisma over three notes
  and an elision (which MuseScore writes as one text, `a‿e`).
- `musescore/repeats-and-endings.musicxml`: ten bars with a double barline,
  start and end repeats (one played three times), first and second endings
  (the second open), an ending for times 1 and 2, a third ending, metronome
  marks for a half note and a dotted quarter, a whole-measure rest and a
  final barline.
