use std::{
    fs,
    io::{self, Write},
    path::Path,
};

use sha2::{Digest, Sha256};
use tempfile::NamedTempFile;

use crate::error::Error;

/// The SHA-256 of a file's bytes, in lower-case hexadecimal (64 characters): what a save quotes to
/// show it still has the file it read.
#[must_use]
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

/// A score's bytes, as they are on disk, and their hash.
///
/// # Errors
/// Returns `ReadFailed` when the file cannot be read.
pub fn read_score(path: &Path) -> Result<(Vec<u8>, String), Error> {
    let bytes = fs::read(path).map_err(|error| Error::read_failed(path, &error))?;
    let hash = hash(&bytes);
    Ok((bytes, hash))
}

/// The file's bytes now; a file that is not there counts as empty.
fn current_bytes(path: &Path) -> Result<Vec<u8>, Error> {
    match fs::read(path) {
        Ok(bytes) => Ok(bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(Error::read_failed(path, &error)),
    }
}

/// Fails with `ChangedOnDisk` unless the file is still the one whose hash the app quoted.
fn check_unchanged(path: &Path, expected: &str) -> Result<(), Error> {
    let actual = hash(&current_bytes(path)?);
    if actual == expected {
        Ok(())
    } else {
        Err(Error::ChangedOnDisk {
            path: path.to_path_buf(),
            expected: expected.to_owned(),
            actual,
        })
    }
}

/// Writes a score and returns its new hash. The bytes go to a temporary file in the same folder, which
/// then replaces the score in one rename, so the file on disk is always either the old score or the
/// new one, never half of each.
///
/// With `expected_hash` (the hash [`read_score`] gave), the file must still be the one the app read:
/// it is checked before writing and again just before the rename, and if another program changed it
/// in between nothing is written (`ChangedOnDisk`). A file that is no longer there counts as empty.
/// Without it, the file is written whatever is there (a new file, or Save As).
///
/// # Errors
/// Returns `ChangedOnDisk`, `ReadFailed` (the file could not be checked) or `WriteFailed`; the file
/// is as it was after any of them.
pub fn write_score(path: &Path, bytes: &[u8], expected_hash: Option<&str>) -> Result<String, Error> {
    if let Some(expected) = expected_hash {
        check_unchanged(path, expected)?;
    }
    write_atomically(path, bytes, || {
        expected_hash.map_or(Ok(()), |expected| check_unchanged(path, expected))
    })?;
    Ok(hash(bytes))
}

/// Writes `bytes` to a temporary file beside `path`, calls `check`, then renames the temporary file
/// over `path`. The temporary file is removed if anything fails.
pub(crate) fn write_atomically(
    path: &Path,
    bytes: &[u8],
    check: impl FnOnce() -> Result<(), Error>,
) -> Result<(), Error> {
    let folder = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    let name = path
        .file_name()
        .map_or_else(Default::default, |name| name.to_string_lossy());
    let failed = |error: &io::Error| Error::write_failed(path, error);
    let prefix = format!(".{name}.");
    let mut builder = tempfile::Builder::new();
    builder.prefix(&prefix).suffix(".tmp");
    // Readable as an ordinary new file is (the umask applies), not only by its owner.
    #[cfg(unix)]
    builder.permissions(std::os::unix::fs::PermissionsExt::from_mode(0o666));
    let mut temporary: NamedTempFile = builder.tempfile_in(folder).map_err(|error| failed(&error))?;
    temporary.write_all(bytes).map_err(|error| failed(&error))?;
    temporary.as_file().sync_all().map_err(|error| failed(&error))?;
    // A file being replaced keeps its permissions. (Windows has only the read-only flag, and a read-only
    // file is refused by the rename anyway.)
    #[cfg(unix)]
    if let Ok(metadata) = fs::metadata(path) {
        fs::set_permissions(temporary.path(), metadata.permissions()).map_err(|error| failed(&error))?;
    }
    check()?;
    temporary.persist(path).map_err(|error| failed(&error.error))?;
    Ok(())
}
