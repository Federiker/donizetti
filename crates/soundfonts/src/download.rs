use std::{
    fs::File,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use sha2::{Digest, Sha512};

use crate::{
    error::{DownloadFailure, SoundfontError},
    soundfont::Soundfont,
};

async fn cancelled(cancel: &AtomicBool) {
    while !cancel.load(Ordering::Relaxed) {
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// Downloads the pinned soundfont to `target` (which must not exist), checking its size and SHA-512 as
/// it arrives. Only its own HTTPS address is used; redirects are refused. `progress` receives the
/// number of bytes received so far after each chunk.
pub(crate) fn download(
    soundfont: &Soundfont,
    target: &Path,
    cancel: &AtomicBool,
    progress: impl FnMut(u64),
) -> Result<(), SoundfontError> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| SoundfontError::Download(DownloadFailure::Setup))?;
    runtime.block_on(async {
        tokio::select! {
            result = transfer(soundfont, target, progress) => result,
            () = cancelled(cancel) => Err(SoundfontError::Cancelled),
        }
    })
}

async fn transfer(soundfont: &Soundfont, target: &Path, mut progress: impl FnMut(u64)) -> Result<(), SoundfontError> {
    let client = reqwest::Client::builder()
        .https_only(true)
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .timeout(Duration::from_mins(30))
        .build()
        .map_err(|_| SoundfontError::Download(DownloadFailure::Setup))?;
    let mut response = client
        .get(soundfont.url)
        .send()
        .await
        .map_err(|_| SoundfontError::Download(DownloadFailure::Unreachable))?;
    if response.status() != reqwest::StatusCode::OK {
        return Err(SoundfontError::Download(DownloadFailure::Status(
            response.status().as_u16(),
        )));
    }
    let mut receiver = Receiver::create(soundfont, target, response.content_length())?;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| SoundfontError::Download(DownloadFailure::Interrupted))?
    {
        progress(receiver.accept(&chunk)?);
    }
    receiver.finish()
}

/// A download being written: each chunk is hashed and written as it arrives, and the whole must be
/// exactly the pinned file.
pub(crate) struct Receiver<'a> {
    soundfont: &'a Soundfont,
    path: PathBuf,
    output: File,
    hash: Sha512,
    received: u64,
}

impl<'a> Receiver<'a> {
    /// Starts a download into `target`, which must not exist yet. A length announced by the server
    /// that differs from the pinned size is refused before anything is written.
    pub(crate) fn create(soundfont: &'a Soundfont, target: &Path, length: Option<u64>) -> Result<Self, SoundfontError> {
        if length.is_some_and(|length| length != soundfont.bytes) {
            return Err(SoundfontError::Verification);
        }
        let output = File::options()
            .write(true)
            .create_new(true)
            .open(target)
            .map_err(|error| SoundfontError::storage(target, &error))?;
        Ok(Self {
            soundfont,
            path: target.to_path_buf(),
            output,
            hash: Sha512::new(),
            received: 0,
        })
    }

    /// Writes the next chunk; returns the number of bytes received so far.
    pub(crate) fn accept(&mut self, chunk: &[u8]) -> Result<u64, SoundfontError> {
        self.received += chunk.len() as u64;
        if self.received > self.soundfont.bytes {
            return Err(SoundfontError::Verification);
        }
        self.hash.update(chunk);
        self.output
            .write_all(chunk)
            .map_err(|error| SoundfontError::storage(&self.path, &error))?;
        Ok(self.received)
    }

    /// Flushes the file to the disk and checks the whole download against the pin.
    pub(crate) fn finish(self) -> Result<(), SoundfontError> {
        self.output
            .sync_all()
            .map_err(|error| SoundfontError::storage(&self.path, &error))?;
        if self.received != self.soundfont.bytes || hex(&self.hash.finalize()) != self.soundfont.sha512 {
            return Err(SoundfontError::Verification);
        }
        Ok(())
    }
}

/// Lower-case hexadecimal, as the pins are written.
pub(crate) fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

/// Checks a file already on disk against the pinned size and checksum.
pub(crate) fn verify_file(soundfont: &Soundfont, path: &Path) -> Result<(), SoundfontError> {
    let mut file = File::open(path).map_err(|error| SoundfontError::storage(path, &error))?;
    let mut hash = Sha512::new();
    let size = std::io::copy(&mut file, &mut hash).map_err(|error| SoundfontError::storage(path, &error))?;
    if size != soundfont.bytes || hex(&hash.finalize()) != soundfont.sha512 {
        return Err(SoundfontError::Verification);
    }
    Ok(())
}
