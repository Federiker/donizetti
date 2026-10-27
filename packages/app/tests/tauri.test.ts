import { DonizettiPluginError } from "@donizetti/tauri";
import { describe, expect, it } from "vitest";

import { Cancelled, type OpenScore } from "../src/host/host";
import { messageOf } from "../src/host/messages";
import { tauriHost } from "../src/host/tauri";
import { type Call, mockTauri } from "./ipc";

const HASH = "a".repeat(64);
const NEW_HASH = "b".repeat(64);
const encoder = new TextEncoder();
const bytes = encoder.encode("<score-partwise/>");
const saved = { bytes, format: "musicxml", mediaType: "application/vnd.recordare.musicxml+xml" } as const;
const onDisk: OpenScore = { name: "Für Elise.xml", bytes, path: "C:\\Scores\\Für Elise.xml", hash: HASH };

const header = (call: Call | undefined, name: string) =>
  (call?.options?.headers as Record<string, string> | undefined)?.[name];
const commands = (calls: Call[]) => calls.map((call) => call.command);

describe("the Tauri host", () => {
  it("opens a score chosen in the dialog, with its hash", async () => {
    const calls = mockTauri(({ command }) =>
      command === "plugin:dialog|open"
        ? "/home/me/Scores/song.mxl"
        : (encoder.encode(`${HASH}PK`).buffer as ArrayBuffer),
    );
    const opened = await tauriHost(false).open();
    expect(opened).toEqual({
      name: "song.mxl",
      bytes: encoder.encode("PK"),
      path: "/home/me/Scores/song.mxl",
      hash: HASH,
    });
    expect(calls[0]?.args).toEqual({
      options: {
        multiple: false,
        directory: false,
        filters: [{ name: "MusicXML scores", extensions: ["musicxml", "xml", "mxl"] }],
      },
    });
    expect(calls[1]).toMatchObject({
      command: "plugin:donizetti|read_score",
      args: { path: "/home/me/Scores/song.mxl" },
    });
  });

  it("opens nothing when the dialog is cancelled", async () => {
    const calls = mockTauri(() => null);
    expect(await tauriHost(false).open()).toBeNull();
    expect(commands(calls)).toEqual(["plugin:dialog|open"]);
  });

  it("saves where the score was read, quoting its hash", async () => {
    const calls = mockTauri(() => NEW_HASH);
    const stored = await tauriHost(false).save(onDisk, saved);
    expect(stored).toEqual({ ...onDisk, hash: NEW_HASH });
    expect(commands(calls)).toEqual(["plugin:donizetti|write_score"]);
    expect(calls[0]?.args).toBe(bytes);
    expect(header(calls[0], "Donizetti-Path")).toBe(encodeURIComponent(onDisk.path ?? ""));
    expect(header(calls[0], "Donizetti-Expected-Hash")).toBe(HASH);
  });

  it("asks before overwriting a file another program changed, and overwrites it on yes", async () => {
    let writes = 0;
    const calls = mockTauri(({ command }) => {
      if (command === "plugin:dialog|message") return "Overwrite";
      writes += 1;
      if (writes === 1)
        throw { code: "changed_on_disk", params: { path: onDisk.path, expectedHash: HASH, actualHash: "c" } };
      return NEW_HASH;
    });
    const stored = await tauriHost(false).save(onDisk, saved);
    expect(stored.hash).toBe(NEW_HASH);
    expect(commands(calls)).toEqual([
      "plugin:donizetti|write_score",
      "plugin:dialog|message",
      "plugin:donizetti|write_score",
    ]);
    expect(calls[1]?.args).toMatchObject({
      title: "The file has changed",
      kind: "warning",
      buttons: { OkCancelCustom: ["Overwrite", "Cancel"] },
    });
    expect(header(calls[2], "Donizetti-Expected-Hash")).toBeUndefined();
  });

  it("leaves a file another program changed alone when the user says no", async () => {
    const calls = mockTauri(({ command }) => {
      if (command === "plugin:dialog|message") return "Cancel";
      throw { code: "changed_on_disk", params: { path: onDisk.path, expectedHash: HASH, actualHash: "c" } };
    });
    const error = await tauriHost(false)
      .save(onDisk, saved)
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "changed_on_disk" });
    expect(messageOf(error, "")).toBe("Für Elise.xml was changed by another program, so it was not overwritten.");
    expect(commands(calls)).toEqual(["plugin:donizetti|write_score", "plugin:dialog|message"]);
  });

  it("passes other failures on without asking", async () => {
    mockTauri(() => {
      throw { code: "write_failed", params: { path: onDisk.path, detail: "denied" } };
    });
    await expect(tauriHost(false).save(onDisk, saved)).rejects.toMatchObject({ code: "write_failed" });
  });

  it("asks where to save a score that has no file, in the format it was read in", async () => {
    const calls = mockTauri(({ command }) => (command === "plugin:dialog|save" ? "D:\\Out\\tune.mxl" : NEW_HASH));
    const sample: OpenScore = { name: "tune.mxl", bytes };
    const stored = await tauriHost(false).save(sample, { ...saved, format: "mxl" });
    expect(stored).toEqual({ name: "tune.mxl", bytes, path: "D:\\Out\\tune.mxl", hash: NEW_HASH });
    expect(calls[0]?.args).toEqual({
      options: { defaultPath: "tune.mxl", filters: [{ name: "Compressed MusicXML", extensions: ["mxl"] }] },
    });
    expect(header(calls[1], "Donizetti-Expected-Hash")).toBeUndefined();
  });

  it("saves nothing when Save As is cancelled", async () => {
    const calls = mockTauri(() => null);
    await expect(tauriHost(false).save({ name: "tune.musicxml", bytes }, saved)).rejects.toBeInstanceOf(Cancelled);
    expect(calls[0]?.args).toMatchObject({
      options: { defaultPath: "tune.musicxml", filters: [{ extensions: ["musicxml", "xml"] }] },
    });
    expect(commands(calls)).toEqual(["plugin:dialog|save"]);
  });

  it("writes a MIDI file where the user chooses, starting beside the score", async () => {
    const midi = new Uint8Array([77, 84, 104, 100]);
    const calls = mockTauri(({ command }) => (command === "plugin:dialog|save" ? "C:\\Scores\\Für Elise.mid" : null));
    await tauriHost(false).export(onDisk, { kind: "midi", bytes: midi });
    expect(calls[0]?.args).toMatchObject({ options: { defaultPath: "C:\\Scores\\Für Elise.mid" } });
    expect(calls[1]).toMatchObject({ command: "plugin:donizetti|write_export", args: midi });
    expect(header(calls[1], "Donizetti-Path")).toBe(encodeURIComponent("C:\\Scores\\Für Elise.mid"));
  });

  it("writes one SVG file a page, numbered when there are several", async () => {
    let calls = mockTauri(({ command }) => (command === "plugin:dialog|save" ? "/tmp/song.svg" : null));
    await tauriHost(false).export(onDisk, { kind: "svg", pages: ["<svg/>"] });
    expect(calls.slice(1).map((call) => header(call, "Donizetti-Path"))).toEqual([encodeURIComponent("/tmp/song.svg")]);

    // Several pages: the numbered names are said, and replacing them asked, before anything is written.
    calls = mockTauri(({ command }) => {
      if (command === "plugin:dialog|save") return "/tmp/song.svg";
      if (command === "plugin:dialog|message") return "Write the pages";
      return null;
    });
    await tauriHost(false).export(onDisk, { kind: "svg", pages: ["<svg>1</svg>", "<svg>2</svg>"] });
    expect(calls[1]?.args).toMatchObject({
      message:
        "The score has 2 pages, written as song-1.svg to song-2.svg, replacing any files with those names. Write them?",
    });
    expect(calls.slice(2).map((call) => decodeURIComponent(header(call, "Donizetti-Path") ?? ""))).toEqual([
      "/tmp/song-1.svg",
      "/tmp/song-2.svg",
    ]);
    expect(calls[3]?.args).toEqual(encoder.encode("<svg>2</svg>"));
  });

  it("writes no pages when replacing them is declined", async () => {
    const calls = mockTauri(({ command }) => {
      if (command === "plugin:dialog|save") return "/tmp/song.svg";
      if (command === "plugin:dialog|message") return "Cancel";
      return null;
    });
    await expect(
      tauriHost(false).export(onDisk, { kind: "svg", pages: ["<svg>1</svg>", "<svg>2</svg>"] }),
    ).rejects.toBeInstanceOf(Cancelled);
    expect(commands(calls)).toEqual(["plugin:dialog|save", "plugin:dialog|message"]);
  });

  it("has the plugin make the PDF", async () => {
    const calls = mockTauri(({ command }) => (command === "plugin:dialog|save" ? "/tmp/song.pdf" : null));
    await tauriHost(false).export({ name: "song.musicxml", bytes }, { kind: "pdf", pages: ["<svg/>"] });
    expect(calls[0]?.args).toMatchObject({ options: { defaultPath: "song.pdf" } });
    expect(calls[1]).toEqual({
      command: "plugin:donizetti|export_pdf",
      args: { pages: ["<svg/>"], path: "/tmp/song.pdf" },
      options: undefined,
    });
  });

  it("exports nothing when the dialog is cancelled", async () => {
    const calls = mockTauri(() => null);
    await expect(tauriHost(false).export(onDisk, { kind: "pdf", pages: ["<svg/>"] })).rejects.toBeInstanceOf(Cancelled);
    expect(commands(calls)).toEqual(["plugin:dialog|save"]);
  });

  it("plays with the plugin's soundfont once it is installed", async () => {
    expect(tauriHost(false).soundfont).toBeUndefined();
    const calls = mockTauri(() => new Uint8Array([1, 2, 3]).buffer);
    expect(await tauriHost(true).soundfont?.()).toEqual(new Uint8Array([1, 2, 3]));
    expect(commands(calls)).toEqual(["plugin:donizetti|read_soundfont"]);
  });
});

describe("messageOf", () => {
  it("says what failed from the error's code, with the file's name and the page", () => {
    expect(messageOf(new DonizettiPluginError("read_failed", { path: "/a/b/song.musicxml", detail: "x" }), "")).toBe(
      "song.musicxml could not be read.",
    );
    expect(messageOf(new DonizettiPluginError("pdf_no_fonts", { page: 2 }), "")).toBe(
      "Page 2 has text, but this computer has no fonts to write it in.",
    );
  });

  it("falls back for anything that is not the plugin's", () => {
    expect(messageOf(new Error("boom"), "The file could not be opened.")).toBe("The file could not be opened.");
  });
});
