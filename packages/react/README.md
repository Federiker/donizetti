# @donizetti/react

`<ScoreEditor>`: a MusicXML score drawn with OpenSheetMusicDisplay, played
with the host's soundfont and edited with MuseScore's keys. See
[the editor component](../../docs/features/editor.md).

Released as a tarball on each GitHub release (with `react` and `react-dom` as
peers; it brings `@donizetti/musicxml` and `@donizetti/playback`):

```sh
bun add https://github.com/Federiker/donizetti/releases/download/v0.1.0/donizetti-react-0.1.0.tgz
```

Its stylesheet is `@donizetti/react/style.css`. In a Vite app, the dev server
needs `optimizeDeps: { exclude: ["@donizetti/playback"] }` for the player's
AudioWorklet (see [Playback](../../docs/features/playback.md#the-processor-url)).

- `src/editor/`: the component, the status line, the exports.
- `src/drawing/`: OSMD's drawing and its index of drawn notes.
- `src/selection/`: a drawn note found in the XML (click to XML).
- `src/editing/`: the selection, undo and redo, the edit commands.
- `src/playback/`: playback with the cursor following.
- `src/keyboard/shortcuts.ts`: every keyboard shortcut.
- `src/strings/`: the typed en-GB messages and the host's overrides.
- `src/style.css`: the styles, themed by `--dz-*` variables.
