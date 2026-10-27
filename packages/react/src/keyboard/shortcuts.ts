/**
 * Every keyboard shortcut of the score editor, with MuseScore 4's default keys (decision 8). This list is the
 * one place keys are defined: the editor reads it, the shortcuts help shows it, and docs/features/editor.md
 * lists it. "Mod" is Ctrl, or ⌘ on macOS.
 */

export type ShortcutArea = "general" | "playback" | "navigation" | "noteInput" | "editing" | "text";

/**
 * A key as `KeyboardEvent.key` names it (letters in either case), or a physical key by `KeyboardEvent.code`
 * (`code:Digit5`), for keys whose character changes with the layout: digits are typed with Shift on AZERTY.
 */
type Key = string;

export type Shortcut = {
  readonly action: ShortcutAction;
  readonly area: ShortcutArea;
  readonly keys: readonly Key[];
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
};

const digits = (digit: number): Key[] => [`code:Digit${digit}`, `code:Numpad${digit}`];

const LENGTH_KEYS = [
  ["length.64th", 1],
  ["length.32nd", 2],
  ["length.16th", 3],
  ["length.eighth", 4],
  ["length.quarter", 5],
  ["length.half", 6],
  ["length.whole", 7],
  ["length.breve", 8],
] as const;

const STEPS = ["A", "B", "C", "D", "E", "F", "G"] as const;

export type ShortcutAction =
  | "noteInput.toggle"
  | "escape"
  | "undo"
  | "redo"
  | "save"
  | "play"
  | "next"
  | "previous"
  | "nextMeasure"
  | "previousMeasure"
  | "first"
  | "last"
  | (typeof LENGTH_KEYS)[number][0]
  | "length.dot"
  | "rest"
  | `pitch.${(typeof STEPS)[number]}`
  | `chord.${(typeof STEPS)[number]}`
  | `interval.${2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | "up"
  | "down"
  | "octaveUp"
  | "octaveDown"
  | "tie"
  | "delete"
  | "lyrics"
  | "chordSymbol";

export const SHORTCUTS: readonly Shortcut[] = [
  { action: "noteInput.toggle", area: "noteInput", keys: ["n"] },
  { action: "escape", area: "general", keys: ["Escape"] },
  { action: "undo", area: "general", keys: ["z"], mod: true },
  { action: "redo", area: "general", keys: ["y"], mod: true },
  { action: "redo", area: "general", keys: ["z"], mod: true, shift: true },
  { action: "save", area: "general", keys: ["s"], mod: true },
  { action: "play", area: "playback", keys: [" "] },
  { action: "next", area: "navigation", keys: ["ArrowRight"] },
  { action: "previous", area: "navigation", keys: ["ArrowLeft"] },
  { action: "nextMeasure", area: "navigation", keys: ["ArrowRight"], mod: true },
  { action: "previousMeasure", area: "navigation", keys: ["ArrowLeft"], mod: true },
  { action: "first", area: "navigation", keys: ["Home"], mod: true },
  { action: "last", area: "navigation", keys: ["End"], mod: true },
  ...LENGTH_KEYS.map(([action, digit]): Shortcut => ({ action, area: "noteInput", keys: digits(digit) })),
  { action: "length.dot", area: "noteInput", keys: [".", "code:NumpadDecimal"] },
  { action: "rest", area: "noteInput", keys: digits(0) },
  ...STEPS.map((step): Shortcut => ({ action: `pitch.${step}`, area: "noteInput", keys: [step.toLowerCase()] })),
  ...STEPS.map(
    (step): Shortcut => ({ action: `chord.${step}`, area: "noteInput", keys: [step.toLowerCase()], shift: true }),
  ),
  ...([2, 3, 4, 5, 6, 7, 8, 9] as const).map(
    (interval): Shortcut => ({ action: `interval.${interval}`, area: "noteInput", keys: digits(interval), alt: true }),
  ),
  { action: "up", area: "editing", keys: ["ArrowUp"] },
  { action: "down", area: "editing", keys: ["ArrowDown"] },
  { action: "octaveUp", area: "editing", keys: ["ArrowUp"], mod: true },
  { action: "octaveDown", area: "editing", keys: ["ArrowDown"], mod: true },
  { action: "tie", area: "editing", keys: ["t"] },
  { action: "delete", area: "editing", keys: ["Delete", "Backspace"] },
  { action: "lyrics", area: "text", keys: ["l"], mod: true },
  { action: "chordSymbol", area: "text", keys: ["k"], mod: true },
];

/** Whether the computer is a Mac, where "Mod" is ⌘ rather than Ctrl. */
export function isMac(platform: string = globalThis.navigator?.platform ?? ""): boolean {
  return /mac|iphone|ipad/i.test(platform);
}

function keyMatches(key: Key, event: Pick<KeyboardEvent, "key" | "code">): boolean {
  if (key.startsWith("code:")) return event.code === key.slice(5);
  return event.key.length === 1 ? event.key.toLowerCase() === key.toLowerCase() : event.key === key;
}

/**
 * The action a key press asks for, or null. Modifiers must match exactly ("Mod" is ⌘ on a Mac, Ctrl
 * elsewhere); AltGr, which browsers report as Ctrl and Alt together, never matches a shortcut, so characters
 * typed with it reach text fields untouched; neither do key presses of an input method still composing.
 */
export function actionOf(
  event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "isComposing">,
  mac: boolean = isMac(),
): ShortcutAction | null {
  if (event.isComposing) return null;
  if (event.ctrlKey && event.altKey) return null;
  const mod = mac ? event.metaKey : event.ctrlKey;
  const other = mac ? event.ctrlKey : event.metaKey;
  if (other) return null;
  for (const shortcut of SHORTCUTS) {
    if ((shortcut.mod ?? false) !== mod) continue;
    if ((shortcut.alt ?? false) !== event.altKey) continue;
    // Shift is part of a character on many layouts ("." on some, digits on AZERTY): it matters only for
    // the shortcuts that name it, and for letters.
    const letter = event.key.length === 1 && /\p{L}/u.test(event.key);
    if (shortcut.shift !== undefined || letter || shortcut.mod) {
      if ((shortcut.shift ?? false) !== event.shiftKey) continue;
    }
    if (shortcut.keys.some((key) => keyMatches(key, event))) return shortcut.action;
  }
  return null;
}

/** How a shortcut's keys are written for people: "Ctrl+Shift+Z", "⌘K", "5". */
export function describeShortcut(shortcut: Shortcut, mac: boolean = isMac()): string {
  const key = shortcut.keys[0]!;
  const names: Record<string, string> = {
    " ": "Space",
    ArrowRight: "→",
    ArrowLeft: "←",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Escape: "Esc",
    "code:NumpadDecimal": ".",
  };
  const name = names[key] ?? (key.startsWith("code:") ? key.replace(/^code:(Digit|Numpad)/, "") : key.toUpperCase());
  const parts = [
    ...(shortcut.mod ? [mac ? "⌘" : "Ctrl"] : []),
    ...(shortcut.alt ? [mac ? "⌥" : "Alt"] : []),
    ...(shortcut.shift ? [mac ? "⇧" : "Shift"] : []),
    name,
  ];
  return mac ? parts.join("") : parts.join("+");
}
