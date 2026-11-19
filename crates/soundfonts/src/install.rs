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

/// The installed soundfont: where it is, where its notice is, its size, and whether it came with the
/// host (bundled in its installer) rather than downloaded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSoundfont {
    pub path: PathBuf,
    pub notice_path: PathBuf,
    pub bytes: u64,
    pub bundled: bool,
}

/// Where a downloaded soundfont lives (a folder the host chooses, usually in its own data), and how
/// it gets there. The soundfont is downloaded beside its final name, checked, then renamed into place
/// with its notice, so a failed or cancelled download never leaves a half file behind.
///
/// A host that ships the soundfont with itself names that folder too ([`Installer::with_bundled`]):
/// the bundled copy is then used first, and never removed.
pub struct Installer {
    root: PathBuf,
    bundled: Option<PathBuf>,
    soundfont: Soundfont,
}

impl Installer {
    /// An installer for `soundfont` in the folder `root`, which is created on the first install.
    #[must_use]
    pub const fn new(root: PathBuf, soundfont: Soundfont) -> Self {
        Self {
            root,
            bundled: None,
            soundfont,
        }
    }

    /// Also looks for the soundfont in `folder`, which the host ships it in (its resources, read
    /// only): the file under its pinned name and size, with its notice beside it
    /// (`<file name>.LICENSE.md`). Found there, it is used before any download.
    #[must_use]
    pub fn with_bundled(mut self, folder: PathBuf) -> Self {
        self.bundled = Some(folder);
        self
    }

    /// The folder the host ships the soundfont in, if it named one.
    #[must_use]
    pub fn bundled_root(&self) -> Option<&Path> {
        self.bundled.as_deref()
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

    /// Where the soundfont is, once downloaded.
    #[must_use]
    pub fn path(&self) -> PathBuf {
        self.root.join(self.soundfont.file_name)
    }

    /// Where its notice is, once downloaded: the acknowledgements and licence that must accompany it.
    #[must_use]
    pub fn notice_path(&self) -> PathBuf {
        self.root.join(notice_name(&self.soundfont))
    }

    fn staged_path(&self) -> PathBuf {
        self.root.join(format!("{}.part", self.soundfont.file_name))
    }

    /// The soundfont to use: the bundled one if there is one, else the downloaded one.
    #[must_use]
    pub fn installed(&self) -> Option<InstalledSoundfont> {
        self.bundled().or_else(|| self.downloaded())
    }

    /// The soundfont the host ships, if its file is in the bundled folder with the expected size and
    /// its notice beside it (a copy without its notice is not used: the notice must accompany it).
    #[must_use]
    pub fn bundled(&self) -> Option<InstalledSoundfont> {
        let folder = self.bundled.as_deref()?;
        let path = folder.join(self.soundfont.file_name);
        let notice_path = folder.join(notice_name(&self.soundfont));
        (has_size(&path, self.soundfont.bytes) && notice_path.is_file()).then_some(InstalledSoundfont {
            path,
            notice_path,
            bytes: self.soundfont.bytes,
            bundled: true,
        })
    }

    /// The downloaded soundfont, if its file is there with the expected size.
    #[must_use]
    pub fn downloaded(&self) -> Option<InstalledSoundfont> {
        has_size(&self.path(), self.soundfont.bytes).then(|| InstalledSoundfont {
            path: self.path(),
            notice_path: self.notice_path(),
            bytes: self.soundfont.bytes,
            bundled: false,
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
        self.downloaded().ok_or_else(|| SoundfontError::Storage {
            path: self.path(),
            detail: "the installed file is not where it should be".to_owned(),
        })
    }

    /// The bytes of the soundfont in use (the bundled one first), for the player.
    ///
    /// # Errors
    /// Returns `NotInstalled` or `Storage`.
    pub fn read(&self) -> Result<Vec<u8>, SoundfontError> {
        let path = self.installed().ok_or(SoundfontError::NotInstalled)?.path;
        fs::read(&path).map_err(|error| SoundfontError::storage(&path, &error))
    }

    /// Removes the downloaded soundfont, its notice and any half download; nothing to remove is fine.
    /// The bundled soundfont is the host's and stays, even when its folder is the download folder.
    ///
    /// # Errors
    /// Returns `Storage` when a file could not be removed.
    pub fn uninstall(&self) -> Result<(), SoundfontError> {
        let kept = self.bundled.as_ref().map(|folder| {
            [
                folder.join(self.soundfont.file_name),
                folder.join(notice_name(&self.soundfont)),
            ]
        });
        for path in [self.path(), self.notice_path(), self.staged_path()] {
            if !kept.as_ref().is_some_and(|kept| kept.contains(&path)) {
                remove_if_present(&path)?;
            }
        }
        Ok(())
    }
}

/// The notice's file name, beside the soundfont: `<file name>.LICENSE.md`.
fn notice_name(soundfont: &Soundfont) -> String {
    format!("{}.LICENSE.md", soundfont.file_name)
}

/// Whether `path` is a file of exactly `bytes`.
fn has_size(path: &Path, bytes: u64) -> bool {
    fs::metadata(path).is_ok_and(|metadata| metadata.is_file() && metadata.len() == bytes)
}

fn remove_if_present(path: &Path) -> Result<(), SoundfontError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(SoundfontError::storage(path, &error)),
    }
}
