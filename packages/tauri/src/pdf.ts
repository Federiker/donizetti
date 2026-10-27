import { call } from "./call";

/**
 * Writes the score's pages to `path` as one PDF: each SVG (as `<ScoreEditor>` exports them) a page of
 * its own size, the music as vectors and the text as text, in the computer's fonts.
 *
 * @throws DonizettiPluginError `pdf_no_pages`, `pdf_invalid_svg` or `pdf_conversion_failed` (with the
 * `page`, from 1), `pdf_no_fonts` or `write_failed`; nothing is written after any of them.
 */
export async function exportPdf(pages: readonly string[], path: string): Promise<void> {
  await call("export_pdf", { pages, path });
}
