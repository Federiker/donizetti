# donizetti_soundfonts

The General MIDI soundfont Donizetti plays with:
[MuseScore General](https://musescore.org) 0.2.0 (SF3, MIT, about 40 MB),
pinned by address, size and SHA-512 as jerome pins it.

`Installer` keeps it in a folder its caller chooses (the Tauri plugin uses the
app's data folder). It downloads it over HTTPS (no redirects, no proxy,
checked while downloading, staged as `.part` then renamed), installs it from a
file already on the computer if it is exactly the pinned one, reads it for the
player and removes it. Its notice
([notices/MuseScore_General_License.md](notices/MuseScore_General_License.md)),
the acknowledgements and licence that must accompany it, is stored beside it
as `MuseScore_General.sf3.LICENSE.md`.

Errors serialise as `{ code, params }` (`soundfont_download_failed` with
`{ reason, status? }`, `soundfont_storage_failed` with `{ path, detail }`…).
Tests are in `tests/unit`; two ignored tests check the real file
(`DONIZETTI_SOUNDFONT_FILE`) and the real download.
