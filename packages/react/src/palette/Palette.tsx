import { useState } from "react";

import type { MessageKey } from "../strings/en-GB";
import { useTranslate } from "../strings/translate";

/** What the palette applies to the selection (its measure, or the note it starts at). */
export type PaletteAction =
  | { kind: "key"; fifths: number }
  | { kind: "time"; beats: number; beatType: number }
  | { kind: "tempo"; perMinute: number }
  | { kind: "barline"; barline: "startRepeat" | "endRepeat" | "double" | "final" | "normal" }
  | { kind: "ending"; numbers: string }
  | { kind: "jump"; jump: Jump }
  | { kind: "measures"; change: "insert" | "append" | "remove" };

export type Jump = "segno" | "coda" | "toCoda" | "fine" | "daCapo" | "daCapoAlFine" | "dalSegno" | "dalSegnoAlCoda";

/** Key signatures by fifths, named by their major and minor keys. */
const KEYS: readonly [number, string][] = [
  [-7, "C♭ / a♭"],
  [-6, "G♭ / e♭"],
  [-5, "D♭ / b♭"],
  [-4, "A♭ / f"],
  [-3, "E♭ / c"],
  [-2, "B♭ / g"],
  [-1, "F / d"],
  [0, "C / a"],
  [1, "G / e"],
  [2, "D / b"],
  [3, "A / f♯"],
  [4, "E / c♯"],
  [5, "B / g♯"],
  [6, "F♯ / d♯"],
  [7, "C♯ / a♯"],
];

const TIMES: readonly [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [2, 2],
  [3, 8],
  [6, 8],
  [9, 8],
  [12, 8],
  [5, 4],
];

const BARLINES = ["startRepeat", "endRepeat", "double", "final", "normal"] as const;
const JUMPS: readonly Jump[] = [
  "segno",
  "coda",
  "toCoda",
  "fine",
  "daCapo",
  "daCapoAlFine",
  "dalSegno",
  "dalSegnoAlCoda",
];

type Section = "key" | "time" | "tempo" | "barlines" | "endings" | "jumps" | "measures";

/**
 * The palette (decision 17): key, time, tempo, barlines and repeats, endings, jumps and measures, applied to the
 * selected note's measure. A side panel that folds away; under the toolbar at narrow widths (the stylesheet).
 */
export function Palette({ enabled, onApply }: { enabled: boolean; onApply: (action: PaletteAction) => void }) {
  const t = useTranslate();
  const [open, setOpen] = useState(true);
  const [section, setSection] = useState<Section | null>("key");
  const [tempo, setTempo] = useState(96);
  const [ending, setEnding] = useState("1");

  const heading = (id: Section, key: MessageKey) => (
    <button
      type="button"
      className="dz-palette-heading"
      aria-expanded={section === id}
      onClick={() => setSection(section === id ? null : id)}
    >
      {t(key)}
    </button>
  );
  const item = (label: string, action: PaletteAction, title?: string) => (
    <button
      key={label}
      type="button"
      className="dz-palette-item"
      disabled={!enabled}
      title={title}
      onClick={() => onApply(action)}
    >
      {label}
    </button>
  );

  return (
    <aside className={`dz-palette ${open ? "" : "dz-palette-closed"}`} aria-label={t("palette.label")}>
      <button type="button" className="dz-button dz-palette-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t(open ? "palette.hide" : "palette.show")}
      </button>
      {open && (
        <div className="dz-palette-sections">
          {!enabled && <p className="dz-hint">{t("palette.selectFirst")}</p>}
          {heading("key", "palette.key")}
          {section === "key" && (
            <div className="dz-palette-grid">{KEYS.map(([fifths, name]) => item(name, { kind: "key", fifths }))}</div>
          )}
          {heading("time", "palette.time")}
          {section === "time" && (
            <div className="dz-palette-grid">
              {TIMES.map(([beats, beatType]) => item(`${beats}/${beatType}`, { kind: "time", beats, beatType }))}
            </div>
          )}
          {heading("tempo", "palette.tempo")}
          {section === "tempo" && (
            <div className="dz-palette-row">
              <label>
                <span className="dz-hint">{t("palette.tempoPerMinute")}</span>
                <input
                  type="number"
                  min={20}
                  max={400}
                  value={tempo}
                  onChange={(event) => setTempo(Number(event.target.value))}
                />
              </label>
              {item(t("palette.apply"), { kind: "tempo", perMinute: tempo })}
            </div>
          )}
          {heading("barlines", "palette.barlines")}
          {section === "barlines" && (
            <div className="dz-palette-grid">
              {BARLINES.map((barline) => item(t(`palette.barline.${barline}`), { kind: "barline", barline }))}
            </div>
          )}
          {heading("endings", "palette.endings")}
          {section === "endings" && (
            <div className="dz-palette-row">
              <label>
                <span className="dz-hint">{t("palette.endingNumbers")}</span>
                <input value={ending} size={4} onChange={(event) => setEnding(event.target.value)} />
              </label>
              {item(t("palette.apply"), { kind: "ending", numbers: ending })}
            </div>
          )}
          {heading("jumps", "palette.jumps")}
          {section === "jumps" && (
            <div className="dz-palette-grid">
              {JUMPS.map((jump) => item(t(`palette.jump.${jump}`), { kind: "jump", jump }))}
            </div>
          )}
          {heading("measures", "palette.measures")}
          {section === "measures" && (
            <div className="dz-palette-grid">
              {(["insert", "append", "remove"] as const).map((change) =>
                item(t(`palette.measures.${change}`), { kind: "measures", change }),
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
