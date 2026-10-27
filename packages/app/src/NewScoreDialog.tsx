import type { NewScoreOptions } from "@donizetti/musicxml";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { appStrings as text } from "./strings";

const KEYS: readonly [number, string][] = [
  [-7, "C♭ major / A♭ minor"],
  [-6, "G♭ major / E♭ minor"],
  [-5, "D♭ major / B♭ minor"],
  [-4, "A♭ major / F minor"],
  [-3, "E♭ major / C minor"],
  [-2, "B♭ major / G minor"],
  [-1, "F major / D minor"],
  [0, "C major / A minor"],
  [1, "G major / E minor"],
  [2, "D major / B minor"],
  [3, "A major / F♯ minor"],
  [4, "E major / C♯ minor"],
  [5, "B major / G♯ minor"],
  [6, "F♯ major / D♯ minor"],
  [7, "C♯ major / A♯ minor"],
];

const TIMES = ["4/4", "3/4", "2/4", "2/2", "6/8", "9/8", "12/8", "3/8", "5/4"] as const;

/**
 * The demo app's New… (decision 19): one dialog with the title, composer, key, time, pickup, tempo and number
 * of measures of a new lead sheet.
 */
export function NewScoreDialog({
  open,
  onCreate,
  onClose,
}: {
  open: boolean;
  onCreate: (options: NewScoreOptions) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [fifths, setFifths] = useState(0);
  const [time, setTime] = useState<string>("4/4");
  const [pickup, setPickup] = useState(false);
  const [tempo, setTempo] = useState(120);
  const [measures, setMeasures] = useState(16);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal?.();
    if (!open && element.open) element.close();
  }, [open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const [beats, beatType] = time.split("/").map(Number);
    onCreate({ title: title.trim(), composer: composer.trim(), fifths, beats, beatType, pickup, tempo, measures });
  }

  return (
    <dialog ref={dialog} className="app-dialog" aria-labelledby="new-score-title" onClose={onClose}>
      <form onSubmit={submit}>
        <h2 id="new-score-title">{text.newScore}</h2>
        <label>
          {text.newTitle}
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          {text.newComposer}
          <input value={composer} onChange={(event) => setComposer(event.target.value)} />
        </label>
        <label>
          {text.newKey}
          <select value={fifths} onChange={(event) => setFifths(Number(event.target.value))}>
            {KEYS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.newTime}
          <select value={time} onChange={(event) => setTime(event.target.value)}>
            {TIMES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="app-check">
          <input type="checkbox" checked={pickup} onChange={(event) => setPickup(event.target.checked)} />
          {text.newPickup}
        </label>
        <label>
          {text.newTempo}
          <input
            type="number"
            min={20}
            max={400}
            value={tempo}
            onChange={(event) => setTempo(Number(event.target.value))}
          />
        </label>
        <label>
          {text.newMeasures}
          <input
            type="number"
            min={1}
            max={999}
            value={measures}
            onChange={(event) => setMeasures(Number(event.target.value))}
          />
        </label>
        <div className="app-dialog-buttons">
          <button type="button" onClick={onClose}>
            {text.cancel}
          </button>
          <button type="submit">{text.create}</button>
        </div>
      </form>
    </dialog>
  );
}
