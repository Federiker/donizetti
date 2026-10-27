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
