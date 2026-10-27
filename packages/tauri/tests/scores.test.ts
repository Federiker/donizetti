import { describe, expect, it } from "vitest";
import { DonizettiPluginError, readScore, writeScore } from "../src/index";
import { mockPlugin } from "./plugin";

const HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const encoder = new TextEncoder();

function answer(hash: string, file: string): ArrayBuffer {
  return encoder.encode(hash + file).buffer as ArrayBuffer;
}

describe("readScore", () => {
  it("splits the answer into the hash and the file", async () => {
    const calls = mockPlugin(() => answer(HASH, "<score-partwise/>"));
    const score = await readScore("C:\\Scores\\song.musicxml");
    expect(score.hash).toBe(HASH);
    expect(new TextDecoder().decode(score.bytes)).toBe("<score-partwise/>");
    expect(calls).toEqual([
      { command: "plugin:donizetti|read_score", args: { path: "C:\\Scores\\song.musicxml" }, options: undefined },
    ]);
  });

  it("takes the answer as numbers where Tauri falls back to postMessage", async () => {
    mockPlugin(() => Array.from(encoder.encode(`${HASH}abc`)));
    const score = await readScore("song.musicxml");
    expect(Array.from(score.bytes)).toEqual([97, 98, 99]);
  });

  it("reads an empty file", async () => {
    mockPlugin(() => new Uint8Array(encoder.encode(HASH)));
    expect((await readScore("empty.musicxml")).bytes.length).toBe(0);
  });

  it("refuses an answer that is not a hash and a file", async () => {
    for (const wrong of [answer("short", ""), answer("Z".repeat(64), "<score/>"), "text", [256], null]) {
      mockPlugin(() => wrong);
      await expect(readScore("song.musicxml")).rejects.toMatchObject({ code: "invalid_response" });
    }
  });

  it("passes the plugin's error on with its code and parameters", async () => {
    mockPlugin(() => {
      throw { code: "read_failed", params: { path: "song.musicxml", detail: "not found" } };
    });
    const error = await readScore("song.musicxml").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(DonizettiPluginError);
    expect(error).toMatchObject({ code: "read_failed", params: { path: "song.musicxml", detail: "not found" } });
  });
});

describe("writeScore", () => {
  it("sends the bytes raw, with the path and the hash in headers", async () => {
    const calls = mockPlugin(() => HASH);
    const bytes = encoder.encode("<score-partwise/>");
    const hash = await writeScore({ path: "C:\\Scores\\Für Elise.musicxml", bytes, expectedHash: "a".repeat(64) });
    expect(hash).toBe(HASH);
    expect(calls[0]?.command).toBe("plugin:donizetti|write_score");
    expect(calls[0]?.args).toBe(bytes);
    expect(calls[0]?.options).toEqual({
      headers: {
        "Donizetti-Path": "C%3A%5CScores%5CF%C3%BCr%20Elise.musicxml",
        "Donizetti-Expected-Hash": "a".repeat(64),
      },
    });
  });

  it("leaves the hash out for a new file", async () => {
    const calls = mockPlugin(() => HASH);
    await writeScore({ path: "new.musicxml", bytes: new Uint8Array() });
    expect(calls[0]?.options).toEqual({ headers: { "Donizetti-Path": "new.musicxml" } });
  });

  it("reports a file changed on disk", async () => {
    mockPlugin(() =>
      Promise.reject({
        code: "changed_on_disk",
        params: { path: "song.musicxml", expectedHash: "a", actualHash: "b" },
      }),
    );
    await expect(
      writeScore({ path: "song.musicxml", bytes: new Uint8Array(), expectedHash: "a" }),
    ).rejects.toMatchObject({ code: "changed_on_disk", params: { expectedHash: "a", actualHash: "b" } });
  });

  it("refuses an answer that is not a hash", async () => {
    mockPlugin(() => "done");
    await expect(writeScore({ path: "song.musicxml", bytes: new Uint8Array() })).rejects.toMatchObject({
      code: "invalid_response",
      params: { command: "write_score" },
    });
  });
});
