use std::fmt;

use serde::{Serialize, Serializer, ser::SerializeMap};

/// Why the pages could not be made into a PDF. Pages are numbered from 1.
///
/// It serialises as `{ code, params }`: a stable code for the host to translate, and the values its
/// message needs (`detail` is the SVG reader's or converter's own words, for logs).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PdfError {
    /// There were no pages to write.
    NoPages,
    /// A page is not an SVG image that can be read.
    InvalidSvg { page: usize, detail: String },
    /// A page has text, but no font was found on this computer to draw it with.
    NoFonts { page: usize },
    /// A page could not be converted.
    Conversion { page: usize, detail: String },
}

impl PdfError {
    /// Stable code for the host to translate.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::NoPages => "pdf_no_pages",
            Self::InvalidSvg { .. } => "pdf_invalid_svg",
            Self::NoFonts { .. } => "pdf_no_fonts",
            Self::Conversion { .. } => "pdf_conversion_failed",
        }
    }
}

impl fmt::Display for PdfError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoPages => f.write_str("There are no pages to write."),
            Self::InvalidSvg { page, detail } => write!(f, "Page {page} is not a readable SVG image: {detail}."),
            Self::NoFonts { page } => write!(f, "Page {page} has text, but no font was found to draw it."),
            Self::Conversion { page, detail } => write!(f, "Page {page} could not be converted to PDF: {detail}."),
        }
    }
}

impl std::error::Error for PdfError {}

/// The parameters of an error, as a map.
struct Params<'a>(&'a PdfError);

impl Serialize for Params<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.0 {
            PdfError::NoPages => serializer.serialize_map(Some(0))?.end(),
            PdfError::NoFonts { page } => {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("page", page)?;
                map.end()
            }
            PdfError::InvalidSvg { page, detail } | PdfError::Conversion { page, detail } => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("page", page)?;
                map.serialize_entry("detail", detail)?;
                map.end()
            }
        }
    }
}

impl Serialize for PdfError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("code", self.code())?;
        map.serialize_entry("params", &Params(self))?;
        map.end()
    }
}
