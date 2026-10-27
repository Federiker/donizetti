import { Channel } from "@tauri-apps/api/core";
import { binaryAnswer } from "./bytes";
import { call } from "./call";
import { DonizettiPluginError, invalidResponse } from "./errors";

/** The soundfont on offer: what it is and exactly what the download must be. */
export interface Soundfont {
  id: string;
  name: string;
  version: string;
  licence: string;
  url: string;
  bytes: number;
  sha512: string;
  fileName: string;
}

/** The installed soundfont: where it is, where its notice (acknowledgements and licence) is, its size. */
export interface InstalledSoundfont {
  path: string;
  noticePath: string;
  bytes: number;
}

export interface SoundfontStatus {
  soundfont: Soundfont;
  installed: InstalledSoundfont | null;
  /** Whether a download is running now. */
  installing: boolean;
}

/** How much of the soundfont has arrived, in bytes. */
export interface SoundfontProgress {
  received: number;
  total: number;
}

export interface InstallOptions {
  /** Aborting it stops the download, which then fails with `soundfont_cancelled`. */
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function status(command: string, answer: unknown): SoundfontStatus {
  if (
    !isRecord(answer) ||
    !isRecord(answer.soundfont) ||
    typeof answer.soundfont.name !== "string" ||
    typeof answer.soundfont.bytes !== "number" ||
    !(answer.installed === null || (isRecord(answer.installed) && typeof answer.installed.path === "string")) ||
    typeof answer.installing !== "boolean"
  ) {
    throw invalidResponse(command, "not a soundfont status");
  }
  return answer as unknown as SoundfontStatus;
}

/** The soundfont on offer, whether it is installed and whether it is being downloaded. */
export async function soundfontStatus(): Promise<SoundfontStatus> {
  return status("soundfont_status", await call("soundfont_status"));
}

/**
 * Downloads MuseScore General (about 38 MB), checks its size and SHA-512 and installs it with its
 * notice; resolves to the new status. Only on the user's request: nothing is downloaded otherwise. An
 * installed soundfont is not downloaded again. `onProgress` hears at the start, every 256 KiB and at
 * the end.
 *
 * @throws DonizettiPluginError `soundfont_busy`, `soundfont_cancelled`, `soundfont_download_failed`
 * (with `reason`, and `status` for an HTTP answer), `soundfont_verification_failed` or
 * `soundfont_storage_failed`; nothing is installed after any of them.
 */
export async function installSoundfont(
  onProgress?: (progress: SoundfontProgress) => void,
  { signal }: InstallOptions = {},
): Promise<SoundfontStatus> {
  if (signal?.aborted) throw new DonizettiPluginError("soundfont_cancelled");
  const channel = new Channel<SoundfontProgress>((progress) => onProgress?.(progress));
  const cancel = () => {
    // A cancel that fails leaves the download running; its result still settles the promise.
    void call("cancel_soundfont_install").catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    return status("install_soundfont", await call("install_soundfont", { onProgress: channel }));
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

/**
 * The installed soundfont's bytes, for `<ScoreEditor soundfont>`.
 *
 * @throws DonizettiPluginError `soundfont_not_installed` or `soundfont_storage_failed`.
 */
export async function readSoundfont(): Promise<Uint8Array> {
  const bytes = binaryAnswer(await call("read_soundfont"));
  if (!bytes) throw invalidResponse("read_soundfont", "not the soundfont's bytes");
  return bytes;
}

/**
 * Removes the soundfont and its notice; resolves to the new status.
 *
 * @throws DonizettiPluginError `soundfont_busy` while it downloads, or `soundfont_storage_failed`.
 */
export async function removeSoundfont(): Promise<SoundfontStatus> {
  return status("remove_soundfont", await call("remove_soundfont"));
}
