import { mapScore, partsOf, type ScoreMap } from "@donizetti/musicxml";
import type { GraphicalNote, OpenSheetMusicDisplay, PointF2D } from "opensheetmusicdisplay";

import { locationOf, mappedNoteOf, nearestDrawnNote } from "../selection/drawn-note";

/** A score as OSMD drew it: the drawing, the maps of its parts, and which drawn note is which `<note>`. */
export type DrawnScore = {
  osmd: OpenSheetMusicDisplay;
  point: typeof PointF2D;
  maps: (ScoreMap | null)[];
  /** The drawn note of each `<note>` element (a tied note's ends are separate notes). */
  drawnOf: Map<Element, GraphicalNote>;
};

/** Every note OSMD drew, in page order. */
export function drawnNotes(osmd: OpenSheetMusicDisplay): GraphicalNote[] {
  const notes: GraphicalNote[] = [];
  for (const row of osmd.GraphicSheet?.MeasureList ?? []) {
    for (const measure of row) {
      for (const staffEntry of measure?.staffEntries ?? []) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) notes.push(...voiceEntry.notes);
      }
    }
  }
  return notes;
}

/** Indexes a score OSMD has just drawn: each drawn note found in the XML (see docs/research/click-to-xml.md). */
export function indexDrawing(osmd: OpenSheetMusicDisplay, point: typeof PointF2D, root: Element): DrawnScore {
  const maps = partsOf(root).map((_, index) => mapScore(root, index));
  const drawnOf = new Map<Element, GraphicalNote>();
  for (const drawn of drawnNotes(osmd)) {
    const location = locationOf(osmd.Sheet, drawn.sourceNote);
    const mapped = location ? mappedNoteOf(maps, location) : null;
    if (mapped && !drawnOf.has(mapped.element)) drawnOf.set(mapped.element, drawn);
  }
  return { osmd, point, maps, drawnOf };
}

/** The `<note>` drawn nearest a point of the page (client coordinates), or null. */
export function noteElementAt(score: DrawnScore, clientX: number, clientY: number): Element | null {
  const drawn = nearestDrawnNote(score.osmd, score.point, clientX, clientY);
  if (!drawn) return null;
  const location = locationOf(score.osmd.Sheet, drawn.sourceNote);
  return location ? (mappedNoteOf(score.maps, location)?.element ?? null) : null;
}

type DrawnNoteElements = {
  getSVGGElement?: () => SVGGElement | undefined;
  getNoteheadSVGs?: () => Element[] | undefined;
};

/**
 * The SVG elements to mark when a note is selected: its own notehead (in a chord, the head drawn nearest
 * where OSMD placed this note), else its whole group.
 */
export function selectionElementsOf(score: DrawnScore, drawn: GraphicalNote): Element[] {
  const parts = drawn as GraphicalNote & DrawnNoteElements;
  const heads = parts.getNoteheadSVGs?.() ?? [];
  if (heads.length > 1) {
    const at = drawn.PositionAndShape.AbsolutePosition;
    const target = score.osmd.GraphicSheet.svgToDom(new score.point(at.x * 10, at.y * 10));
    let best: Element | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const head of heads) {
      const box = head.getBoundingClientRect();
      const away = Math.abs(box.top + box.height / 2 - target.y);
      if (away < distance) {
        best = head;
        distance = away;
      }
    }
    if (best) return [best];
  }
  if (heads.length === 1) return heads;
  const group = parts.getSVGGElement?.();
  return group ? [group] : [];
}
