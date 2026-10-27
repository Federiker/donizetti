import type { ScoreDocument } from "@donizetti/musicxml";
import type { OpenSheetMusicDisplay, PointF2D } from "opensheetmusicdisplay";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { type DrawnScore, indexDrawing } from "./drawn-score";

export type DrawingStatus = "loading" | "ready" | "failed";

type Osmd = { osmd: OpenSheetMusicDisplay; point: typeof PointF2D };

/** The ink of printed music: exports and printing are black on white in every theme (decision 15). */
const PRINTED_INK = "#000000";

/** The colours OSMD draws in: the notes, the title and the text (lyrics, chord symbols, directions). */
function inkOptions(ink: string) {
  return { defaultColorMusic: ink, defaultColorTitle: ink, defaultColorLabel: ink };
}

/**
 * Draws the score's text into the container with OpenSheetMusicDisplay (loaded on first use), in the theme's
 * ink, again after each change (redrawing a lead sheet takes well under 0.1 s), when the container's width or
 * the ink changes, then indexes what it drew so clicks and the selection find their `<note>`s. For exports and
 * printing, `printed` draws it black for a moment.
 */
export function useDrawing(
  container: RefObject<HTMLDivElement | null>,
  document: ScoreDocument | null,
  text: string | null,
  ink: string,
): {
  status: DrawingStatus;
  drawn: DrawnScore | null;
  printed: <T>(run: () => T) => T;
} {
  const instance = useRef<Promise<Osmd> | null>(null);
  const [status, setStatus] = useState<DrawingStatus>("loading");
  const [drawn, setDrawn] = useState<DrawnScore | null>(null);
  const width = useRef(0);
  const inkNow = useRef(ink);
  inkNow.current = ink;

  useEffect(() => {
    if (!container.current || !document || text === null) return undefined;
    const element = container.current;
    let cancelled = false;
    instance.current ??= import("opensheetmusicdisplay").then(({ OpenSheetMusicDisplay, PointF2D }) => ({
      osmd: new OpenSheetMusicDisplay(element, {
        // The editor redraws on resize itself, so its index of drawn notes stays right.
        autoResize: false,
        backend: "svg",
        drawTitle: true,
        followCursor: true,
      }),
      point: PointF2D,
    }));
    (async () => {
      const { osmd, point } = await instance.current!;
      await osmd.load(text);
      if (cancelled) return;
      osmd.setOptions(inkOptions(inkNow.current));
      osmd.render();
      width.current = element.clientWidth;
      setDrawn(indexDrawing(osmd, point, document.root));
      setStatus("ready");
    })().catch(() => {
      if (!cancelled) setStatus("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [container, document, text]);

  const redraw = useCallback(
    (score: DrawnScore, colour: string) => {
      if (!document) return;
      score.osmd.setOptions(inkOptions(colour));
      score.osmd.render();
      setDrawn(indexDrawing(score.osmd, score.point, document.root));
    },
    [document],
  );

  // Drawn again in a new theme's ink.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new ink redraws here; the drawing itself is redrawn above.
  useEffect(() => {
    if (drawn) redraw(drawn, ink);
  }, [ink]);

  // Drawn again at a new width (systems are laid out to fit), indexed again.
  useEffect(() => {
    const element = container.current;
    if (!element || !drawn || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (Math.abs(element.clientWidth - width.current) < 2) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        width.current = element.clientWidth;
        redraw(drawn, inkNow.current);
      });
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [container, drawn, redraw]);

  const printed = useCallback(
    <T>(run: () => T): T => {
      if (!drawn || inkNow.current === PRINTED_INK) return run();
      drawn.osmd.setOptions(inkOptions(PRINTED_INK));
      drawn.osmd.render();
      try {
        return run();
      } finally {
        redraw(drawn, inkNow.current);
      }
    },
    [drawn, redraw],
  );

  // Printing draws black on white, then the theme's ink again.
  useEffect(() => {
    if (!drawn) return undefined;
    const before = () => {
      drawn.osmd.setOptions(inkOptions(PRINTED_INK));
      drawn.osmd.render();
    };
    const after = () => redraw(drawn, inkNow.current);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [drawn, redraw]);

  useEffect(
    () => () => {
      void instance.current?.then(({ osmd }) => osmd.clear());
      instance.current = null;
    },
    [],
  );

  return { status, drawn, printed };
}
