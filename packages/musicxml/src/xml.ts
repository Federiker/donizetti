/** The element's first child element with this name, or null. */
export function childElement(parent: Element, name: string): Element | null {
  for (const child of Array.from(parent.children)) if (child.localName === name) return child;
  return null;
}

/** The element's child elements with this name, in order. */
export function childElements(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === name);
}

/** The trimmed text of the element's first child with this name, or null when there is none. */
export function childText(parent: Element, name: string): string | null {
  const child = childElement(parent, name);
  return child ? (child.textContent ?? "").trim() : null;
}

/** The number in the element's first child with this name, or null when there is none or it is not a number. */
export function childNumber(parent: Element, name: string): number | null {
  const text = childText(parent, name);
  if (text === null || text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
