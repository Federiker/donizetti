use std::sync::{Arc, LazyLock};

use svg2pdf::usvg::fontdb::{Database, Family, Query};

/// Families tried, in order, for the generic serif and sans-serif families when the computer lacks
/// fontdb's defaults (Times New Roman and Arial): Linux's and macOS's usual fonts.
const SERIF: [&str; 5] = [
    "Times New Roman",
    "Liberation Serif",
    "DejaVu Serif",
    "Noto Serif",
    "Times",
];
const SANS_SERIF: [&str; 6] = [
    "Arial",
    "Liberation Sans",
    "DejaVu Sans",
    "Noto Sans",
    "Helvetica",
    "Cantarell",
];

static SYSTEM_FONTS: LazyLock<Arc<Database>> = LazyLock::new(|| {
    let mut fonts = Database::new();
    fonts.load_system_fonts();
    choose_generic_families(&mut fonts);
    Arc::new(fonts)
});

/// The computer's fonts, read once and shared: what OpenSheetMusicDisplay's titles, lyrics and chord
/// symbols are drawn with. The generic families (serif, sans-serif) are pointed at fonts that are
/// there, so text in a family the computer lacks falls back to one it has.
#[must_use]
pub fn system_fonts() -> Arc<Database> {
    Arc::clone(&SYSTEM_FONTS)
}

fn has_family(fonts: &Database, name: &str) -> bool {
    fonts
        .query(&Query {
            families: &[Family::Name(name)],
            ..Query::default()
        })
        .is_some()
}

/// The first of `candidates` the database has, else the first family of any font in it.
fn available_family(fonts: &Database, candidates: &[&str]) -> Option<String> {
    candidates
        .iter()
        .find(|name| has_family(fonts, name))
        .map(|name| (*name).to_owned())
        .or_else(|| {
            fonts
                .faces()
                .find_map(|face| face.families.first().map(|(name, _)| name.clone()))
        })
}

/// Points the generic serif and sans-serif families at fonts the database has (usvg falls back to
/// serif for any family it cannot find). A database without fonts is left as it is.
pub(crate) fn choose_generic_families(fonts: &mut Database) {
    if let Some(serif) = available_family(fonts, &SERIF) {
        fonts.set_serif_family(serif);
    }
    if let Some(sans_serif) = available_family(fonts, &SANS_SERIF) {
        fonts.set_sans_serif_family(sans_serif);
    }
}
