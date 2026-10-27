use std::{fmt, path::PathBuf};

use donizetti_pdf::PdfError;
use donizetti_soundfonts::SoundfontError;
use serde::{Serialize, Serializer, ser::SerializeMap};

/// What a command could not do. It reaches the app as `{ code, params }`: a stable code for the app to
/// translate and the values its message needs (`detail` is the operating system's own words, for logs).
#[derive(Debug)]
pub enum Error {
    /// The score could not be read.
    ReadFailed {
        path: PathBuf,
        detail: String,
    },
    /// The score or PDF could not be written; the file on disk is as it was.
    WriteFailed {
        path: PathBuf,
        detail: String,
    },
    /// The file changed on disk since the app read it (its hash is not the one the app quoted); nothing
    /// was written.
    ChangedOnDisk {
        path: PathBuf,
        expected: String,
        actual: String,
    },
    /// The command's arguments could not be understood.
    InvalidRequest {
        detail: String,
    },
    /// The work could not be finished (its thread stopped).
    Internal {
        detail: String,
    },
    Soundfont(SoundfontError),
    Pdf(PdfError),
}

impl Error {
    pub(crate) fn read_failed(path: impl Into<PathBuf>, error: &impl fmt::Display) -> Self {
        Self::ReadFailed {
            path: path.into(),
            detail: error.to_string(),
        }
    }

    pub(crate) fn write_failed(path: impl Into<PathBuf>, error: &impl fmt::Display) -> Self {
        Self::WriteFailed {
            path: path.into(),
            detail: error.to_string(),
        }
    }

    pub(crate) fn invalid_request(detail: impl Into<String>) -> Self {
        Self::InvalidRequest { detail: detail.into() }
    }

    /// Stable code for the app to translate.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::ReadFailed { .. } => "read_failed",
            Self::WriteFailed { .. } => "write_failed",
            Self::ChangedOnDisk { .. } => "changed_on_disk",
            Self::InvalidRequest { .. } => "invalid_request",
            Self::Internal { .. } => "internal",
            Self::Soundfont(error) => error.code(),
            Self::Pdf(error) => error.code(),
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ReadFailed { path, detail } => write!(f, "{} could not be read: {detail}.", path.display()),
            Self::WriteFailed { path, detail } => write!(f, "{} could not be written: {detail}.", path.display()),
            Self::ChangedOnDisk { path, .. } => write!(
                f,
                "{} changed on disk since it was read; nothing was written.",
                path.display()
            ),
            Self::InvalidRequest { detail } => write!(f, "The request could not be understood: {detail}."),
            Self::Internal { detail } => write!(f, "The work could not be finished: {detail}."),
            Self::Soundfont(error) => error.fmt(f),
            Self::Pdf(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Soundfont(error) => Some(error),
            Self::Pdf(error) => Some(error),
            _ => None,
        }
    }
}

impl From<SoundfontError> for Error {
    fn from(error: SoundfontError) -> Self {
        Self::Soundfont(error)
    }
}

impl From<PdfError> for Error {
    fn from(error: PdfError) -> Self {
        Self::Pdf(error)
    }
}

/// The parameters of one of the plugin's own errors.
struct Params<'a>(&'a Error);

impl Serialize for Params<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.0 {
            Error::ReadFailed { path, detail } | Error::WriteFailed { path, detail } => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("path", &path.to_string_lossy())?;
                map.serialize_entry("detail", detail)?;
                map.end()
            }
            Error::ChangedOnDisk { path, expected, actual } => {
                let mut map = serializer.serialize_map(Some(3))?;
                map.serialize_entry("path", &path.to_string_lossy())?;
                map.serialize_entry("expectedHash", expected)?;
                map.serialize_entry("actualHash", actual)?;
                map.end()
            }
            Error::InvalidRequest { detail } | Error::Internal { detail } => {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("detail", detail)?;
                map.end()
            }
            Error::Soundfont(_) | Error::Pdf(_) => serializer.serialize_map(Some(0))?.end(),
        }
    }
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Soundfont(error) => error.serialize(serializer),
            Self::Pdf(error) => error.serialize(serializer),
            _ => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("code", self.code())?;
                map.serialize_entry("params", &Params(self))?;
                map.end()
            }
        }
    }
}
