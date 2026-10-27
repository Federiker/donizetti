import { describe, expect, it } from "vitest";
import { writeExport } from "../src/index";
import { mockPlugin } from "./plugin";

describe("writeExport", () => {
  it("sends the bytes raw, with the path in a header", async () => {
    const calls = mockPlugin(() => null);
    const bytes = new Uint8Array([77, 84, 104, 100]);
    await writeExport("C:\\Scores\\Für Elise.mid", bytes);
    expect(calls).toEqual([
      {
        command: "plugin:donizetti|write_export",
        args: bytes,
        options: { headers: { "Donizetti-Path": "C%3A%5CScores%5CF%C3%BCr%20Elise.mid" } },
      },
    ]);
  });

  it("sends text as UTF-8", async () => {
    const calls = mockPlugin(() => null);
    await writeExport("song.svg", "<svg>♪</svg>");
    expect(calls[0]?.args).toEqual(new TextEncoder().encode("<svg>♪</svg>"));
  });

  it("passes the plugin's error on with its code and parameters", async () => {
    mockPlugin(() => {
      throw { code: "write_failed", params: { path: "song.mid", detail: "denied" } };
    });
    await expect(writeExport("song.mid", new Uint8Array())).rejects.toMatchObject({
      code: "write_failed",
      params: { path: "song.mid", detail: "denied" },
    });
  });
});
