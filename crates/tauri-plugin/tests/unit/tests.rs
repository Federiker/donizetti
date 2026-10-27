#[path = "commands.rs"]
mod commands;
#[path = "errors.rs"]
mod errors;
#[path = "files.rs"]
mod files;
#[path = "request.rs"]
mod request;
#[path = "soundfont.rs"]
mod soundfont;

use std::path::Path;

use donizetti_soundfonts::{MUSESCORE_GENERAL, Soundfont};

/// A soundfont pinned to made-up bytes, at an address that refuses connections.
fn pinned(bytes: &[u8]) -> Soundfont {
    use sha2::{Digest, Sha512};
    let sha512: &'static str = Box::leak(format!("{:x}", Sha512::digest(bytes)).into_boxed_str());
    Soundfont {
        url: "https://127.0.0.1:9/MuseScore_General.sf3",
        bytes: bytes.len() as u64,
        sha512,
        ..MUSESCORE_GENERAL
    }
}

/// The names in a folder, sorted: to check that no temporary file is left behind.
fn names(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// A page with a title and a staff line.
const PAGE: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <text x="20" y="30" font-size="16">Danny Boy</text>
  <path d="M 10 50 L 190 50" stroke="black"/>
</svg>"#;
