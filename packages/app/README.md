# @donizetti/app

The demo app: `<ScoreEditor>` with a score opened, played, edited and saved
(decision 14). One Vite app runs in two places, and `src/host/` is the
integration a host app writes around the component:

- **In the browser** (`mise run dev`, port 1430; the end-to-end tests use
  it): scores are picked and downloaded (`host/browser.ts`). Playback needs
  a soundfont: pick one with **Soundfont…**, or set `VITE_SOUNDFONT_URL` (in
  `packages/app/.env.local`) to an SF2 or SF3 file the dev server can fetch.
- **As a Tauri window** (`mise run tauri:dev`): scores are opened and saved on
  disk through `tauri-plugin-donizetti`, with its hash guard, and the
  soundfont is downloaded on request (`host/tauri.ts`); see
  [the demo app](../../docs/features/tauri.md#the-demo-app) for how it uses
  the plugin.

`App.tsx` picks the host: Tauri when `isTauri()` says so, else the browser.
The app's own text is in `src/strings.ts`; the editor's comes from
`@donizetti/react`.

The native side is `src-tauri/`, the crate `donizetti_app` (a member of the
root Cargo workspace): it registers `tauri_plugin_donizetti::init()` and
Tauri's dialog plugin, and its capability (`capabilities/main.json`) grants
`core:default`, `dialog:default` and `donizetti:default`. `tauri dev` starts
Vite (`bun run dev`) and opens the window on it; `cargo build -p
donizetti_app` builds the native side alone.

The logo is `src/assets/logo.svg` (CC0-1.0, made for Donizetti); `bun run
--filter @donizetti/app icons` makes the window's and the bundles' icons from
it in `src-tauri/icons` (PNG, ICO and ICNS, kept in Git LFS).

Tests of the Tauri host (`tests/`, `bun run --filter @donizetti/app test`)
stand in for the window with Tauri's IPC mocks; the rest of the app is tested
end to end in the browser.
