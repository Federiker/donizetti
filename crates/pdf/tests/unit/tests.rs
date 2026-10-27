use std::sync::Arc;

use crate::{
    PdfError, fontdb::Database, fonts::choose_generic_families, svg_pages_to_pdf, svg_pages_to_pdf_with_fonts,
    system_fonts,
};

/// A page as OpenSheetMusicDisplay draws one: a size in pixels, a title in a font the computer may
/// lack, a lyric in a generic family and a staff line as a path.
const PAGE_WITH_TEXT: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <text x="20" y="30" font-family="Times New Roman" font-size="16">Danny Boy</text>
  <text x="20" y="80" font-family="sans-serif" font-size="10">Oh, Dan-ny boy</text>
  <path d="M 10 50 L 190 50" stroke="black" stroke-width="1"/>
</svg>"#;

const PAGE_WITHOUT_TEXT: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
  <path d="M 10 50 L 190 50" stroke="black" stroke-width="1"/>
</svg>"#;

fn contains(haystack: &[u8], needle: &str) -> bool {
    haystack.windows(needle.len()).any(|window| window == needle.as_bytes())
}

fn pages(svgs: &[&str]) -> Vec<String> {
    svgs.iter().map(|svg| (*svg).to_owned()).collect()
}

#[test]
fn each_svg_is_a_page_of_its_size_in_points() {
    let pdf = svg_pages_to_pdf(&pages(&[PAGE_WITH_TEXT, PAGE_WITHOUT_TEXT])).unwrap();
    assert!(pdf.starts_with(b"%PDF-"));
    assert!(contains(&pdf, "/Count 2"), "two pages");
    // 200 × 100 px and 400 × 300 px at 96 to the inch.
    assert!(contains(&pdf, "/MediaBox [0 0 150 75]"));
    assert!(contains(&pdf, "/MediaBox [0 0 300 225]"));
}

#[test]
fn text_is_drawn_with_an_embedded_font() {
    let with_text = svg_pages_to_pdf(&pages(&[PAGE_WITH_TEXT])).unwrap();
    assert!(contains(&with_text, "/FontDescriptor"), "the text's font is embedded");
    assert!(
        contains(&with_text, "/ToUnicode"),
        "the text can be selected and searched"
    );
    let without_text = svg_pages_to_pdf(&pages(&[PAGE_WITHOUT_TEXT])).unwrap();
    assert!(!contains(&without_text, "/FontDescriptor"));
}

#[test]
fn the_system_fonts_are_read_once() {
    assert!(!system_fonts().is_empty(), "the computer has fonts");
    assert!(Arc::ptr_eq(&system_fonts(), &system_fonts()));
}

#[test]
fn the_generic_families_point_at_fonts_that_are_there() {
    let mut fonts = (*system_fonts()).clone();
    choose_generic_families(&mut fonts);
    let query = |family| {
        fonts.query(&crate::fontdb::Query {
            families: &[family],
            ..crate::fontdb::Query::default()
        })
    };
    assert!(query(crate::fontdb::Family::Serif).is_some());
    assert!(query(crate::fontdb::Family::SansSerif).is_some());

    let mut empty = Database::new();
    choose_generic_families(&mut empty);
    assert!(empty.is_empty());
}

#[test]
fn text_without_fonts_is_refused_rather_than_left_out() {
    let empty = Arc::new(Database::new());
    assert_eq!(
        svg_pages_to_pdf_with_fonts(&pages(&[PAGE_WITHOUT_TEXT, PAGE_WITH_TEXT]), Arc::clone(&empty)),
        Err(PdfError::NoFonts { page: 2 })
    );
    assert!(svg_pages_to_pdf_with_fonts(&pages(&[PAGE_WITHOUT_TEXT]), empty).is_ok());
}

#[test]
fn no_pages_and_unreadable_pages_are_errors() {
    assert_eq!(svg_pages_to_pdf(&[]), Err(PdfError::NoPages));
    let error = svg_pages_to_pdf(&pages(&[PAGE_WITHOUT_TEXT, "not an image"])).unwrap_err();
    assert!(matches!(error, PdfError::InvalidSvg { page: 2, .. }), "{error:?}");
    let empty_size = r#"<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"/>"#;
    assert!(matches!(
        svg_pages_to_pdf(&pages(&[empty_size])),
        Err(PdfError::InvalidSvg { page: 1, .. })
    ));
}

#[test]
fn errors_serialise_as_codes_with_their_parameters() {
    let json = |error: &PdfError| serde_json::to_value(error).unwrap();
    assert_eq!(
        json(&PdfError::NoPages),
        serde_json::json!({ "code": "pdf_no_pages", "params": {} })
    );
    assert_eq!(
        json(&PdfError::NoFonts { page: 3 }),
        serde_json::json!({ "code": "pdf_no_fonts", "params": { "page": 3 } })
    );
    assert_eq!(
        json(&PdfError::InvalidSvg {
            page: 1,
            detail: "bad".to_owned()
        }),
        serde_json::json!({ "code": "pdf_invalid_svg", "params": { "page": 1, "detail": "bad" } })
    );
    assert_eq!(
        json(&PdfError::Conversion {
            page: 2,
            detail: "bad".to_owned()
        }),
        serde_json::json!({ "code": "pdf_conversion_failed", "params": { "page": 2, "detail": "bad" } })
    );
    for error in [
        PdfError::NoPages,
        PdfError::NoFonts { page: 1 },
        PdfError::InvalidSvg {
            page: 1,
            detail: "bad".to_owned(),
        },
        PdfError::Conversion {
            page: 1,
            detail: "bad".to_owned(),
        },
    ] {
        assert!(!error.to_string().is_empty());
    }
}
