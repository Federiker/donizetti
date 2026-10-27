import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Palette } from "../../src/palette/Palette";
import { TextEntry } from "../../src/text-entry/TextEntry";

describe("the palette", () => {
  it("applies keys, times, tempo, barlines, endings, jumps and measures", () => {
    const onApply = vi.fn();
    render(<Palette enabled onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "G / e" }));
    expect(onApply).toHaveBeenLastCalledWith({ kind: "key", fifths: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Time signature" }));
    fireEvent.click(screen.getByRole("button", { name: "6/8" }));
    expect(onApply).toHaveBeenLastCalledWith({ kind: "time", beats: 6, beatType: 8 });
    fireEvent.click(screen.getByRole("button", { name: "Tempo" }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenLastCalledWith({ kind: "tempo", perMinute: 120 });
    fireEvent.click(screen.getByRole("button", { name: "Barlines and repeats" }));
    fireEvent.click(screen.getByRole("button", { name: "End repeat" }));
    expect(onApply).toHaveBeenLastCalledWith({ kind: "barline", barline: "endRepeat" });
    fireEvent.click(screen.getByRole("button", { name: "Endings" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1, 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenLastCalledWith({ kind: "ending", numbers: "1, 2" });
    fireEvent.click(screen.getByRole("button", { name: "Jumps and markers" }));
    fireEvent.click(screen.getByRole("button", { name: "D.S. al Coda" }));
    expect(onApply).toHaveBeenLastCalledWith({ kind: "jump", jump: "dalSegnoAlCoda" });
    fireEvent.click(screen.getByRole("button", { name: "Measures" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a measure at the end" }));
    expect(onApply).toHaveBeenLastCalledWith({ kind: "measures", change: "append" });
    fireEvent.click(screen.getByRole("button", { name: "Measures" }));
    expect(screen.queryByRole("button", { name: "Add a measure at the end" })).toBeNull();
  });

  it("asks for a selection first, and folds away", () => {
    render(<Palette enabled={false} onApply={vi.fn()} />);
    expect(screen.getByText("Select a note: the palette applies to its measure.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C / a" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Hide the palette" }));
    expect(screen.queryByRole("button", { name: "C / a" })).toBeNull();
    expect(screen.getByRole("button", { name: "Show the palette" })).toBeInTheDocument();
  });
});

describe("typing lyrics and chord symbols", () => {
  const anchor = { left: 10, top: 20, bottom: 40 };

  it("writes each syllable as MuseScore does: Space, hyphen, extender, verse, Esc", () => {
    const onCommit = vi.fn();
    render(<TextEntry kind="lyrics" anchor={anchor} initial="" verse={2} onCommit={onCommit} />);
    const field = screen.getByRole("textbox", { name: "Lyrics, verse 2" });
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: "Hap " } });
    fireEvent.keyDown(field, { key: "-" });
    expect(onCommit).toHaveBeenLastCalledWith("Hap", "hyphen");
    fireEvent.keyDown(field, { key: " " });
    expect(onCommit).toHaveBeenLastCalledWith("Hap", "next");
    fireEvent.keyDown(field, { key: "_" });
    expect(onCommit).toHaveBeenLastCalledWith("Hap", "extend");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onCommit).toHaveBeenLastCalledWith("Hap", "verse");
    fireEvent.keyDown(field, { key: "ArrowDown", ctrlKey: true });
    expect(onCommit).toHaveBeenLastCalledWith("Hap", "verse");
    fireEvent.keyDown(field, { key: "a" });
    expect(onCommit).toHaveBeenCalledTimes(5);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onCommit).toHaveBeenLastCalledWith("Hap", "done");
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledTimes(6);
  });

  it("goes back from an empty field, and writes a chord symbol on Enter or when left", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<TextEntry kind="chord" anchor={anchor} initial="" onCommit={onCommit} />);
    const field = screen.getByRole("textbox", { name: "Chord symbol" });
    fireEvent.keyDown(field, { key: "Backspace" });
    expect(onCommit).toHaveBeenLastCalledWith("", "previous");
    fireEvent.change(field, { target: { value: "Am7" } });
    fireEvent.keyDown(field, { key: "-" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onCommit).toHaveBeenLastCalledWith("Am7", "done");
    rerender(<TextEntry kind="chord" anchor={anchor} initial="F/A" onCommit={onCommit} />);
    expect(field).toHaveValue("F/A");
  });

  it("writes the text when the field is left", () => {
    const onCommit = vi.fn();
    render(<TextEntry kind="chord" anchor={anchor} initial="G7" onCommit={onCommit} />);
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onCommit).toHaveBeenCalledWith("G7", "done");
  });
});
