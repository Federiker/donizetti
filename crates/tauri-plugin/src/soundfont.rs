use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

use donizetti_soundfonts::{InstalledSoundfont, Installer, MUSESCORE_GENERAL, Soundfont, SoundfontError};
use serde::Serialize;

use crate::error::Error;

/// How often the download reports its progress: every 256 KiB, and when it is complete.
const PROGRESS_STEP: u64 = 256 * 1024;

/// How much of the soundfont has arrived.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundfontProgress {
    pub received: u64,
    pub total: u64,
}

/// The soundfont on offer, whether it is installed (where, and its size) and whether it is being
/// downloaded now.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundfontStatus {
    pub soundfont: Soundfont,
    pub installed: Option<InstalledSoundfont>,
    pub installing: bool,
}

/// The soundfont the plugin plays with, in the folder the app chose, and the one download that may be
/// running.
pub struct Soundfonts {
    installer: Installer,
    installing: AtomicBool,
    cancel: AtomicBool,
}

/// Marks a download as running until it is dropped.
pub(crate) struct Running<'a>(&'a AtomicBool);

impl Drop for Running<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl Soundfonts {
    /// MuseScore General, kept in `folder`.
    #[must_use]
    pub const fn new(folder: PathBuf) -> Self {
        Self::with_soundfont(folder, MUSESCORE_GENERAL)
    }

    /// Another pinned soundfont, kept in `folder`.
    #[must_use]
    pub const fn with_soundfont(folder: PathBuf, soundfont: Soundfont) -> Self {
        Self {
            installer: Installer::new(folder, soundfont),
            installing: AtomicBool::new(false),
            cancel: AtomicBool::new(false),
        }
    }

    /// The folder the soundfont is kept in.
    #[must_use]
    pub fn folder(&self) -> &Path {
        self.installer.root()
    }

    #[must_use]
    pub fn status(&self) -> SoundfontStatus {
        SoundfontStatus {
            soundfont: self.installer.soundfont().clone(),
            installed: self.installer.installed(),
            installing: self.installing.load(Ordering::Acquire),
        }
    }

    /// The status once the work in hand is done (while its `Running` guard is still held).
    fn finished(&self) -> SoundfontStatus {
        SoundfontStatus {
            installing: false,
            ..self.status()
        }
    }

    /// Whether the running download has been asked to stop.
    #[cfg(test)]
    pub(crate) fn cancel_requested(&self) -> bool {
        self.cancel.load(Ordering::Acquire)
    }

    pub(crate) fn begin(&self) -> Result<Running<'_>, Error> {
        self.installing
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| SoundfontError::Busy)?;
        Ok(Running(&self.installing))
    }

    /// Downloads, checks and installs the soundfont, unless it is installed already. `progress`
    /// receives how much has arrived: at the start, every 256 KiB and at the end.
    ///
    /// # Errors
    /// Returns the soundfont's `Busy` while another download runs, else its download errors
    /// (`Cancelled`, `Download`, `Verification`, `Storage`); nothing is installed then.
    pub fn install(&self, mut progress: impl FnMut(SoundfontProgress)) -> Result<SoundfontStatus, Error> {
        let _running = self.begin()?;
        if self.installer.installed().is_some() {
            return Ok(self.finished());
        }
        self.cancel.store(false, Ordering::Release);
        let total = self.installer.soundfont().bytes;
        progress(SoundfontProgress { received: 0, total });
        let mut reported = 0;
        self.installer.install(&self.cancel, |received| {
            if received - reported >= PROGRESS_STEP || received == total {
                reported = received;
                progress(SoundfontProgress { received, total });
            }
        })?;
        Ok(self.finished())
    }

    /// Stops the download that is running, if any; it then fails with `Cancelled`.
    pub fn cancel(&self) {
        if self.installing.load(Ordering::Acquire) {
            self.cancel.store(true, Ordering::Release);
        }
    }

    /// The installed soundfont's bytes.
    ///
    /// # Errors
    /// Returns the soundfont's `NotInstalled` or `Storage`.
    pub fn read(&self) -> Result<Vec<u8>, Error> {
        Ok(self.installer.read()?)
    }

    /// Removes the soundfont and its notice.
    ///
    /// # Errors
    /// Returns the soundfont's `Busy` while a download runs, or `Storage`.
    pub fn remove(&self) -> Result<SoundfontStatus, Error> {
        let _running = self.begin()?;
        self.installer.uninstall()?;
        Ok(self.finished())
    }
}
