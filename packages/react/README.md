# @donizetti/react

`<ScoreEditor>`: a MusicXML score drawn with OpenSheetMusicDisplay, played
with the host's soundfont and edited with MuseScore's keys. See
[the editor component](../../docs/features/editor.md).

- `src/editor/`: the component, the status line, the exports.
- `src/drawing/`: OSMD's drawing and its index of drawn notes.
- `src/selection/`: a drawn note found in the XML (click to XML).
- `src/editing/`: the selection, undo and redo, the edit commands.
- `src/playback/`: playback with the cursor following.
- `src/keyboard/shortcuts.ts`: every keyboard shortcut.
- `src/strings/`: the typed en-GB messages and the host's overrides.
- `src/style.css`: the styles, themed by `--dz-*` variables.
