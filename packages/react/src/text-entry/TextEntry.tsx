import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import type { MessageKey } from "../strings/en-GB";
import { useTranslate } from "../strings/translate";

/** What typing in the field asks for once a syllable or chord symbol is done (decision 16, MuseScore's keys). */
export type TextEntryMove =
  /** Space: this text, then the next note. */
  | "next"
  /** `-` in lyrics: this syllable joined by a hyphen to the next one, on the next note. */
  | "hyphen"
  /** `_` in lyrics: this syllable held over the following notes (an extender), then the next note. */
  | "extend"
  /** Backspace in an empty field: back to the previous note. */
  | "previous"
  /** Enter in lyrics, or Ctrl+↓: the next verse on the same note. */
  | "verse"
  /** Esc, or Enter in a chord symbol: this text, and the field closes. */
  | "done";

export type TextEntryProps = {
  kind: "lyrics" | "chord";
  /** Where the note is, in the sheet's coordinates (its scrolled content box). */
  anchor: { left: number; top: number; bottom: number };
  /** The text already there (the note's syllable or chord symbol), to edit. */
  initial: string;
  /** The verse being typed (lyrics only), shown to the user. */
  verse?: number;
  onCommit: (text: string, move: TextEntryMove) => void;
};

/**
 * The field for typing lyrics under a note or a chord symbol above it, as in MuseScore: each syllable or symbol
 * is written when the user moves on (Space, `-`, `_`), and Esc closes the field.
 */
export function TextEntry({ kind, anchor, initial, verse, onCommit }: TextEntryProps) {
  const t = useTranslate();
  const input = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState(initial);
  /** Set once the field has closed, so the blur that follows does not write the text again. */
  const closed = useRef(false);

  useEffect(() => {
    setText(initial);
    input.current?.focus();
    input.current?.select();
  }, [initial]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const lyrics = kind === "lyrics";
    let move: TextEntryMove | null = null;
    if (event.key === " " && !event.shiftKey) move = "next";
    else if (lyrics && event.key === "-") move = "hyphen";
    else if (lyrics && event.key === "_") move = "extend";
    else if (event.key === "Escape") move = "done";
    else if (event.key === "Enter") move = lyrics ? "verse" : "done";
    else if (lyrics && event.key === "ArrowDown" && (event.ctrlKey || event.metaKey)) move = "verse";
    else if (event.key === "Backspace" && text === "") move = "previous";
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    if (move === "done") closed.current = true;
    onCommit(text.trim(), move);
  }

  const label: MessageKey = kind === "lyrics" ? "textEntry.lyrics" : "textEntry.chord";
  return (
    <input
      ref={input}
      className={`dz-text-entry dz-text-entry-${kind}`}
      style={{ left: anchor.left, top: kind === "lyrics" ? anchor.bottom : anchor.top }}
      aria-label={t(label, { verse: verse ?? 1 })}
      value={text}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setText(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (closed.current) return;
        closed.current = true;
        onCommit(text.trim(), "done");
      }}
    />
  );
}
