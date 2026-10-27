import { type ExportedScore, type SavedScore, ScoreEditor } from "@donizetti/react";
import { useCallback, useMemo, useState } from "react";

import { browserHost, pickSoundfont, soundfontFromUrl } from "./host/browser";
import type { Host, OpenScore } from "./host/host";
import sample from "./samples/little-tune.musicxml?raw";
import { appStrings as text } from "./strings";

const SAMPLE: OpenScore = { name: "little-tune.musicxml", bytes: new TextEncoder().encode(sample) };

/** The demo app: a score opened, played, edited and saved with `<ScoreEditor>`. */
export function App() {
  const [score, setScore] = useState<OpenScore>(SAMPLE);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [picked, setPicked] = useState<Uint8Array | null>(null);
  const fromUrl = useMemo(soundfontFromUrl, []);
  const soundfont = useMemo(() => (picked ? async () => picked : fromUrl), [picked, fromUrl]);
  const host: Host = useMemo(() => browserHost(soundfont), [soundfont]);

  const open = useCallback(async () => {
    try {
      const opened = await host.open();
      if (opened) {
        setScore(opened);
        setDirty(false);
        setMessage(null);
      }
    } catch {
      setMessage(text.openFailed);
    }
  }, [host]);

  const save = useCallback(
    async (file: SavedScore) => {
      setScore(await host.save(score, file));
      setMessage(text.saved);
    },
    [host, score],
  );

  const exportScore = useCallback((exported: ExportedScore) => host.export(score, exported), [host, score]);

  return (
    <main className="app">
      <header className="app-header">
        <h1>{text.title}</h1>
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
        soundfont={host.soundfont}
        onChange={(change) => setDirty(change.dirty)}
        onSave={save}
        onExport={exportScore}
      />
    </main>
  );
}
