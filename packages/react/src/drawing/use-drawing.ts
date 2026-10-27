import type { ScoreDocument } from "@donizetti/musicxml";
import type { OpenSheetMusicDisplay, PointF2D } from "opensheetmusicdisplay";
import { type RefObject, useEffect, useRef, useState } from "react";

import { type DrawnScore, indexDrawing } from "./drawn-score";

export type DrawingStatus = "loading" | "ready" | "failed";

type Osmd = { osmd: OpenSheetMusicDisplay; point: typeof PointF2D };

/**
 * Draws the score's text into the container with OpenSheetMusicDisplay (loaded on first use), again after each
 * change (redrawing a lead sheet takes well under 0.1 s) and when the container's width changes, then indexes
 * what it drew so clicks and the selection find their `<note>`s.
 */
export function useDrawing(
  container: RefObject<HTMLDivElement | null>,
  document: ScoreDocument | null,
  text: string | null,
): { status: DrawingStatus; drawn: DrawnScore | null } {
  const instance = useRef<Promise<Osmd> | null>(null);
  const [status, setStatus] = useState<DrawingStatus>("loading");
  const [drawn, setDrawn] = useState<DrawnScore | null>(null);
  const width = useRef(0);

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

  // Drawn again at a new width (systems are laid out to fit), indexed again.
  useEffect(() => {
    const element = container.current;
    if (!element || !drawn || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (Math.abs(element.clientWidth - width.current) < 2) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!document) return;
        width.current = element.clientWidth;
        drawn.osmd.render();
        setDrawn(indexDrawing(drawn.osmd, drawn.point, document.root));
      });
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [container, drawn, document]);

  useEffect(
    () => () => {
      void instance.current?.then(({ osmd }) => osmd.clear());
      instance.current = null;
    },
    [],
  );

  return { status, drawn };
}
