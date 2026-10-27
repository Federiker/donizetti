import { installSoundfont, type SoundfontProgress, type SoundfontStatus, soundfontStatus } from "@donizetti/tauri";
import { useCallback, useEffect, useRef, useState } from "react";

export type SoundfontDownload = {
  /** What the plugin offers and whether it is installed; null until it has answered (and in the browser). */
  status: SoundfontStatus | null;
  /** How much has arrived while a download runs, else null. */
  progress: SoundfontProgress | null;
  /** Downloads and installs the soundfont (only on the user's request, decision 10). */
  install: () => Promise<void>;
  /** Stops the download; it then fails with `soundfont_cancelled`. */
  cancel: () => void;
};

/**
 * The desktop app's soundfont: its status asked once at the start, and the download the user asks for, with
 * its progress and Cancel. `onError` hears what failed (a cancelled download included). Does nothing when
 * `enabled` is false (the browser).
 */
export function useSoundfontDownload(enabled: boolean, onError: (error: unknown) => void): SoundfontDownload {
  const [status, setStatus] = useState<SoundfontStatus | null>(null);
  const [progress, setProgress] = useState<SoundfontProgress | null>(null);
  const running = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let current = true;
    soundfontStatus().then(
      (answer) => current && setStatus(answer),
      (error: unknown) => current && onError(error),
    );
    return () => {
      current = false;
    };
  }, [enabled, onError]);

  // A window that goes away stops its download.
  useEffect(() => () => running.current?.abort(), []);

  const install = useCallback(async () => {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setProgress({ received: 0, total: status?.soundfont.bytes ?? 0 });
    try {
      setStatus(await installSoundfont(setProgress, { signal: controller.signal }));
    } catch (error) {
      onError(error);
    } finally {
      running.current = null;
      setProgress(null);
    }
  }, [status, onError]);

  const cancel = useCallback(() => running.current?.abort(), []);

  return { status, progress, install, cancel };
}
