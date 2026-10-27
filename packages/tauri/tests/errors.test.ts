import { describe, expect, it } from "vitest";
import { exportPdf } from "../src/index";
import { DonizettiPluginError, pluginErrorCodes, toPluginError } from "../src/errors";
import { mockPlugin } from "./plugin";

describe("toPluginError", () => {
  it("keeps the plugin's code and parameters", () => {
    const error = toPluginError({ code: "pdf_invalid_svg", params: { page: 2, detail: "bad" } });
    expect(error).toBeInstanceOf(DonizettiPluginError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DonizettiPluginError");
    expect(error.code).toBe("pdf_invalid_svg");
    expect(error.params).toEqual({ page: 2, detail: "bad" });
    expect(error.message).toBe('pdf_invalid_svg {"page":2,"detail":"bad"}');
  });

  it("gives a code without parameters empty ones", () => {
    const error = toPluginError({ code: "pdf_no_pages" });
    expect(error.params).toEqual({});
    expect(error.message).toBe("pdf_no_pages");
  });

  it("makes anything else an unknown error that keeps its text", () => {
    expect(toPluginError("donizetti.read_score not allowed")).toMatchObject({
      code: "unknown",
      params: { detail: "donizetti.read_score not allowed" },
    });
    expect(toPluginError(new Error("broken"))).toMatchObject({ code: "unknown", params: { detail: "broken" } });
    expect(toPluginError({ code: "something_new", params: {} })).toMatchObject({
      code: "unknown",
      params: { detail: '{"code":"something_new","params":{}}' },
    });
  });

  it("passes its own errors through", () => {
    const error = new DonizettiPluginError("internal");
    expect(toPluginError(error)).toBe(error);
  });

  it("lists every code the plugin sends", () => {
    expect(pluginErrorCodes).toContain("changed_on_disk");
    expect(new Set(pluginErrorCodes).size).toBe(pluginErrorCodes.length);
  });
});

describe("exportPdf", () => {
  it("sends the pages and the path", async () => {
    const calls = mockPlugin(() => null);
    await exportPdf(["<svg/>", "<svg/>"], "song.pdf");
    expect(calls).toEqual([
      {
        command: "plugin:donizetti|export_pdf",
        args: { pages: ["<svg/>", "<svg/>"], path: "song.pdf" },
        options: undefined,
      },
    ]);
  });

  it("reports the page that could not be converted", async () => {
    mockPlugin(() => {
      throw { code: "pdf_invalid_svg", params: { page: 3, detail: "unexpected end" } };
    });
    await expect(exportPdf(["<svg/>"], "song.pdf")).rejects.toMatchObject({
      code: "pdf_invalid_svg",
      params: { page: 3 },
    });
  });
});
