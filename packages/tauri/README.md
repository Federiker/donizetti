# @donizetti/tauri

The typed client of [`tauri-plugin-donizetti`](../../crates/tauri-plugin/README.md),
for a Tauri 2 app that uses `<ScoreEditor>`. It depends only on
`@tauri-apps/api`; the other Donizetti packages never import Tauri.
Released as a tarball on each GitHub release, beside the plugin taken by git
at the same tag:

```sh
bun add https://github.com/Federiker/donizetti/releases/download/v0.1.0/donizetti-tauri-0.1.0.tgz
```

- `readScore(path)` → `{ bytes, hash }`; `writeScore({ path, bytes, expectedHash? })`
  → the new hash, refused with `changed_on_disk` when the file changed since
  it was read.
- `soundfontStatus()`, `installSoundfont(onProgress?, { signal? })`,
  `readSoundfont()`, `removeSoundfont()`: MuseScore General, downloaded only
  when asked.
- `exportPdf(pages, path)`: the score's SVG pages as one PDF.
- `writeExport(path, content)`: a MIDI file's bytes or an SVG page's text
  written to `path`, with no hash guard (ask before replacing a file).

A failure is always a `DonizettiPluginError` with the plugin's `code` and
`params` (`pluginErrorCodes` lists them), `invalid_response` for an answer of
the wrong shape, or `unknown` for anything else (its text in
`params.detail`). The commands, their messages and the error codes are in
[the Tauri integration](../../docs/features/tauri.md).

Tests are in `tests` and stand in for the plugin with Tauri's own IPC mocks
(`tests/plugin.ts`), so channels work as in the app.
