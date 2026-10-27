import type { ReadOnlyReason } from "@donizetti/musicxml";

import { useTranslate } from "../strings/translate";

/** Why the score can be played but not edited (decision 4). */
export function ReadOnlyNotice({ reasons }: { reasons: readonly ReadOnlyReason[] }) {
  const t = useTranslate();
  return (
    <div className="dz-notice" role="note">
      <strong>{t("readOnly.title")}</strong>
      <ul>
        {reasons.map((reason) => (
          <li key={reason.code}>{t(`readOnly.${reason.code}`, "params" in reason ? reason.params : {})}</li>
        ))}
      </ul>
      <p>{t("readOnly.explanation")}</p>
    </div>
  );
}
