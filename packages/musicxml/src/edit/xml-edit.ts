import type { ScoreDocument } from "../score-document";
import { childElement } from "../xml";

/**
 * The order MusicXML 4.0's schema gives the children of an element (its `xs:sequence`): a new child goes after
 * every child named before it and before every child named after it. Names not listed keep their place.
 */
export const CHILD_ORDER = {
  note: [
    "grace",
    "cue",
    "chord",
    "pitch",
    "unpitched",
    "rest",
    "duration",
    "tie",
    "instrument",
    "footnote",
    "level",
    "voice",
    "type",
    "dot",
    "accidental",
    "time-modification",
    "stem",
    "notehead",
    "notehead-text",
    "staff",
    "beam",
    "notations",
    "lyric",
    "play",
    "listen",
  ],
  pitch: ["step", "alter", "octave"],
  attributes: [
    "footnote",
    "level",
    "divisions",
    "key",
    "time",
    "staves",
    "part-symbol",
    "instruments",
    "clef",
    "staff-details",
    "transpose",
    "for-part",
    "directive",
    "measure-style",
  ],
  key: ["cancel", "fifths", "mode", "key-octave"],
  time: ["beats", "beat-type", "interchangeable", "senza-misura"],
  barline: ["bar-style", "footnote", "level", "wavy-line", "segno", "coda", "fermata", "ending", "repeat"],
  harmony: [
    "root",
    "numeral",
    "function",
    "kind",
    "inversion",
    "bass",
    "degree",
    "frame",
    "offset",
    "footnote",
    "level",
    "staff",
  ],
  lyric: [
    "syllabic",
    "text",
    "elision",
    "extend",
    "laughing",
    "humming",
    "end-line",
    "end-paragraph",
    "footnote",
    "level",
  ],
  direction: ["direction-type", "offset", "footnote", "level", "voice", "staff", "sound", "listening"],
} as const satisfies Record<string, readonly string[]>;

export type OrderedElement = keyof typeof CHILD_ORDER;

/** A change to the score: the edit runs, and the document's revision goes up (undo and redo go by it). */
export function edit<T>(document: ScoreDocument, change: (xml: XMLDocument) => T): T {
  const result = change(document.xml);
  document.revision += 1;
  return result;
}

/** A new element, with text or child elements. */
export function createElement(
  xml: XMLDocument,
  name: string,
  content?: string | Element[],
  attributes: Record<string, string> = {},
): Element {
  const element = xml.createElementNS(null, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, value);
  if (typeof content === "string") element.textContent = content;
  else for (const child of content ?? []) element.appendChild(child);
  return element;
}

const isWhitespace = (node: Node | null): node is Text =>
  node !== null && node.nodeType === Node.TEXT_NODE && /^\s*$/.test(node.nodeValue ?? "");

/**
 * How the parent's children are laid out: the whitespace before each child (`"\n      "`) and the extra
 * indentation of one level (`"  "`), or null when they are written on one line, so new children are too.
 */
function layoutOf(parent: Element): { indent: string; unit: string } | null {
  const first = Array.from(parent.childNodes).find((node) => node.nodeType === Node.ELEMENT_NODE);
  const before = first?.previousSibling ?? null;
  if (!isWhitespace(before) || !(before.nodeValue ?? "").includes("\n")) return null;
  const indent = before.nodeValue!;
  const own = parent.previousSibling;
  const ownIndent = isWhitespace(own) && (own.nodeValue ?? "").includes("\n") ? own.nodeValue! : "\n";
  const unit = indent.length > ownIndent.length ? indent.slice(ownIndent.length).replace(/\n/g, "") : "  ";
  return { indent, unit };
}

/** Lays a new element's own children out one level deeper than `indent`, as the file does. */
function layOut(element: Element, indent: string, unit: string) {
  const children = Array.from(element.children);
  if (children.length === 0) return;
  const inner = indent + unit;
  for (const child of children) {
    element.insertBefore(element.ownerDocument.createTextNode(inner), child);
    layOut(child, inner, unit);
  }
  element.appendChild(element.ownerDocument.createTextNode(indent));
}

/**
 * Inserts a new element into the parent before `before` (at the end when null), laid out as its siblings are:
 * on its own line with their indentation when they are, inline when they are not.
 */
export function insertElement(parent: Element, element: Element, before: Element | null = null): Element {
  const layout = layoutOf(parent);
  if (!layout) {
    parent.insertBefore(element, before);
    return element;
  }
  const xml = parent.ownerDocument;
  layOut(element, layout.indent, layout.unit);
  if (before) {
    // Before the element and its own indentation: the new element takes the same indentation.
    parent.insertBefore(element, before);
    parent.insertBefore(xml.createTextNode(layout.indent), before);
    return element;
  }
  // At the end: after the last child, before the whitespace that closes the parent.
  const last = parent.lastChild;
  if (isWhitespace(last)) {
    parent.insertBefore(xml.createTextNode(layout.indent), last);
    parent.insertBefore(element, last);
  } else {
    parent.appendChild(xml.createTextNode(layout.indent));
    parent.appendChild(element);
  }
  return element;
}

/** Inserts a new child where the schema puts it among the parent's children (`CHILD_ORDER`). */
export function insertInOrder(parent: Element, element: Element, order: OrderedElement): Element {
  const names: readonly string[] = CHILD_ORDER[order];
  const rank = names.indexOf(element.localName);
  const before =
    rank < 0
      ? null
      : (Array.from(parent.children).find((child) => {
          const other = names.indexOf(child.localName);
          return other > rank;
        }) ?? null);
  return insertElement(parent, element, before);
}

/** Removes an element with the whitespace that laid it out, so no blank line is left behind. */
export function removeElement(element: Element) {
  const before = element.previousSibling;
  if (isWhitespace(before) && (before.nodeValue ?? "").includes("\n")) before.remove();
  element.remove();
}

/**
 * Sets the text of the parent's child with this name, creating it in the schema's place when missing, and
 * returns it.
 */
export function setChildText(parent: Element, name: string, text: string, order: OrderedElement): Element {
  const existing = childElement(parent, name);
  if (existing) {
    if (existing.textContent !== text) existing.textContent = text;
    return existing;
  }
  return insertInOrder(parent, createElement(parent.ownerDocument, name, text), order);
}

/** Removes every child of the parent with this name. */
export function removeChildren(parent: Element, name: string) {
  for (const child of Array.from(parent.children)) if (child.localName === name) removeElement(child);
}
