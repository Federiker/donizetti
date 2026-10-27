mod commands;
mod error;
mod export;
mod files;
mod plugin;
mod request;
mod soundfont;

pub use donizetti_pdf::PdfError;
pub use donizetti_soundfonts::{InstalledSoundfont, MUSESCORE_GENERAL, Soundfont, SoundfontError};
pub use error::Error;
pub use export::export_pdf;
pub use files::{hash, read_score, write_score};
pub use plugin::{Builder, init};
pub use soundfont::{SoundfontProgress, SoundfontStatus, Soundfonts};

#[cfg(test)]
#[path = "../tests/unit/tests.rs"]
mod tests;
