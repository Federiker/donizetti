import type { SoundfontDownload } from "./host/tauri-soundfont";
import { fill, appStrings as text } from "./strings";

/**
 * The desktop app's header offer: while the soundfont is not installed, a button to download it (with its
 * size), then the download's progress and Cancel. Nothing once it is installed.
 */
export function SoundfontOffer({ download }: { download: SoundfontDownload }) {
  const { status, progress, install, cancel } = download;
  if (!status || status.installed) return null;
  if (progress) {
    const percent = progress.total > 0 ? Math.floor((progress.received / progress.total) * 100) : 0;
    return (
      <span className="app-soundfont">
        <progress max={progress.total || 1} value={progress.received} aria-label={text.soundfontProgress} />
        <span>{fill(text.soundfontDownloading, { percent })}</span>
        <button type="button" onClick={cancel}>
          {text.cancel}
        </button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => void install()}>
      {/* In MB of 1024 × 1024 bytes, as the docs give it (38 MB). */}
      {fill(text.soundfontDownload, { size: Math.round(status.soundfont.bytes / 1024 / 1024) })}
    </button>
  );
}
