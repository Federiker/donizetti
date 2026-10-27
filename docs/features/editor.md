# The editor component

`@donizetti/react` gives one component, `<ScoreEditor>`: a MusicXML score
drawn with OpenSheetMusicDisplay, played with the host's soundfont, and
edited in place with MuseScore's keys when it has one part, one staff and one
voice (decisions 4, 7 and 8). The component reads and writes no files: the
host gives it the file's bytes and gets them back on Save.

## Using it

```tsx
import { ScoreEditor, type ScoreEditorHandle } from "@donizetti/react";
import "@donizetti/react/style.css";

<ScoreEditor
  source={bytes}                    // .musicxml, .xml or .mxl bytes, or MusicXML text
  fileName="song.musicxml"          // for the label and exported files' names
  soundfont={loadSoundfont}         // () => Promise<SF2/SF3 bytes>, called on first play
  onChange={({ document, dirty }) => …}
  onSave={({ bytes, format, mediaType }) => …}   // Ctrl+S; no Save without it
  onExport={(exported) => …}        // MIDI bytes, or SVG pages (also for PDF)
  readOnly={false}
  strings={{ "toolbar.play": "…" }} // or t={(key, values) => …}
  ref={handle}                      // play, pause, stop, undo, redo, save, export
/>;
```

- **`readOnly`** draws, selects, plays and exports any score, and nothing
  more: no note input, editing keys, palette, lyrics, chord symbols, undo or
  Save, and no notice (the host chose it). The demo app has a **Read-only**
  switch in its header.
- **Without `onExport`**, MIDI and SVG are downloaded and PDF is printed by
  the browser; a Tauri host writes them and makes the PDF with
  `@donizetti/tauri`.
- **`dirty`** says whether the score differs from the file read, or from the
  last save.
- **A file that cannot be read** shows why, from the error's code
  (`read.<code>` messages); **a score that cannot be edited** is drawn and
  played with a notice giving every reason (`readOnly.<code>`).

## Drawing and selection

The score is drawn again after each change and when the editor's width
changes; after each drawing every drawn note is matched with its `<note>`
([Click to XML](../research/click-to-xml.md)). A click selects the note
under the pointer (a chord's note by its notehead); the arrows move to the
next or previous note or rest, Ctrl+arrows by measure. The selected notehead
takes the selection colour; the status line under the toolbar says what is
selected ("F♯4, quarter note, measure 2") and is announced by screen readers.
Selecting a note sounds it, and moves where playback starts.

## Playback

Play (Space) plays from the start, or from the selected note; the OSMD cursor
follows the music through its repeats and jumps. After an edit the music is
made again when it is next played. Without a soundfont the toolbar says that
playback needs one. See [Playback](playback.md).

## Interface

Plain React and one stylesheet (decision 5). Every colour and size is a
`--dz-*` variable on `.dz-editor`. The `theme` prop is `auto` (the system's
colour scheme), `light` or `dark`. In a dark theme the score is drawn light
on dark paper (decision 15): the editor reads `--dz-ink` from the stylesheet
when it draws, so a host can set its own ink, and forced colours draw the score
in the system's text colour. SVG and PDF exports and printing are always
black on white: the score is drawn black for the moment it takes. Text comes
from typed en-GB messages (`strings/en-GB.ts`) that the host may replace
(decision 6).

## Keyboard shortcuts

MuseScore 4's defaults (decision 8), all listed in
`packages/react/src/keyboard/shortcuts.ts`. Ctrl is ⌘ on macOS. Digits are
matched by the physical key, so they work on AZERTY keyboards; AltGr
combinations and keys typed in an input method never trigger a shortcut.

| Keys | Action |
| --- | --- |
| N | Note input on or off |
| Esc | Leave note input, or clear the selection |
| A–G | Write that note at the cursor (note input) |
| Shift+A–G | Add that note to the chord |
| Alt+2–9 | Add a note that interval above |
| 1–8 | Length: 64th, 32nd, 16th, eighth, quarter, half, whole, double whole |
| . | Dot |
| 0 | Rest |
| ↑ ↓ | Up or down a semitone |
| Ctrl+↑ Ctrl+↓ | Up or down an octave |
| T | Tie |
| Delete, Backspace | Turn the note into a rest |
| ← → | Previous or next note |
| Ctrl+← Ctrl+→ | Previous or next measure |
| Ctrl+Home, Ctrl+End | First or last measure |
| Space | Play or pause |
| Ctrl+Z, Ctrl+Y (Ctrl+Shift+Z) | Undo, redo |
| Ctrl+S | Save |
| Ctrl+L | Lyrics on the selected note |
| Ctrl+K | Chord symbol on the selected note |

## Editing

Every change goes through the history, so it can be undone, and comes from
the edit operations of [the score document](musicxml.md); one the score
cannot take changes nothing and says why (`edit.<code>` messages).

- **Note input** (N): the cursor (orange) stands where the next note goes.
  A–G write that note at the cursor, in the octave nearest the note before,
  with the length chosen (1–8, and `.` for a dot), overwriting what was there
  and moving the cursor on; 0 writes a rest. The note entered last (blue) is
  what ↑ ↓, Ctrl+↑ ↓, T (a tied note after it), Shift+A–G and Alt+2–9 (chord
  notes) change. A click moves the cursor; Esc leaves note input with that
  note selected.
- **The selected note**, outside note input: A–G set its pitch, ↑ ↓ and
  Ctrl+↑ ↓ move it (with its tie), 1–8 and `.` change its length, Delete and 0
  turn it into a rest, T ties it to the next note of the same pitch.
- **Lyrics** (Ctrl+L) and **chord symbols** (Ctrl+K) are typed in a field by
  the note (decision 16): Space writes the syllable or symbol and goes to the
  next note, `-` writes a hyphen after the syllable, `_` an extender, Enter
  goes to the next verse (in a chord symbol, Enter closes), Backspace in an
  empty field goes back, Esc closes. An empty field removes what was there.
- **The palette** (decision 17), beside the score and above it at narrow
  widths, applies to the selected note's measure: key and time signatures,
  tempo (at the note), start and end repeats and barlines, endings ("1",
  "1, 2", "1-3"), segno, coda, To Coda, Fine, D.C., D.S. and their al Fine
  and al Coda, and measures inserted, added or removed.
