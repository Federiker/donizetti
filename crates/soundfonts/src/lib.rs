mod download;
mod error;
mod install;
mod soundfont;

pub use error::{DownloadFailure, SoundfontError};
pub use install::{InstalledSoundfont, Installer};
pub use soundfont::{MUSESCORE_GENERAL, Soundfont};

#[cfg(test)]
#[path = "../tests/unit/tests.rs"]
mod tests;
