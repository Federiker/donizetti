import {
  editabilityOf,
  isChanged,
  mapScore,
  MusicXmlError,
  mediaTypeOf,
  midiOf,
  readScore,
  type ScoreDocument,
  type ScoreFormat,
  scoreText,
  writeScore,
} from "@donizetti/musicxml";
import { exportMidi } from "@donizetti/playback";
import {
  forwardRef,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { type DrawnScore, noteElementAt, selectionElementsOf } from "../drawing/drawn-score";
import { useDrawing } from "../drawing/use-drawing";
import { runEdit } from "../editing/commands";
import { ScoreHistory } from "../editing/history";
import {
  type InputLength,
  type LengthType,
  measureSelection,
  type Selection,
  selectedNote,
  selectionOf,
  stepSelection,
} from "../editing/selection";
import { actionOf, type ShortcutAction } from "../keyboard/shortcuts";
import { ReadOnlyNotice } from "../notices/ReadOnlyNotice";
import { useScorePlayer } from "../playback/use-score-player";
import type { Strings } from "../strings/en-GB";
import { createTranslate, type Translate, TranslateProvider } from "../strings/translate";
import { type ExportKind, Toolbar } from "../toolbar/Toolbar";
import { describeSelection } from "./describe";
import { downloadFile, svgPages } from "./exports";

/** A score file as the editor saves it. */
export type SavedScore = { bytes: Uint8Array; format: ScoreFormat; mediaType: string };

/** What the host is told after each change, undo and redo. */
export type ScoreChange = {
  document: ScoreDocument;
  /** Whether the score differs from the file it was read from (or last saved as). */
  dirty: boolean;
};

/** What an export gives the host: MIDI's bytes, or the drawn pages as SVG text (to save, or to make a PDF of). */
export type ExportedScore = { kind: "midi"; bytes: Uint8Array } | { kind: "svg" | "pdf"; pages: string[] };

export type ScoreEditorProps = {
  /** The score's file: a `.musicxml`, `.xml` or `.mxl` file's bytes, or MusicXML text. */
  source: Uint8Array | ArrayBuffer | string;
  /** Its name, for the label and for exported files' names. */
  fileName?: string;
  /** Only draw and play, never edit, whatever the score. */
  readOnly?: boolean;
  /** The soundfont's bytes (SF2 or SF3), loaded on first play (decision 10); without it, the score is not played. */
  soundfont?: () => Promise<ArrayBuffer | Uint8Array>;
  /** Called after each change, undo and redo. */
  onChange?: (change: ScoreChange) => void;
  /** Called by Save (Ctrl+S) with the file to write; without it, there is no Save. */
  onSave?: (file: SavedScore) => void | Promise<void>;
  /**
   * Called by Export with the exported score. Without it, MIDI and SVG are downloaded and PDF printed through
   * the browser; a Tauri host writes them, and makes the PDF, with `@donizetti/tauri`.
   */
  onExport?: (exported: ExportedScore) => void | Promise<void>;
  /** Replacements for the component's messages. */
  strings?: Partial<Strings>;
  /** The host's own translation of the component's messages (decision 6). */
  t?: Translate;
  className?: string;
};

/** What the host can do through a ref. */
export type ScoreEditorHandle = {
  document: () => ScoreDocument | null;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
  export: (kind: ExportKind) => Promise<ExportedScore | null>;
};

type Loaded = { history: ScoreHistory } | { error: MusicXmlError };

const DEFAULT_LENGTH: InputLength = { type: "quarter", dots: 0 };

function loadScore(source: ScoreEditorProps["source"]): Loaded {
  try {
    return { history: new ScoreHistory(readScore(source)) };
  } catch (error) {
    if (error instanceof MusicXmlError) return { error };
    throw error;
  }
}

/**
 * A MusicXML score drawn with OpenSheetMusicDisplay, played with the host's soundfont, and edited in place with
 * MuseScore's keys when it has one part, one staff and one voice (decisions 4, 7 and 8). The host gives the
 * file's bytes and receives them back on Save; the component reads and writes no files itself.
 */
export const ScoreEditor = forwardRef<ScoreEditorHandle, ScoreEditorProps>(function ScoreEditor(props, ref) {
  const { source, fileName, readOnly = false, soundfont, onChange, onSave, onExport, strings, t: hostT } = props;
  const t = useMemo(() => createTranslate({ strings, t: hostT }), [strings, hostT]);
  const loaded = useMemo(() => loadScore(source), [source]);
  const history = "history" in loaded ? loaded.history : null;
  /** Raised on each change, undo and redo: the score is drawn again. */
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [noteInput, setNoteInput] = useState(false);
  const [length, setLength] = useState<InputLength>(DEFAULT_LENGTH);
  const [problem, setProblem] = useState<"edit" | "save" | null>(null);
  const [savedText, setSavedText] = useState<string | null>(null);
  const container = useRef<HTMLDivElement | null>(null);

  // A new file starts afresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reset is what a new history means.
  useEffect(() => {
    setVersion(0);
    setSelection(null);
    setNoteInput(false);
    setSavedText(null);
    setProblem(null);
  }, [history]);

  const document = history?.document ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the document changes in place; `version` says when.
  const text = useMemo(() => (document ? scoreText(document) : null), [document, version]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: as above.
  const editability = useMemo(() => (document ? editabilityOf(document.root) : null), [document, version]);
  const editable = !readOnly && editability?.editable === true;
  // biome-ignore lint/correctness/useExhaustiveDependencies: as above.
  const map = useMemo(() => (document ? mapScore(document.root) : null), [document, version]);
  const name = fileName ?? t("score.untitled");

  const drawing = useDrawing(container, document, text);
  const drawn: DrawnScore | null = drawing.drawn;
  const player = useScorePlayer(drawn, soundfont, name);

  const dirty = document !== null && (savedText === null ? isChanged(document) : text !== savedText);

  const changed = useCallback(() => {
    setVersion((value) => value + 1);
    setProblem(null);
    const current = history?.document;
    if (current && onChange) {
      onChange({
        document: current,
        dirty: savedText === null ? isChanged(current) : scoreText(current) !== savedText,
      });
    }
  }, [history, onChange, savedText]);

  // The selection drawn: its noteheads marked, as the cursor or the selected note.
  useEffect(() => {
    if (!drawn || !map) return undefined;
    const note = selectedNote(map, selection);
    const shown = note ? drawn.drawnOf.get(note.element) : undefined;
    if (!shown) return undefined;
    const marks = selectionElementsOf(drawn, shown);
    const className = selection?.kind === "cursor" ? "dz-cursor-note" : "dz-selected";
    for (const mark of marks) mark.classList.add(className);
    return () => {
      for (const mark of marks) mark.classList.remove(className);
    };
  }, [drawn, map, selection]);

  const select = useCallback(
    (next: Selection, sound = true) => {
      setSelection(next);
      const note = selectedNote(map, next);
      if (!note) return;
      player.seek(note.measure, note.onset);
      if (sound && note.pitch) player.preview(midiOf(note.pitch));
    },
    [map, player],
  );

  const save = useCallback(async () => {
    if (!document || !onSave) return;
    const bytes = writeScore(document);
    try {
      await onSave({ bytes, format: document.format, mediaType: mediaTypeOf(document.format) });
      setSavedText(scoreText(document));
      onChange?.({ document, dirty: false });
    } catch {
      setProblem("save");
    }
  }, [document, onSave, onChange]);

  const exportScore = useCallback(
    async (kind: ExportKind): Promise<ExportedScore | null> => {
      if (!drawn) return null;
      const exported: ExportedScore =
        kind === "midi" ? { kind, bytes: exportMidi(drawn.osmd.Sheet) } : { kind, pages: svgPages(container.current) };
      if (onExport) await onExport(exported);
      else if (exported.kind === "midi")
        downloadFile(exported.bytes, `${name.replace(/\.\w+$/, "")}.mid`, "audio/midi");
      else if (kind === "svg")
        downloadFile(exported.pages[0] ?? "", `${name.replace(/\.\w+$/, "")}.svg`, "image/svg+xml");
      else window.print();
      return exported;
    },
    [drawn, onExport, name],
  );

  const undo = useCallback(() => {
    if (history?.undo()) changed();
  }, [history, changed]);
  const redo = useCallback(() => {
    if (history?.redo()) changed();
  }, [history, changed]);

  const act = useCallback(
    (action: ShortcutAction): boolean => {
      if (!history || !map) return false;
      switch (action) {
        case "play":
          void player.toggle();
          return true;
        case "save":
          void save();
          return onSave !== undefined;
        case "undo":
          undo();
          return true;
        case "redo":
          redo();
          return true;
        case "escape":
          if (noteInput) {
            setNoteInput(false);
            const note = selectedNote(map, selection);
            setSelection(note ? selectionOf(map, note.element) : null);
          } else setSelection(null);
          return true;
        case "next":
        case "previous":
          select(stepSelection(map, selection, action === "next" ? 1 : -1));
          return true;
        case "nextMeasure":
        case "previousMeasure":
          select(
            measureSelection(map, selection, (selection?.measure ?? -1) + (action === "nextMeasure" ? 1 : -1)),
            false,
          );
          return true;
        case "first":
        case "last":
          select(measureSelection(map, selection, action === "first" ? 0 : map.measures.length - 1), false);
          return true;
        default:
          break;
      }
      if (!editable) return false;
      if (action === "noteInput.toggle") {
        if (noteInput) {
          setNoteInput(false);
          return true;
        }
        const note = selectedNote(map, selection) ?? map.measures[0]?.notes.find((candidate) => !candidate.chord);
        setNoteInput(true);
        setSelection(
          note
            ? { kind: "cursor", measure: note.measure, onset: note.onset }
            : { kind: "cursor", measure: 0, onset: 0 },
        );
        return true;
      }
      if (action.startsWith("length.") && action !== "length.dot") {
        const type = action.slice("length.".length) as LengthType;
        setLength({ type, dots: 0 });
        if (!noteInput) {
          // Outside note input, a length key changes the selected note's length, as in MuseScore.
          return applyEdit(action, { type, dots: 0 });
        }
        return true;
      }
      if (action === "length.dot") {
        const next = { type: length.type, dots: length.dots > 0 ? 0 : 1 };
        setLength(next);
        return noteInput ? true : applyEdit(action, next);
      }
      return applyEdit(action, length);

      function applyEdit(edit: ShortcutAction, inputLength: InputLength): boolean {
        if (!history || !map) return false;
        try {
          const result = runEdit(edit, { history, map, selection, length: inputLength, noteInput });
          if (!result) return false;
          changed();
          setSelection(result.selection);
          if (result.sound !== undefined) player.preview(result.sound);
        } catch {
          setProblem("edit");
        }
        return true;
      }
    },
    [history, map, player, save, onSave, undo, redo, noteInput, selection, select, editable, length, changed],
  );

  useImperativeHandle(
    ref,
    () => ({
      document: () => history?.document ?? null,
      play: player.play,
      pause: player.pause,
      stop: player.stop,
      undo,
      redo,
      save,
      export: exportScore,
    }),
    [history, player, undo, redo, save, exportScore],
  );

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const action = actionOf(event.nativeEvent);
    if (action && act(action)) event.preventDefault();
  }

  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (!drawn || !map) return;
    const element = noteElementAt(drawn, event.clientX, event.clientY);
    const picked = element ? selectionOf(map, element) : null;
    if (!picked) return;
    if (noteInput && picked.kind === "note") {
      const note = map.measures[picked.measure]!.notes[picked.index]!;
      select({ kind: "cursor", measure: note.measure, onset: note.onset });
    } else select(picked);
  }

  if ("error" in loaded) {
    return (
      <TranslateProvider value={t}>
        <section className={`dz-editor ${props.className ?? ""}`} aria-label={t("score.label", { name })}>
          <p className="dz-notice dz-problem" role="alert">
            {t(`read.${loaded.error.code}`, loaded.error.params)}
          </p>
        </section>
      </TranslateProvider>
    );
  }

  return (
    <TranslateProvider value={t}>
      <section
        className={`dz-editor ${noteInput ? "dz-note-input" : ""} ${props.className ?? ""}`}
        aria-label={t("score.label", { name })}
      >
        <Toolbar
          player={player}
          editable={editable}
          noteInput={noteInput}
          length={length}
          canUndo={history?.canUndo ?? false}
          canRedo={history?.canRedo ?? false}
          canSave={onSave !== undefined}
          onAction={act}
          onStop={player.stop}
          onExport={(kind) => void exportScore(kind)}
        />
        {!readOnly && editability && !editability.editable && <ReadOnlyNotice reasons={editability.reasons} />}
        {drawing.status === "loading" && (
          <p className="dz-notice" role="status">
            {t("score.loading")}
          </p>
        )}
        {drawing.status === "failed" && (
          <p className="dz-notice dz-problem" role="alert">
            {t("score.drawFailed")}
          </p>
        )}
        {problem && (
          <p className="dz-notice dz-problem" role="alert">
            {t(problem === "edit" ? "edit.failed" : "toolbar.saveFailed")}
          </p>
        )}
        <p className="dz-status" aria-live="polite" data-dirty={dirty ? "yes" : "no"}>
          {describeSelection(t, map, selection)}
        </p>
        <div
          className="dz-sheet"
          ref={container}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the score takes the editor's keys, as MuseScore's canvas does.
          tabIndex={0}
          role="application"
          aria-label={t("score.label", { name })}
          onKeyDown={onKeyDown}
          onClick={onClick}
        />
      </section>
    </TranslateProvider>
  );
});
