# Score fixtures

Small MusicXML scores written for Jerome's tests of score playback (`tests/unit/score-playback.test.ts`);
they are not taken from any other work and may be used with the rest of the repository. Each is read with
OpenSheetMusicDisplay as the app reads a score.

- `simple.musicxml`: one flute part at 60 quarter notes a minute, with a rest and a tie across the bar line.
- `repeats-and-endings.musicxml`: a repeated first measure with first and second endings, then a repeated
  measure on its own and a last measure; one whole note a measure, each a different pitch, so the order
  they are played in shows the road map (C D C E F F G).
- `da-capo-al-fine.musicxml`: a repeated first measure, Fine at the end of the second and D.C. al Fine at
  the end of the third (`<sound fine>` and `<sound dacapo>` with their words); played C C D E C D, the
  repeat not taken again after the D.C.
- `dal-segno-al-coda.musicxml`: a segno, To Coda, D.S. al Coda and the coda (`<sound segno>`, `tocoda`,
  `dalsegno` and `coda`), played C D E F D E G.
- `percussion.musicxml`: a drum part on MIDI channel 10 whose instruments have `midi-unpitched` sounds
  (Bass Drum 1 and Acoustic Snare) and one without (a cowbell), a flute, and a tambourine on a percussion
  clef with no MIDI sound at all.
