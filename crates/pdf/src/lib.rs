mod error;
mod fonts;
mod pages;

pub use error::PdfError;
pub use fonts::system_fonts;
pub use pages::{svg_pages_to_pdf, svg_pages_to_pdf_with_fonts};
pub use svg2pdf::usvg::fontdb;

#[cfg(test)]
#[path = "../tests/unit/tests.rs"]
mod tests;
