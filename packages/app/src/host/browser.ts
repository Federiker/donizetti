import type { ExportedScore, SavedScore } from "@donizetti/react";

import type { Host, OpenScore } from "./host";

/** Lets the user pick a file; resolves with null when they cancel. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

function download(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A file name without its score extension. */
export const stem = (name: string) => name.replace(/\.(musicxml|xml|mxl)$/i, "");

/**
 * The browser: scores are picked and downloaded; the soundfont comes from `VITE_SOUNDFONT_URL` (see the
 * app's README) or a file the user picks.
 */
export function browserHost(soundfont: (() => Promise<Uint8Array>) | undefined): Host {
  return {
    kind: "browser",
    open: async () => {
      const file = await pickFile(".musicxml,.xml,.mxl");
      return file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null;
    },
    save: async (score: OpenScore, file: SavedScore) => {
      const name = `${stem(score.name)}.${file.format === "mxl" ? "mxl" : "musicxml"}`;
      download(file.bytes as BlobPart, name, file.mediaType);
      return { ...score, name, bytes: file.bytes };
    },
    export: async (score: OpenScore, exported: ExportedScore) => {
      if (exported.kind === "midi") {
        download(exported.bytes as BlobPart, `${stem(score.name)}.mid`, "audio/midi");
      } else if (exported.kind === "svg") {
        for (const [index, page] of exported.pages.entries()) {
          const suffix = exported.pages.length > 1 ? `-${index + 1}` : "";
          download(page, `${stem(score.name)}${suffix}.svg`, "image/svg+xml");
        }
      } else {
        window.print();
      }
    },
    soundfont,
  };
}

/** The soundfont from `VITE_SOUNDFONT_URL`, if the build names one. */
export function soundfontFromUrl(): (() => Promise<Uint8Array>) | undefined {
  const url = import.meta.env.VITE_SOUNDFONT_URL as string | undefined;
  if (!url) return undefined;
  return async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`soundfont ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  };
}

/** A soundfont the user picks (SF2 or SF3), or null. */
export async function pickSoundfont(): Promise<Uint8Array | null> {
  const file = await pickFile(".sf2,.sf3");
  return file ? new Uint8Array(await file.arrayBuffer()) : null;
}
