import { newScore, type NewScoreOptions } from "@donizetti/musicxml";
import { type ExportedScore, type SavedScore, ScoreEditor } from "@donizetti/react";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useMemo, useState } from "react";

import { browserHost, pickSoundfont, soundfontFromUrl } from "./host/browser";
import { Cancelled, type Host, type OpenScore } from "./host/host";
import { messageOf } from "./host/messages";
import { tauriHost } from "./host/tauri";
import { useSoundfontDownload } from "./host/tauri-soundfont";
import sample from "./samples/little-tune.musicxml?raw";
import { NewScoreDialog } from "./NewScoreDialog";
import { SoundfontOffer } from "./SoundfontOffer";
import { appStrings as text } from "./strings";

const SAMPLE: OpenScore = { name: "little-tune.musicxml", bytes: new TextEncoder().encode(sample) };

/** In the Tauri window (decision 14) the app works on files on disk; anywhere else, in the browser. */
const desktop = isTauri();

/** The demo app: a score opened, played, edited and saved with `<ScoreEditor>`. */
export function App() {
  const [score, setScore] = useState<OpenScore>(SAMPLE);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [picked, setPicked] = useState<Uint8Array | null>(null);
  const [creating, setCreating] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const fromUrl = useMemo(soundfontFromUrl, []);
  const soundfont = useMemo(() => (picked ? async () => picked : fromUrl), [picked, fromUrl]);
  const soundfontFailed = useCallback((error: unknown) => setMessage(messageOf(error, text.soundfontFailed)), []);
  const download = useSoundfontDownload(desktop, soundfontFailed);
  const installed = download.status?.installed != null;
  const host: Host = useMemo(() => (desktop ? tauriHost(installed) : browserHost(soundfont)), [installed, soundfont]);

  const open = useCallback(async () => {
    try {
      const opened = await host.open();
      if (opened) {
        setScore(opened);
        setDirty(false);
        setMessage(null);
      }
    } catch (error) {
      setMessage(messageOf(error, text.openFailed));
    }
  }, [host]);

  /** A new lead sheet (decision 19): not on disk yet, so the first Save asks where. */
  const create = useCallback((options: NewScoreOptions) => {
    const name = `${(options.title || text.untitled).replace(/[\\/:*?"<>|]/g, "")}.musicxml`;
    setScore({ name, bytes: new TextEncoder().encode(newScore(options)) });
    setDirty(false);
    setMessage(null);
    setCreating(false);
  }, []);

  const save = useCallback(
    async (file: SavedScore) => {
      try {
        setScore(await host.save(score, file));
        setMessage(text.saved);
        return true;
      } catch (error) {
        if (error instanceof Cancelled) {
          setMessage(text.notSaved);
          // Not saved, but nothing went wrong: the editor keeps the score unsaved and says nothing more.
          return false;
        }
        setMessage(messageOf(error, text.saveFailed));
        throw error;
      }
    },
    [host, score],
  );

  const exportScore = useCallback(
    async (exported: ExportedScore) => {
      try {
        await host.export(score, exported);
        if (host.kind === "tauri") setMessage(text.exported);
      } catch (error) {
        if (!(error instanceof Cancelled)) setMessage(messageOf(error, text.exportFailed));
      }
    },
    [host, score],
  );

  return (
    <main className="app">
      <header className="app-header">
        <h1>{text.title}</h1>
        <button type="button" onClick={() => setCreating(true)}>
          {text.new}
        </button>
        <button type="button" onClick={() => void open()}>
          {text.open}
        </button>
        <button type="button" onClick={() => setScore(SAMPLE)}>
          {text.sample}
        </button>
        {host.kind === "browser" && !fromUrl && (
          <button type="button" onClick={() => void pickSoundfont().then((bytes) => bytes && setPicked(bytes))}>
            {picked ? text.soundfontReady : text.soundfont}
          </button>
        )}
        {host.kind === "tauri" && <SoundfontOffer download={download} />}
        <label className="app-toggle">
          <input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} />
          {text.readOnly}
        </label>
        <span className="app-file">
          {score.name}
          {dirty && (
            <span className="app-dirty" title={text.unsaved}>
              {" •"}
            </span>
          )}
        </span>
        {message && <span role="status">{message}</span>}
      </header>
      <ScoreEditor
        source={score.bytes}
        fileName={score.name}
        readOnly={readOnly}
        soundfont={host.soundfont}
        onChange={(change) => setDirty(change.dirty)}
        onSave={save}
        onExport={exportScore}
      />
      <NewScoreDialog open={creating} onCreate={create} onClose={() => setCreating(false)} />
    </main>
  );
}
