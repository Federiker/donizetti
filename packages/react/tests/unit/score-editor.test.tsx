import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScoreEditor, type ScoreEditorHandle } from "../../src";
import { created, FakeDisplay, FakePoint } from "../fake-osmd";

vi.mock("opensheetmusicdisplay", () => ({ OpenSheetMusicDisplay: FakeDisplay, PointF2D: FakePoint }));

const engine = {
  load: vi.fn(async () => playback),
  previewNote: vi.fn(async () => undefined),
  start: vi.fn(async () => undefined),
  dispose: vi.fn(),
};
const playback = {
  play: vi.fn(async () => undefined),
  pause: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
  time: () => 0,
  paused: () => true,
};
vi.mock("@donizetti/playback", () => ({
  createScoreEngine: () => engine,
  scoreNotes: () => ({
    notes: [],
    duration: 4,
    length: 1,
    tempos: [],
    timeSignatures: [],
    secondsAt: (x: number) => x,
  }),
  cursorSteps: () => [
    { seconds: 0, measure: 0, inMeasure: 0 },
    { seconds: 1, measure: 0, inMeasure: 0.25 },
  ],
  stepOfNote: () => 1,
  midiFile: () => new Uint8Array([1]),
  exportMidi: () => new Uint8Array([0x4d, 0x54]),
}));

const fixture = (path: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, "../../../musicxml/tests/fixtures", path)));
const LEAD_SHEET = fixture("musescore/lead-sheet.musicxml");
const TWO_PARTS = `<score-partwise version="4.0"><part-list/><part id="P1"/><part id="P2"/></score-partwise>`;

async function drawn() {
  await waitFor(() => expect(document.querySelector(".dz-sheet svg")).not.toBeNull());
}

beforeEach(() => {
  created.length = 0;
  vi.clearAllMocks();
});

describe("ScoreEditor", () => {
  it("says why a file cannot be read", () => {
    render(<ScoreEditor source="<html/>" />);
    expect(screen.getByRole("alert")).toHaveTextContent("This file is XML, but not a MusicXML score.");
  });

  it("opens a score with several parts read-only, saying why", async () => {
    render(<ScoreEditor source={TWO_PARTS} fileName="duet.musicxml" />);
    expect(screen.getByRole("note")).toHaveTextContent("It has 2 parts.");
    expect(screen.queryByRole("button", { name: "Note input" })).toBeNull();
    expect(screen.getByRole("region", { name: "Score: duet.musicxml" })).toBeInTheDocument();
  });

  it("draws the score and selects the clicked note, sounding it", async () => {
    render(<ScoreEditor source={LEAD_SHEET} soundfont={async () => new Uint8Array()} />);
    await drawn();
    const sheet = screen.getByRole("application");
    fireEvent.click(sheet, { clientX: 3, clientY: 0 });
    expect(screen.getByText("D5, half note, measure 1")).toBeInTheDocument();
    expect(document.querySelectorAll(".dz-selected")).toHaveLength(1);
    expect(engine.previewNote).toHaveBeenCalledWith(74);
    fireEvent.keyDown(sheet, { key: "ArrowRight" });
    expect(screen.getByText("C5, quarter note, measure 2")).toBeInTheDocument();
    fireEvent.keyDown(sheet, { key: "End", ctrlKey: true });
    expect(screen.getByText("G4, whole note, measure 4")).toBeInTheDocument();
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(screen.getByText("Nothing selected")).toBeInTheDocument();
  });

  it("enters and leaves note input, and picks lengths and dots", async () => {
    render(<ScoreEditor source={LEAD_SHEET} />);
    await drawn();
    const sheet = screen.getByRole("application");
    fireEvent.keyDown(sheet, { key: "n" });
    expect(screen.getByRole("button", { name: "Note input" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Note input at measure 1, beat 1")).toBeInTheDocument();
    fireEvent.keyDown(sheet, { key: "6", code: "Digit6" });
    expect(screen.getByRole("button", { name: "Half note" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(sheet, { key: ".", code: "Period" });
    expect(screen.getByRole("button", { name: "Dot" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Eighth note" }));
    expect(screen.getByRole("button", { name: "Dot" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(sheet, { key: "ArrowRight" });
    expect(screen.getByText("Note input at measure 1, beat 2")).toBeInTheDocument();
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Note input" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("A4, eighth note, measure 1")).toBeInTheDocument();
  });

  it("saves the bytes it was given while nothing changed", async () => {
    const onSave = vi.fn();
    render(<ScoreEditor source={LEAD_SHEET} onSave={onSave} />);
    await drawn();
    fireEvent.keyDown(screen.getByRole("application"), { key: "s", ctrlKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      format: "musicxml",
      mediaType: "application/vnd.recordare.musicxml+xml",
    });
    expect(onSave.mock.calls[0]![0].bytes).toBe(LEAD_SHEET);
  });

  it("says when saving fails", async () => {
    render(<ScoreEditor source={LEAD_SHEET} onSave={() => Promise.reject(new Error("disk full"))} />);
    await drawn();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The score could not be saved.")).toBeInTheDocument();
  });

  it("exports MIDI and SVG pages to the host, the score drawn black for the moment", async () => {
    const onExport = vi.fn();
    const ref = createRef<ScoreEditorHandle>();
    render(<ScoreEditor ref={ref} source={LEAD_SHEET} onExport={onExport} theme="dark" />);
    await drawn();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "MIDI file" }));
    await waitFor(() => expect(onExport).toHaveBeenCalledWith({ kind: "midi", bytes: new Uint8Array([0x4d, 0x54]) }));
    let exported: Awaited<ReturnType<ScoreEditorHandle["export"]>> = null;
    await act(async () => {
      exported = await ref.current!.export("svg");
    });
    expect(exported).toMatchObject({ kind: "svg" });
    expect((exported as unknown as { pages: string[] }).pages[0]).toContain("<svg");
    expect(ref.current!.document()!.format).toBe("musicxml");
  });

  it("plays, pauses and stops with the host's soundfont", async () => {
    render(<ScoreEditor source={LEAD_SHEET} soundfont={async () => new Uint8Array()} />);
    await drawn();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(playback.play).toHaveBeenCalled());
    expect(engine.load).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
    expect(playback.pause).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to the start" }));
    expect(playback.stop).toHaveBeenCalled();
  });

  it("says playback needs a soundfont without one", async () => {
    render(<ScoreEditor source={LEAD_SHEET} />);
    await drawn();
    expect(screen.getByText("Playback needs a soundfont.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("takes the host's words", () => {
    render(<ScoreEditor source="<html/>" strings={{ "read.not_musicxml": "Keine Partitur." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Keine Partitur.");
  });
});
