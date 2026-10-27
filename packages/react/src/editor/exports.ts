/** Classes the editor adds to the drawing for the selection, left out of exported pages. */
const EDITOR_CLASSES = ["dz-selected", "dz-cursor-note"];

/**
 * The drawn pages as SVG documents (one per page OSMD drew), without the selection or the playback cursor, for
 * an SVG export or a PDF made from them.
 */
export function svgPages(container: HTMLElement | null): string[] {
  if (!container) return [];
  const serializer = new XMLSerializer();
  return Array.from(container.querySelectorAll("svg")).map((page) => {
    const copy = page.cloneNode(true) as SVGSVGElement;
    for (const name of EDITOR_CLASSES)
      for (const marked of copy.querySelectorAll(`.${name}`)) marked.classList.remove(name);
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return serializer.serializeToString(copy);
  });
}

/** Gives the browser a file to save (the export's default without a host to write it). */
export function downloadFile(content: Uint8Array | string, name: string, type: string) {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
