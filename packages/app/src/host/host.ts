import type { ExportedScore, SavedScore } from "@donizetti/react";

/** A score the app has open: its name, its bytes, and where it came from (a path in the desktop app). */
export type OpenScore = { name: string; bytes: Uint8Array; path?: string; hash?: string };

/**
 * What the demo app needs from where it runs: the browser (files picked and downloaded) or the Tauri window
 * (files on disk, the soundfont downloaded, PDF written by the plugin). This is the integration a host app
 * writes around `<ScoreEditor>`.
 */
export type Host = {
  kind: "browser" | "tauri";
  /** Asks for a score to open; null when the user cancels. */
  open: () => Promise<OpenScore | null>;
  /** Writes the saved file, and returns the score as now stored. */
  save: (score: OpenScore, file: SavedScore) => Promise<OpenScore>;
  /** Writes an export beside the score, or wherever the user chooses. */
  export: (score: OpenScore, exported: ExportedScore) => Promise<void>;
  /** The soundfont's bytes, or undefined while there is none. */
  soundfont: (() => Promise<Uint8Array>) | undefined;
};
