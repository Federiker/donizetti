use std::path::Path;

use donizetti_pdf::svg_pages_to_pdf;

use crate::{error::Error, files::write_atomically};

/// Writes the score's pages (one SVG each, as OpenSheetMusicDisplay draws them) to `path` as one PDF,
/// replacing the file in one rename as a score is.
///
/// # Errors
/// Returns the PDF's errors (`NoPages`, `InvalidSvg`, `NoFonts`, `Conversion`) or `WriteFailed`;
/// nothing is written after any of them.
pub fn export_pdf(pages: &[String], path: &Path) -> Result<(), Error> {
    let pdf = svg_pages_to_pdf(pages)?;
    write_atomically(path, &pdf, || Ok(()))
}

/// Writes an export the app made itself (a MIDI file, an SVG page) to `path`, replacing the file in one
/// rename as a score is. Unlike [`crate::write_score`] there is no hash guard: an export is made again
/// from the score, and the app's save dialog asks before replacing a file.
///
/// # Errors
/// Returns `WriteFailed`; the file is as it was.
pub fn write_export(path: &Path, bytes: &[u8]) -> Result<(), Error> {
    write_atomically(path, bytes, || Ok(()))
}
