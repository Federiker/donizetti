use std::{fmt, path::PathBuf};

use serde::{Serialize, Serializer, ser::SerializeMap};

/// Why a download did not arrive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadFailure {
    /// No HTTPS client could be set up on this computer.
    Setup,
    /// The server could not be reached.
    Unreachable,
    /// The server answered with something other than the file (an HTTP status other than 200).
    Status(u16),
    /// The connection broke off before the whole file had arrived.
    Interrupted,
}

impl DownloadFailure {
    const fn reason(self) -> &'static str {
        match self {
            Self::Setup => "setup",
            Self::Unreachable => "unreachable",
            Self::Status(_) => "status",
            Self::Interrupted => "interrupted",
        }
    }
}

/// Why a soundfont could not be installed, read or removed. Nothing is installed after a failure.
///
/// It serialises as `{ code, params }`: a stable code for the host to translate, and the values its
/// message needs (never English text of ours; `detail` is the operating system's own words, for logs).
#[derive(Debug)]
pub enum SoundfontError {
    /// Another installation is already running.
    Busy,
    /// The download was cancelled.
    Cancelled,
    /// The server could not be reached, or answered unexpectedly.
    Download(DownloadFailure),
    /// The file does not match the pinned size or checksum.
    Verification,
    /// No soundfont is installed.
    NotInstalled,
    /// A soundfont file could not be written, read or removed.
    Storage { path: PathBuf, detail: String },
}

impl SoundfontError {
    pub(crate) fn storage(path: impl Into<PathBuf>, error: &impl fmt::Display) -> Self {
        Self::Storage {
            path: path.into(),
            detail: error.to_string(),
        }
    }

    /// Stable code for the host to translate.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Busy => "soundfont_busy",
            Self::Cancelled => "soundfont_cancelled",
            Self::Download(_) => "soundfont_download_failed",
            Self::Verification => "soundfont_verification_failed",
            Self::NotInstalled => "soundfont_not_installed",
            Self::Storage { .. } => "soundfont_storage_failed",
        }
    }
}

impl fmt::Display for SoundfontError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Busy => f.write_str("Another soundfont download is running."),
            Self::Cancelled => f.write_str("The download was cancelled."),
            Self::Download(DownloadFailure::Status(status)) => {
                write!(f, "The soundfont could not be downloaded: the server answered {status}.")
            }
            Self::Download(failure) => write!(f, "The soundfont could not be downloaded ({}).", failure.reason()),
            Self::Verification => f.write_str(
                "The downloaded file is not the expected soundfont (its size or checksum differs); it was not installed.",
            ),
            Self::NotInstalled => f.write_str("No soundfont is installed."),
            Self::Storage { path, detail } => {
                write!(f, "The soundfont file {} could not be stored: {detail}.", path.display())
            }
        }
    }
}

impl std::error::Error for SoundfontError {}

/// The parameters of an error, as a map serialised in a fixed order.
struct Params<'a>(&'a SoundfontError);

impl Serialize for Params<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.0 {
            SoundfontError::Download(failure) => {
                let status = match failure {
                    DownloadFailure::Status(status) => Some(*status),
                    _ => None,
                };
                let mut map = serializer.serialize_map(Some(1 + usize::from(status.is_some())))?;
                map.serialize_entry("reason", failure.reason())?;
                if let Some(status) = status {
                    map.serialize_entry("status", &status)?;
                }
                map.end()
            }
            SoundfontError::Storage { path, detail } => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("path", &path.to_string_lossy())?;
                map.serialize_entry("detail", detail)?;
                map.end()
            }
            _ => serializer.serialize_map(Some(0))?.end(),
        }
    }
}

impl Serialize for SoundfontError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("code", self.code())?;
        map.serialize_entry("params", &Params(self))?;
        map.end()
    }
}
