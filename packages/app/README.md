# @donizetti/app

The demo app: `<ScoreEditor>` with a score opened, played, edited and saved.
In the browser (`mise run dev`, port 1430) scores are picked and downloaded;
as a Tauri window (`mise run tauri:dev`) they are opened and saved on disk
through `tauri-plugin-donizetti`. `src/host/` is the integration a host app
writes around the component.

Playback in the browser needs a soundfont: pick one with **Soundfont…**, or
set `VITE_SOUNDFONT_URL` (in `packages/app/.env.local`) to an SF2 or SF3 file
the dev server can fetch.
