import { describe, expect, it, vi } from "vitest";
import {
  installSoundfont,
  readSoundfont,
  removeSoundfont,
  type SoundfontProgress,
  type SoundfontStatus,
  soundfontStatus,
} from "../src/index";
import { mockPlugin, sendOnChannel } from "./plugin";

const notInstalled: SoundfontStatus = {
  soundfont: {
    id: "musescore-general",
    name: "MuseScore General",
    version: "0.2.0",
    licence: "MIT",
    url: "https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3",
    bytes: 39_900_972,
    sha512: "2456",
    fileName: "MuseScore_General.sf3",
  },
  installed: null,
  installing: false,
};

const installed: SoundfontStatus = {
  ...notInstalled,
  installed: { path: "data/soundfonts/MuseScore_General.sf3", noticePath: "data/n.md", bytes: 39_900_972 },
};

describe("soundfontStatus", () => {
  it("answers the plugin's status", async () => {
    const calls = mockPlugin(() => notInstalled);
    expect(await soundfontStatus()).toEqual(notInstalled);
    expect(calls[0]?.command).toBe("plugin:donizetti|soundfont_status");
  });

  it("refuses an answer that is not a status", async () => {
    for (const wrong of [
      null,
      {},
      { ...notInstalled, soundfont: { name: 1 } },
      { ...notInstalled, installed: { path: 2 } },
      { ...notInstalled, installing: "no" },
    ]) {
      mockPlugin(() => wrong);
      await expect(soundfontStatus()).rejects.toMatchObject({ code: "invalid_response" });
    }
  });
});

describe("installSoundfont", () => {
  it("reports the progress the plugin sends on its channel", async () => {
    const calls = mockPlugin(({ args }) => {
      const channel = (args as { onProgress: unknown }).onProgress;
      sendOnChannel(channel, 0, { received: 0, total: 10 });
      sendOnChannel(channel, 1, { received: 10, total: 10 });
      return installed;
    });
    const progress: SoundfontProgress[] = [];
    expect(await installSoundfont((report) => progress.push(report))).toEqual(installed);
    expect(progress).toEqual([
      { received: 0, total: 10 },
      { received: 10, total: 10 },
    ]);
    expect(calls.map((call) => call.command)).toEqual(["plugin:donizetti|install_soundfont"]);
  });

  it("needs no progress handler", async () => {
    mockPlugin(({ args }) => {
      sendOnChannel((args as { onProgress: unknown }).onProgress, 0, { received: 0, total: 10 });
      return installed;
    });
    expect(await installSoundfont()).toEqual(installed);
  });

  it("cancels the download when the signal aborts", async () => {
    const controller = new AbortController();
    let finish: (value: unknown) => void = () => undefined;
    const calls = mockPlugin(({ command }) => {
      if (command === "plugin:donizetti|install_soundfont") {
        return new Promise((_, reject) => {
          finish = reject;
        });
      }
      finish({ code: "soundfont_cancelled", params: {} });
      return null;
    });
    const installing = installSoundfont(undefined, { signal: controller.signal });
    controller.abort();
    await expect(installing).rejects.toMatchObject({ code: "soundfont_cancelled" });
    expect(calls.map((call) => call.command)).toEqual([
      "plugin:donizetti|install_soundfont",
      "plugin:donizetti|cancel_soundfont_install",
    ]);
  });

  it("does not start with a signal already aborted", async () => {
    const handler = vi.fn();
    mockPlugin(handler);
    const controller = new AbortController();
    controller.abort();
    await expect(installSoundfont(undefined, { signal: controller.signal })).rejects.toMatchObject({
      code: "soundfont_cancelled",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("stops listening for the signal once settled", async () => {
    const calls = mockPlugin(() => installed);
    const controller = new AbortController();
    await installSoundfont(undefined, { signal: controller.signal });
    controller.abort();
    expect(calls).toHaveLength(1);
  });

  it("passes a failed download on", async () => {
    mockPlugin(() => {
      throw { code: "soundfont_download_failed", params: { reason: "status", status: 404 } };
    });
    await expect(installSoundfont()).rejects.toMatchObject({
      code: "soundfont_download_failed",
      params: { reason: "status", status: 404 },
    });
  });
});

describe("readSoundfont and removeSoundfont", () => {
  it("reads the bytes", async () => {
    mockPlugin(() => new Uint8Array([82, 73, 70, 70]).buffer);
    expect(Array.from(await readSoundfont())).toEqual([82, 73, 70, 70]);
  });

  it("refuses an answer that is not bytes", async () => {
    mockPlugin(() => ({ bytes: [] }));
    await expect(readSoundfont()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("removes the soundfont", async () => {
    const calls = mockPlugin(() => notInstalled);
    expect(await removeSoundfont()).toEqual(notInstalled);
    expect(calls[0]?.command).toBe("plugin:donizetti|remove_soundfont");
  });
});
