import { type RefObject, useEffect, useState } from "react";

/** How the editor is themed: following the system (`auto`), or always light or dark. */
export type Theme = "auto" | "light" | "dark";

const FALLBACK_INK = "#000000";

/** The ink the score is drawn in: the editor's `--dz-ink`, as the theme and forced colours set it. */
function inkOf(element: HTMLElement | null): string {
  if (!element) return FALLBACK_INK;
  return getComputedStyle(element).getPropertyValue("--dz-ink").trim() || FALLBACK_INK;
}

/**
 * The score's ink (decision 15), read from the stylesheet so that a host's `--dz-ink`, the dark theme and
 * forced colours all reach the drawing; read again when the theme, the system's colour scheme or forced
 * colours change.
 */
export function useInk(element: RefObject<HTMLElement | null>, theme: Theme): string {
  const [ink, setInk] = useState(FALLBACK_INK);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new theme changes the stylesheet's ink, read again here.
  useEffect(() => {
    const update = () => setInk(inkOf(element.current));
    update();
    if (typeof window.matchMedia !== "function") return undefined;
    const queries = ["(prefers-color-scheme: dark)", "(forced-colors: active)"].map((query) =>
      window.matchMedia(query),
    );
    for (const query of queries) query.addEventListener("change", update);
    return () => {
      for (const query of queries) query.removeEventListener("change", update);
    };
  }, [element, theme]);
  return ink;
}
