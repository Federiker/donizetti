# Score playback research (20 October 2026)

Carried over from jerome's research of the same date, behind its score
player, which Donizetti's playback package continues.

Research from npm and the projects' own pages on 20 October 2026.

## Drawing and playing

- **OpenSheetMusicDisplay** 2.2.1 (BSD-3-Clause, about 2.3 MB unpacked,
  maintained) draws MusicXML in the browser with its own glyphs, so no separate
  music-font download is needed. Its audio player is an early-access build for
  GitHub sponsors only; the community `osmd-audio-player` (MIT, 0.7.0, last
  published 2022) is no longer developed.
- **SpessaSynth** (`spessasynth_lib` 4.3.14, Apache-2.0, no dependencies beyond
  `spessasynth_core`) plays notes and MIDI files with SF2, SF3 and DLS
  soundfonts in an AudioWorklet (its processor file is served with the app).
- **Verovio** 6.3.0 (LGPL-3.0-or-later, about 27 MB unpacked) draws scores and
  renders MIDI with repeats and tempo, and reports the notes sounding at a
  time; rejected for its licence and size.

## Soundfonts

- **MuseScore General** (MIT; Frank Wen, Michael Cowgill, S. Christian
  Collins, Ethan Winer, Michael Schorsch; 38 MB as SF3, 206 MB as SF2, at
  ftp.osuosl.org/pub/musescore/soundfont; its notices must accompany it).
  Chosen.
- **FluidR3Mono** (MIT, about 14 MB, mono).
- **GeneralUser GS**: a custom licence whose author warns that some sample
  sources are uncertain; not used.
