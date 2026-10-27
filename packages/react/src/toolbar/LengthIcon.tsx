import type { LengthType } from "../editing/selection";

const FLAGS: Record<LengthType, number> = {
  "64th": 4,
  "32nd": 3,
  "16th": 2,
  eighth: 1,
  quarter: 0,
  half: 0,
  whole: 0,
  breve: 0,
};

/** A small drawing of a note of this length, for the toolbar (no music font needed). */
export function LengthIcon({ type }: { type: LengthType }) {
  const hollow = type === "half" || type === "whole" || type === "breve";
  const stem = type !== "whole" && type !== "breve";
  return (
    <svg className="dz-icon" viewBox="0 0 16 24" width="16" height="24" aria-hidden="true" focusable="false">
      <ellipse
        cx="6"
        cy="18"
        rx="4.2"
        ry="3"
        transform="rotate(-20 6 18)"
        fill={hollow ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth={hollow ? 1.6 : 0}
      />
      {type === "breve" && <path d="M1 14v8M11 14v8" stroke="currentColor" strokeWidth="1.2" />}
      {stem && <path d="M9.8 17V2" stroke="currentColor" strokeWidth="1.3" />}
      {Array.from({ length: FLAGS[type] }, (_, flag) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the flags are drawn in order and never move.
        <path key={flag} d={`M9.8 ${2 + flag * 3.2} q5 3 3 8`} fill="none" stroke="currentColor" strokeWidth="1.3" />
      ))}
    </svg>
  );
}
