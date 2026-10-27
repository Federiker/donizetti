import { partsOf } from "./score-map";

/** Why a score can only be drawn and played, not edited (decision 4), as a code with its parameters. */
export type ReadOnlyReason =
  | { code: "no_parts" }
  | { code: "several_parts"; params: { parts: number } }
  | { code: "several_staves"; params: { staves: number } }
  | { code: "several_voices"; params: { voices: number } }
  /** `<backup>` or `<forward>`: notes written out of time order, as several voices are. */
  | { code: "backup_or_forward" };

export type Editability = { editable: true } | { editable: false; reasons: ReadOnlyReason[] };

/**
 * Whether the editor can change this score safely: one part, one staff, one voice (decision 4), whatever made
 * the file. Otherwise every reason it cannot, for the component to say.
 */
export function editabilityOf(root: Element): Editability {
  const parts = partsOf(root);
  const reasons: ReadOnlyReason[] = [];
  if (parts.length === 0) reasons.push({ code: "no_parts" });
  if (parts.length > 1) reasons.push({ code: "several_parts", params: { parts: parts.length } });
  const staves = Math.max(
    1,
    ...Array.from(root.getElementsByTagName("staves")).map((element) => Number(element.textContent) || 1),
  );
  if (staves > 1) reasons.push({ code: "several_staves", params: { staves } });
  const voices = new Set(
    Array.from(root.getElementsByTagName("voice")).map((element) => (element.textContent ?? "").trim()),
  );
  if (voices.size > 1) reasons.push({ code: "several_voices", params: { voices: voices.size } });
  if (root.getElementsByTagName("backup").length > 0 || root.getElementsByTagName("forward").length > 0) {
    reasons.push({ code: "backup_or_forward" });
  }
  return reasons.length === 0 ? { editable: true } : { editable: false, reasons };
}
