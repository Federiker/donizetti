use std::{collections::HashMap, sync::Arc};

use pdf_writer::{Content, Finish, Name, Pdf, Rect, Ref};
use svg2pdf::{
    ConversionOptions,
    usvg::{self, fontdb::Database},
};

use crate::{error::PdfError, fonts::system_fonts};

/// PDF points per CSS pixel: an SVG's pixels are 1/96 inch, a point 1/72 inch.
const POINTS_PER_PIXEL: f32 = 72.0 / 96.0;

/// The name each page gives its drawing in its resources.
const DRAWING: Name<'static> = Name(b"Page");

/// One PDF page per SVG image, each the size of its image (its `width` and `height`, in CSS pixels at
/// 96 to the inch, as OpenSheetMusicDisplay writes them), drawn as vectors with selectable text.
/// Text is drawn with the computer's fonts ([`system_fonts`]).
///
/// # Errors
/// Returns `NoPages` for an empty list, `InvalidSvg` for a page that cannot be read, `NoFonts` for a
/// page with text on a computer without fonts and `Conversion` when svg2pdf fails.
pub fn svg_pages_to_pdf(pages: &[String]) -> Result<Vec<u8>, PdfError> {
    svg_pages_to_pdf_with_fonts(pages, system_fonts())
}

/// [`svg_pages_to_pdf`] with the fonts the caller chooses, for a host that bundles its own.
///
/// # Errors
/// As [`svg_pages_to_pdf`].
pub fn svg_pages_to_pdf_with_fonts(pages: &[String], fonts: Arc<Database>) -> Result<Vec<u8>, PdfError> {
    if pages.is_empty() {
        return Err(PdfError::NoPages);
    }
    let options = usvg::Options {
        fontdb: fonts,
        ..usvg::Options::default()
    };
    let mut ids = Ref::new(1);
    let catalog = ids.bump();
    let page_tree = ids.bump();
    let mut pdf = Pdf::new();
    let mut kids = Vec::with_capacity(pages.len());
    for (index, svg) in pages.iter().enumerate() {
        kids.push(write_page(&mut pdf, &mut ids, page_tree, index + 1, svg, &options)?);
    }
    pdf.catalog(catalog).pages(page_tree);
    let count = i32::try_from(kids.len()).map_err(|_| PdfError::Conversion {
        page: kids.len(),
        detail: "too many pages".to_owned(),
    })?;
    pdf.pages(page_tree).kids(kids).count(count);
    Ok(pdf.finish())
}

/// Converts one SVG to a drawing (a form `XObject`, from svg2pdf) and writes a page that shows it.
fn write_page(
    pdf: &mut Pdf,
    ids: &mut Ref,
    page_tree: Ref,
    page: usize,
    svg: &str,
    options: &usvg::Options,
) -> Result<Ref, PdfError> {
    if options.fontdb.is_empty() && svg.contains("<text") {
        return Err(PdfError::NoFonts { page });
    }
    let tree = usvg::Tree::from_str(svg, options).map_err(|error| PdfError::InvalidSvg {
        page,
        detail: error.to_string(),
    })?;
    let (chunk, drawing) =
        svg2pdf::to_chunk(&tree, ConversionOptions::default()).map_err(|error| PdfError::Conversion {
            page,
            detail: error.to_string(),
        })?;
    // The drawing's objects are numbered after those already written.
    let mut renumbered = HashMap::new();
    let chunk = chunk.renumber(|old| *renumbered.entry(old).or_insert_with(|| ids.bump()));
    let drawing = *renumbered.get(&drawing).ok_or_else(|| PdfError::Conversion {
        page,
        detail: "the drawing is missing from its own objects".to_owned(),
    })?;
    pdf.extend(&chunk);

    // svg2pdf's drawing is one point square: scaled to the page.
    let width = tree.size().width() * POINTS_PER_PIXEL;
    let height = tree.size().height() * POINTS_PER_PIXEL;
    let content_id = ids.bump();
    let mut content = Content::new();
    content.transform([width, 0.0, 0.0, height, 0.0, 0.0]).x_object(DRAWING);
    pdf.stream(content_id, &content.finish());

    let page_id = ids.bump();
    let mut writer = pdf.page(page_id);
    writer.media_box(Rect::new(0.0, 0.0, width, height));
    writer.parent(page_tree);
    writer.contents(content_id);
    writer.resources().x_objects().pair(DRAWING, drawing);
    writer.finish();
    Ok(page_id)
}
