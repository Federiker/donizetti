import type { ExportedScore, SavedScore } from "@donizetti/react";
import { DonizettiPluginError, exportPdf, readScore, readSoundfont, writeExport, writeScore } from "@donizetti/tauri";
import { ask, type DialogFilter, open, save } from "@tauri-apps/plugin-dialog";

import { fill, appStrings as text } from "../strings";
import { Cancelled, type Host, type OpenScore } from "./host";
import { baseName, sibling, stem } from "./names";

/** Where a save dialog starts: beside the score when it has a path, else just the name. */
function suggested(score: OpenScore, name: string): string {
  return score.path === undefined ? name : sibling(score.path, name);
}

/** Asks where to write a file; throws `Cancelled` when the user closes the dialog. */
async function chooseSavePath(defaultPath: string, filter: DialogFilter): Promise<string> {
  const path = await save({ defaultPath, filters: [filter] });
  if (path === null) throw new Cancelled();
  return path;
}

/** Writes a new file (Save As): the dialog offers the format the score was read in (decision 18). */
async function saveAs(score: OpenScore, file: SavedScore): Promise<OpenScore> {
  const mxl = file.format === "mxl";
  const path = await chooseSavePath(
    suggested(score, `${stem(score.name)}.${mxl ? "mxl" : "musicxml"}`),
    mxl ? { name: text.mxlFiles, extensions: ["mxl"] } : { name: text.musicXmlFiles, extensions: ["musicxml", "xml"] },
  );
  // The dialog has asked before replacing a file, so whatever is there is overwritten.
  const hash = await writeScore({ path, bytes: file.bytes });
  return { name: baseName(path), bytes: file.bytes, path, hash };
}

/**
 * Writes the score where it was read from, with the hash it was read with: if another program changed the
 * file since, the plugin refuses (`changed_on_disk`), and the user is asked whether to overwrite it.
 */
async function saveInPlace(score: OpenScore & { path: string }, file: SavedScore): Promise<OpenScore> {
  try {
    const hash = await writeScore({ path: score.path, bytes: file.bytes, expectedHash: score.hash });
    return { ...score, bytes: file.bytes, hash };
  } catch (error) {
    if (!(error instanceof DonizettiPluginError) || error.code !== "changed_on_disk") throw error;
    const overwrite = await ask(fill(text.changedOnDiskQuestion, { name: score.name }), {
      title: text.changedOnDiskTitle,
      kind: "warning",
      okLabel: text.overwrite,
      cancelLabel: text.cancel,
    });
    if (!overwrite) throw error;
    const hash = await writeScore({ path: score.path, bytes: file.bytes });
    return { ...score, bytes: file.bytes, hash };
  }
}

/** Writes an export where the user chooses: MIDI and SVG through the plugin's `write_export`, PDF made by it. */
async function exportScore(score: OpenScore, exported: ExportedScore): Promise<void> {
  const name = stem(score.name);
  if (exported.kind === "midi") {
    const path = await chooseSavePath(suggested(score, `${name}.mid`), { name: text.midiFiles, extensions: ["mid"] });
    await writeExport(path, exported.bytes);
  } else if (exported.kind === "svg") {
    const path = await chooseSavePath(suggested(score, `${name}.svg`), { name: text.svgFiles, extensions: ["svg"] });
    const { pages } = exported;
    if (pages.length === 1) {
      await writeExport(path, pages[0] ?? "");
      return;
    }
    // More than one page: each beside the chosen name, numbered from 1 (song-1.svg, song-2.svg…). The dialog only
    // asked about the name chosen, so the numbered files' names are said, and replacing them asked, first.
    const base = path.replace(/\.svg$/i, "");
    const first = baseName(`${base}-1.svg`);
    const last = baseName(`${base}-${pages.length}.svg`);
    const write = await ask(fill(text.svgPagesQuestion, { count: pages.length, first, last }), {
      title: text.svgPagesTitle,
      kind: "info",
      okLabel: text.svgPagesWrite,
      cancelLabel: text.cancel,
    });
    if (!write) throw new Cancelled();
    for (const [index, page] of pages.entries()) await writeExport(`${base}-${index + 1}.svg`, page);
  } else {
    const path = await chooseSavePath(suggested(score, `${name}.pdf`), { name: text.pdfFiles, extensions: ["pdf"] });
    await exportPdf(exported.pages, path);
  }
}

/**
 * The Tauri window: scores opened and saved on disk through `tauri-plugin-donizetti` (with its hash guard),
 * files chosen with Tauri's dialog plugin, exports written by the plugin, and the soundfont the plugin
 * downloaded, once it is installed.
 */
export function tauriHost(soundfontInstalled: boolean): Host {
  return {
    kind: "tauri",
    open: async () => {
      const path = await open({
        multiple: false,
        directory: false,
        filters: [{ name: text.scoreFiles, extensions: ["musicxml", "xml", "mxl"] }],
      });
      if (path === null) return null;
      const { bytes, hash } = await readScore(path);
      return { name: baseName(path), bytes, path, hash };
    },
    save: (score, file) => {
      const { path } = score;
      return path === undefined ? saveAs(score, file) : saveInPlace({ ...score, path }, file);
    },
    export: exportScore,
    soundfont: soundfontInstalled ? readSoundfont : undefined,
  };
}
