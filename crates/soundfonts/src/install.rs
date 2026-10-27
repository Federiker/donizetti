use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
};

use serde::Serialize;

use crate::{
    download::{download, verify_file},
    error::SoundfontError,
    soundfont::Soundfont,
};

/// The installed soundfont: where it is, where its notice is, and its size.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSoundfont {
    pub path: PathBuf,
    pub notice_path: PathBuf,
    pub bytes: u64,
}

/// Where a downloaded soundfont lives (a folder the host chooses, usually in its own data), and how
/// it gets there. The soundfont is downloaded beside its final name, checked, then renamed into place
/// with its notice, so a failed or cancelled download never leaves a half file behind.
pub struct Installer {
    root: PathBuf,
    soundfont: Soundfont,
}

impl Installer {
    /// An installer for `soundfont` in the folder `root`, which is created on the first install.
    #[must_use]
    pub const fn new(root: PathBuf, soundfont: Soundfont) -> Self {
        Self { root, soundfont }
    }

    #[must_use]
    pub const fn soundfont(&self) -> &Soundfont {
        &self.soundfont
    }

    /// The folder the soundfont is installed in.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Where the soundfont is, once installed.
    #[must_use]
    pub fn path(&self) -> PathBuf {
        self.root.join(self.soundfont.file_name)
    }

    /// Where its notice is, once installed: the acknowledgements and licence that must accompany it.
    #[must_use]
    pub fn notice_path(&self) -> PathBuf {
        self.root.join(format!("{}.LICENSE.md", self.soundfont.file_name))
    }

    fn staged_path(&self) -> PathBuf {
        self.root.join(format!("{}.part", self.soundfont.file_name))
    }

    /// The installed soundfont, if its file is there with the expected size.
    #[must_use]
    pub fn installed(&self) -> Option<InstalledSoundfont> {
        let metadata = fs::metadata(self.path()).ok()?;
        (metadata.is_file() && metadata.len() == self.soundfont.bytes).then(|| InstalledSoundfont {
            path: self.path(),
            notice_path: self.notice_path(),
            bytes: self.soundfont.bytes,
        })
    }

    /// Downloads, checks and installs the soundfont with its notice. `progress` receives the number
    /// of bytes received so far; setting `cancel` stops the download.
    ///
    /// # Errors
    /// Returns `Cancelled`, `Download`, `Verification` or `Storage`; nothing is installed then.
    pub fn install(
        &self,
        cancel: &AtomicBool,
        progress: impl FnMut(u64),
    ) -> Result<InstalledSoundfont, SoundfontError> {
        let staged = self.stage()?;
        let result = download(&self.soundfont, &staged, cancel, progress);
        self.finish(&staged, result)
    }

    /// Installs the soundfont from a file already on the computer, after checking it is exactly the
    /// pinned one.
    ///
    /// # Errors
    /// Returns `Verification` for any other file, or `Storage`.
    pub fn install_from_file(&self, source: &Path) -> Result<InstalledSoundfont, SoundfontError> {
        verify_file(&self.soundfont, source)?;
        let staged = self.stage()?;
        let result = fs::copy(source, &staged)
            .map(|_| ())
            .map_err(|error| SoundfontError::storage(&staged, &error));
        self.finish(&staged, result)
    }

    fn stage(&self) -> Result<PathBuf, SoundfontError> {
        fs::create_dir_all(&self.root).map_err(|error| SoundfontError::storage(&self.root, &error))?;
        let staged = self.staged_path();
        remove_if_present(&staged)?;
        Ok(staged)
    }

    fn finish(&self, staged: &Path, result: Result<(), SoundfontError>) -> Result<InstalledSoundfont, SoundfontError> {
        if let Err(error) = result.and_then(|()| {
            let notice = self.notice_path();
            fs::write(&notice, self.soundfont.notice).map_err(|error| SoundfontError::storage(&notice, &error))?;
            fs::rename(staged, self.path()).map_err(|error| SoundfontError::storage(self.path(), &error))
        }) {
            let _ = fs::remove_file(staged);
            return Err(error);
        }
        self.installed().ok_or_else(|| SoundfontError::Storage {
            path: self.path(),
            detail: "the installed file is not where it should be".to_owned(),
        })
    }

    /// The installed soundfont's bytes, for the player.
    ///
    /// # Errors
    /// Returns `NotInstalled` or `Storage`.
    pub fn read(&self) -> Result<Vec<u8>, SoundfontError> {
        if self.installed().is_none() {
            return Err(SoundfontError::NotInstalled);
        }
        let path = self.path();
        fs::read(&path).map_err(|error| SoundfontError::storage(&path, &error))
    }

    /// Removes the soundfont, its notice and any half download; nothing to remove is fine.
    ///
    /// # Errors
    /// Returns `Storage` when a file could not be removed.
    pub fn uninstall(&self) -> Result<(), SoundfontError> {
        for path in [self.path(), self.notice_path(), self.staged_path()] {
            remove_if_present(&path)?;
        }
        Ok(())
    }
}

fn remove_if_present(path: &Path) -> Result<(), SoundfontError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(SoundfontError::storage(path, &error)),
    }
}
