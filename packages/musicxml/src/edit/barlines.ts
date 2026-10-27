import type { ScoreDocument } from "../score-document";
import { childElement, childText } from "../xml";
import { editableMap, measureOf } from "./edit-context";
import { ScoreEditError } from "./edit-error";
import { createElement, edit, insertElement, insertInOrder, removeElement, setChildText } from "./xml-edit";

/** Which end of its measure a `<barline>` is at (MusicXML's `location`; `middle` is not used here). */
export type BarlineLocation = "left" | "right";

/** How a measure ends, as the palette offers it: a single barline, a double one, a final one. */
export type BarStyle = "regular" | "double" | "final";

/** What a measure's barlines say: a start repeat, an end repeat (and how many times it plays), the closing style. */
export type MeasureBarlines = {
  startRepeat: boolean;
  /** The times an end repeat plays (2 when its `times` is not written), or null without one. */
  endRepeat: number | null;
  /** The closing barline's `<bar-style>` as written, or null for a regular one. */
  endStyle: string | null;
};

const BAR_STYLES: Record<Exclude<BarStyle, "regular">, string> = { double: "light-light", final: "light-heavy" };

/** The measure's `<barline>` at one end (one without `location` is at the right), or null. */
export function barlineAt(measure: Element, location: BarlineLocation): Element | null {
  return (
    Array.from(measure.children).find(
      (child) => child.localName === "barline" && (child.getAttribute("location") ?? "right") === location,
    ) ?? null
  );
}

/** The `<repeat>` of a barline going this way, or null. */
function repeatOf(barline: Element | null, direction: "forward" | "backward"): Element | null {
  if (!barline) return null;
  return (
    Array.from(barline.children).find(
      (child) => child.localName === "repeat" && child.getAttribute("direction") === direction,
    ) ?? null
  );
}

/** Reads what a measure's barlines say. */
export function barlinesOf(measure: Element): MeasureBarlines {
  const right = barlineAt(measure, "right");
  const endRepeat = repeatOf(right, "backward");
  const style = right ? childText(right, "bar-style") : null;
  return {
    startRepeat: repeatOf(barlineAt(measure, "left"), "forward") !== null,
    endRepeat: endRepeat ? Number(endRepeat.getAttribute("times") ?? 2) || 2 : null,
    endStyle: style && style !== "regular" ? style : null,
  };
}

/**
 * The measure's barline at one end with these children added in the schema's order: a new barline goes first
 * in the measure (after `<print>`) at the left, last at the right, laid out as the measure's children are.
 */
export function addToBarline(measure: Element, location: BarlineLocation, children: Element[]): Element {
  const existing = barlineAt(measure, location);
  if (existing) {
    for (const child of children) insertInOrder(existing, child, "barline");
    return existing;
  }
  const barline = createElement(measure.ownerDocument, "barline", children, { location });
  const first = Array.from(measure.children).find((child) => child.localName !== "print") ?? null;
  return insertElement(measure, barline, location === "left" ? first : null);
}

/** Removes a barline left with nothing to say. */
export function dropIfEmpty(barline: Element) {
  if (barline.children.length === 0) removeElement(barline);
}

const element = (measure: Element, name: string, text?: string, attributes?: Record<string, string>) =>
  createElement(measure.ownerDocument, name, text, attributes);

/** Sets or adds a barline's style, keeping its other children. */
function styleBarline(measure: Element, location: BarlineLocation, style: string): Element {
  const existing = barlineAt(measure, location);
  if (existing) {
    setChildText(existing, "bar-style", style, "barline");
    return existing;
  }
  return addToBarline(measure, location, [element(measure, "bar-style", style)]);
}

/** Removes a barline's `<bar-style>` when it is this one, so that the barline is a regular one again. */
function unstyle(barline: Element, style: string) {
  const barStyle = childElement(barline, "bar-style");
  if (barStyle && (barStyle.textContent ?? "").trim() === style) removeElement(barStyle);
}

/**
 * Starts a repeat at a measure: its left barline `heavy-light` with `<repeat direction="forward"/>`, as
 * MuseScore writes it. Returns the `<barline>`.
 */
export function setRepeatStart(document: ScoreDocument, measureIndex: number): Element {
  const measure = measureOf(editableMap(document), measureIndex).element;
  return edit(document, () => {
    const barline = styleBarline(measure, "left", "heavy-light");
    if (!repeatOf(barline, "forward")) {
      insertInOrder(barline, element(measure, "repeat", undefined, { direction: "forward" }), "barline");
    }
    return barline;
  });
}

/** Removes a measure's start repeat; `no_repeat` when it has none. */
export function removeRepeatStart(document: ScoreDocument, measureIndex: number) {
  const measure = measureOf(editableMap(document), measureIndex).element;
  const barline = barlineAt(measure, "left");
  const repeat = repeatOf(barline, "forward");
  if (!barline || !repeat) throw new ScoreEditError("no_repeat", { direction: "forward" });
  edit(document, () => {
    removeElement(repeat);
    unstyle(barline, "heavy-light");
    dropIfEmpty(barline);
  });
}

/**
 * Ends a repeat at a measure: its right barline `light-heavy` with `<repeat direction="backward"/>`, its
 * `times` written only when it plays more than twice (as MuseScore does; not given, it stays as it was).
 * Returns the `<barline>`.
 */
export function setRepeatEnd(document: ScoreDocument, measureIndex: number, times?: number): Element {
  const measure = measureOf(editableMap(document), measureIndex).element;
  if (times !== undefined && !(Number.isInteger(times) && times >= 2)) {
    throw new ScoreEditError("invalid_count", { count: String(times) });
  }
  return edit(document, () => {
    const barline = styleBarline(measure, "right", "light-heavy");
    let repeat = repeatOf(barline, "backward");
    if (!repeat) {
      repeat = insertInOrder(barline, element(measure, "repeat", undefined, { direction: "backward" }), "barline");
    }
    if (times === 2) repeat.removeAttribute("times");
    else if (times !== undefined && repeat.getAttribute("times") !== String(times)) {
      repeat.setAttribute("times", String(times));
    }
    return barline;
  });
}

/** Removes a measure's end repeat, leaving a regular barline; `no_repeat` when it has none. */
export function removeRepeatEnd(document: ScoreDocument, measureIndex: number) {
  const measure = measureOf(editableMap(document), measureIndex).element;
  const barline = barlineAt(measure, "right");
  const repeat = repeatOf(barline, "backward");
  if (!barline || !repeat) throw new ScoreEditError("no_repeat", { direction: "backward" });
  edit(document, () => {
    removeElement(repeat);
    unstyle(barline, "light-heavy");
    dropIfEmpty(barline);
  });
}

/**
 * Sets the barline that closes a measure: `regular`, `double` (`light-light`) or `final` (`light-heavy`),
 * replacing an end repeat there (an ending's stop stays). Returns the `<barline>`, or null when a regular one
 * needs none.
 */
export function setBarStyle(document: ScoreDocument, measureIndex: number, style: BarStyle): Element | null {
  const measure = measureOf(editableMap(document), measureIndex).element;
  return edit(document, () => {
    const existing = barlineAt(measure, "right");
    if (existing) {
      const repeat = repeatOf(existing, "backward");
      if (repeat) removeElement(repeat);
    }
    if (style !== "regular") return styleBarline(measure, "right", BAR_STYLES[style]);
    if (!existing) return null;
    const barStyle = childElement(existing, "bar-style");
    if (barStyle) removeElement(barStyle);
    dropIfEmpty(existing);
    return existing.parentNode ? existing : null;
  });
}
