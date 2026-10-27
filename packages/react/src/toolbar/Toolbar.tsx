import { useState } from "react";

import type { InputLength, LengthType } from "../editing/selection";
import { describeShortcut, SHORTCUTS, type ShortcutAction } from "../keyboard/shortcuts";
import type { PlayerState } from "../playback/use-score-player";
import type { MessageKey } from "../strings/en-GB";
import { useTranslate } from "../strings/translate";
import { LengthIcon } from "./LengthIcon";

export type ExportKind = "midi" | "svg" | "pdf";

const LENGTHS: readonly LengthType[] = ["64th", "32nd", "16th", "eighth", "quarter", "half", "whole", "breve"];

/** The keys of an action, as a tooltip shows them ("Ctrl+Z"), or an empty string. */
function keysOf(action: ShortcutAction): string {
  const shortcut = SHORTCUTS.find((candidate) => candidate.action === action);
  return shortcut ? describeShortcut(shortcut) : "";
}

function titled(label: string, action: ShortcutAction): string {
  const keys = keysOf(action);
  return keys ? `${label} (${keys})` : label;
}

export type ToolbarProps = {
  player: { available: boolean; state: PlayerState; failed: boolean };
  editable: boolean;
  noteInput: boolean;
  length: InputLength;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  onAction: (action: ShortcutAction) => void;
  onStop: () => void;
  onExport: (kind: ExportKind) => void;
};

/** The editor's tools: playback, note input and lengths, undo and redo, save and export. */
export function Toolbar(props: ToolbarProps) {
  const t = useTranslate();
  const [exporting, setExporting] = useState(false);
  const { player, editable, noteInput, length } = props;
  const button = (action: ShortcutAction, key: MessageKey, extra: { pressed?: boolean; disabled?: boolean } = {}) => (
    <button
      type="button"
      className="dz-button"
      aria-pressed={extra.pressed}
      disabled={extra.disabled}
      title={titled(t(key), action)}
      onClick={() => props.onAction(action)}
    >
      {t(key)}
    </button>
  );
  return (
    <div className="dz-toolbar" role="toolbar" aria-label={t("toolbar.label")}>
      <fieldset className="dz-group">
        {player.state === "playing"
          ? button("play", "toolbar.pause", { disabled: !player.available })
          : button("play", "toolbar.play", { disabled: !player.available })}
        <button
          type="button"
          className="dz-button"
          disabled={!player.available || player.state === "stopped"}
          onClick={props.onStop}
        >
          {t("toolbar.stop")}
        </button>
        {!player.available && <span className="dz-hint">{t("toolbar.noSoundfont")}</span>}
        {player.failed && (
          <span className="dz-hint dz-problem" role="alert">
            {t("toolbar.playFailed")}
          </span>
        )}
      </fieldset>
      {editable && (
        <>
          <fieldset className="dz-group">
            {button("noteInput.toggle", "toolbar.noteInput", { pressed: noteInput })}
          </fieldset>
          <fieldset className="dz-group" aria-label={t("length.label")}>
            {LENGTHS.map((type) => (
              <button
                key={type}
                type="button"
                className="dz-button dz-icon-button"
                aria-pressed={length.type === type}
                aria-label={t(`length.${type}`)}
                title={titled(t(`length.${type}`), `length.${type}`)}
                onClick={() => props.onAction(`length.${type}`)}
              >
                <LengthIcon type={type} />
              </button>
            ))}
            <button
              type="button"
              className="dz-button dz-icon-button"
              aria-pressed={length.dots > 0}
              aria-label={t("length.dot")}
              title={titled(t("length.dot"), "length.dot")}
              onClick={() => props.onAction("length.dot")}
            >
              <span aria-hidden="true">•</span>
            </button>
            {button("rest", "length.rest")}
            {button("tie", "length.tie")}
          </fieldset>
          <fieldset className="dz-group">
            {button("undo", "toolbar.undo", { disabled: !props.canUndo })}
            {button("redo", "toolbar.redo", { disabled: !props.canRedo })}
          </fieldset>
        </>
      )}
      <fieldset className="dz-group">
        {props.canSave && button("save", "toolbar.save")}
        <div className="dz-menu">
          <button
            type="button"
            className="dz-button"
            aria-haspopup="menu"
            aria-expanded={exporting}
            onClick={() => setExporting((open) => !open)}
          >
            {t("toolbar.export")}
          </button>
          {exporting && (
            <div className="dz-menu-items" role="menu">
              {(["midi", "svg", "pdf"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  className="dz-menu-item"
                  onClick={() => {
                    setExporting(false);
                    props.onExport(kind);
                  }}
                >
                  {t(
                    kind === "midi" ? "toolbar.exportMidi" : kind === "svg" ? "toolbar.exportSvg" : "toolbar.exportPdf",
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}
