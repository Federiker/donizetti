import { describe, expect, it } from "vitest";

import { actionOf, describeShortcut, isMac, SHORTCUTS } from "../../src/keyboard/shortcuts";

const press = (key: string, extra: Partial<KeyboardEvent> = {}) => ({
  key,
  code: extra.code ?? "",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  ...extra,
});

describe("MuseScore's keys", () => {
  it("enters pitches, lengths, rests and dots in note input", () => {
    expect(actionOf(press("c"), false)).toBe("pitch.C");
    expect(actionOf(press("G", { shiftKey: true }), false)).toBe("chord.G");
    expect(actionOf(press("5", { code: "Digit5" }), false)).toBe("length.quarter");
    expect(actionOf(press("(", { code: "Digit5", shiftKey: true }), false)).toBe("length.quarter");
    expect(actionOf(press("0", { code: "Numpad0" }), false)).toBe("rest");
    expect(actionOf(press(".", { code: "Period" }), false)).toBe("length.dot");
    expect(actionOf(press("3", { code: "Digit3", altKey: true }), false)).toBe("interval.3");
  });

  it("tells Ctrl from ⌘ by platform", () => {
    expect(actionOf(press("z", { ctrlKey: true }), false)).toBe("undo");
    expect(actionOf(press("z", { metaKey: true }), true)).toBe("undo");
    expect(actionOf(press("z", { ctrlKey: true }), true)).toBeNull();
    expect(actionOf(press("z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(actionOf(press("ArrowUp", { ctrlKey: true }), false)).toBe("octaveUp");
    expect(actionOf(press("ArrowUp"), false)).toBe("up");
  });

  it("leaves AltGr and input methods alone", () => {
    expect(actionOf(press("@", { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(actionOf(press("c", { isComposing: true }), false)).toBeNull();
    expect(actionOf(press("x"), false)).toBeNull();
  });

  it("writes keys for people", () => {
    const redo = SHORTCUTS.find((shortcut) => shortcut.action === "redo" && shortcut.shift)!;
    expect(describeShortcut(redo, false)).toBe("Ctrl+Shift+Z");
    expect(describeShortcut(redo, true)).toBe("⌘⇧Z");
    expect(describeShortcut(SHORTCUTS.find((shortcut) => shortcut.action === "play")!, false)).toBe("Space");
    expect(describeShortcut(SHORTCUTS.find((shortcut) => shortcut.action === "length.quarter")!, false)).toBe("5");
    expect(describeShortcut(SHORTCUTS.find((shortcut) => shortcut.action === "interval.3")!, false)).toBe("Alt+3");
    expect(isMac("MacIntel")).toBe(true);
    expect(isMac("Win32")).toBe(false);
  });

  it("gives every action one meaning per key and modifiers", () => {
    const seen = new Map<string, string>();
    for (const shortcut of SHORTCUTS) {
      for (const key of shortcut.keys) {
        const id = `${key}|${shortcut.mod ?? false}|${shortcut.shift ?? false}|${shortcut.alt ?? false}`;
        expect(seen.get(id) ?? shortcut.action).toBe(shortcut.action);
        seen.set(id, shortcut.action);
      }
    }
  });
});
