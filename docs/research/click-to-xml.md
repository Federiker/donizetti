# Click to XML (27 October 2026)

The riskiest part of editing (see [Score editing](score-editing.md#what-the-edit-layer-has-to-get-right)):
OpenSheetMusicDisplay keeps no link from a note it draws to the `<note>` in
the file, so a click must be mapped through what OSMD does keep (the measure,
the time in it, the staff, the pitch) to the same note in the XML. This was
proved first, before any editing was built on it.

## How it works

1. **Point to drawn note**: OSMD's `GraphicSheet.GetNearestNote` finds the
   nearest voice entry (a chord, a note or a rest), then its note nearest the
   point (`nearestDrawnNote` in `@donizetti/react`).
2. **Drawn note to location**: OSMD's instruments are the score's parts in
   order, its source measures the measures in order, an instrument's staves
   the part's staves; a voice entry's timestamp is in whole notes from the
   start of its measure (`locationOf`).
3. **Location to `<note>`**: the score map of `@donizetti/musicxml` gives each
   note's onset in whole notes, following `<backup>`, `<forward>`, chords and
   divisions; `noteAt(map, measure, onset, { staff, grace, midi })` picks it,
   the nearest pitch in a chord (`mappedNoteOf`).

## The proof

A probe (in `tmp/click-probe/`, not tracked) drew each score with OSMD 2.2.1 in
Chromium (Playwright 1.6x, the engine of WebView2), and for **every** note OSMD
drew checked that it maps to a `<note>` with the same pitch, rest and length,
and that a click where OSMD placed it finds that note again.

The scores: the MusicXML example set (12 Finale v27 exports of public-domain
music, from musicxml.com) and the 391 MusicXML files of OSMD's own test data
(153 MuseScore 3, 18 MuseScore Studio 4, 33 Sibelius, 5 Dorico, 12 Finale,
Noteflight and others), plus Donizetti's MuseScore 4.6.5 fixtures (plain and
`.mxl`). The files stay in `tmp/`; none is in the repository.

| Files | Notes mapped to the right `<note>` | Clicks finding the note |
| --- | ---: | ---: |
| Editable (one part, one staff, one voice): 203 | 2 775 of 2 827 (98.2%) | 2 826 of 2 827 |
| All: 406 | 34 460 of 34 860 (98.9%) | 34 484 of 34 860 (98.9%) |

What is left, in the editable files:

- **Quarter tones** (12 notes): mapped right; the probe compared OSMD's
  half-semitone `halfTone` with a MIDI key rounded to a semitone.
- **Tuplets whose `<duration>` disagrees with `<type>` and
  `<time-modification>`** (OSMD's deliberately odd test files and one
  `musx2mxl` export, 25 notes): OSMD times them from the type, the map from
  the duration, so their onsets differ. MuseScore, Sibelius, Finale and Dorico
  write consistent durations; the editor always does.
- **Grace notes after their main note** (12 notes): OSMD places them at the
  main note's onset, the map after it.
- One unpitched TAB note in a bass-guitar tablature (hit test).

Two things the probe found were fixed in the code: a UTF-8 file declaring
`encoding="UTF-16"` (a Sibelius export re-saved by an editor) is now read as
UTF-8, as browsers do; and a grace note is told from its main note, which
starts at the same moment (`NoteQuery.grace`).

**Conclusion:** the mapping holds on real exports from every major program;
the editor builds on it. Multi-part scores map as well as lead sheets, so
selection and seeking work in read-only scores too.
