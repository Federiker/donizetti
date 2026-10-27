//! The commands, `plugin:donizetti|<name>` from the app: each passes its arguments to a function of
//! the crate, on a blocking thread when it touches the disk or the network.

use std::path::PathBuf;

use tauri::{
    AppHandle, Manager, Runtime, State,
    ipc::{Channel, Request, Response},
};

use crate::{
    error::Error,
    export, files,
    request::{export_write, score_response, score_write},
    soundfont::{SoundfontProgress, SoundfontStatus, Soundfonts},
};

/// Runs file or network work off the async runtime's threads.
pub(crate) async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, Error> + Send + 'static,
) -> Result<T, Error> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| Error::Internal {
            detail: error.to_string(),
        })?
}

/// The score's hash (64 hexadecimal characters) followed by its bytes, as one binary answer.
#[tauri::command]
pub async fn read_score(path: PathBuf) -> Result<Response, Error> {
    blocking(move || {
        let (bytes, hash) = files::read_score(&path)?;
        Ok(Response::new(score_response(&bytes, &hash)))
    })
    .await
}

/// Writes the score sent as the raw body (path and expected hash in headers); answers its new hash.
#[tauri::command]
pub async fn write_score(request: Request<'_>) -> Result<String, Error> {
    let write = score_write(request.body(), request.headers())?;
    blocking(move || files::write_score(&write.path, &write.bytes, write.expected_hash.as_deref())).await
}

#[tauri::command]
#[expect(clippy::needless_pass_by_value, reason = "Tauri passes the state by value")]
pub fn soundfont_status(soundfonts: State<'_, Soundfonts>) -> SoundfontStatus {
    soundfonts.status()
}

/// Downloads and installs the soundfont, reporting its progress on `on_progress`.
#[tauri::command]
pub async fn install_soundfont<R: Runtime>(
    app: AppHandle<R>,
    on_progress: Channel<SoundfontProgress>,
) -> Result<SoundfontStatus, Error> {
    blocking(move || {
        app.state::<Soundfonts>().install(|progress| {
            // A window that stopped listening does not stop the download.
            let _ = on_progress.send(progress);
        })
    })
    .await
}

#[tauri::command]
#[expect(clippy::needless_pass_by_value, reason = "Tauri passes the state by value")]
pub fn cancel_soundfont_install(soundfonts: State<'_, Soundfonts>) {
    soundfonts.cancel();
}

/// The installed soundfont's bytes, as a binary answer.
#[tauri::command]
pub async fn read_soundfont<R: Runtime>(app: AppHandle<R>) -> Result<Response, Error> {
    blocking(move || app.state::<Soundfonts>().read().map(Response::new)).await
}

#[tauri::command]
pub async fn remove_soundfont<R: Runtime>(app: AppHandle<R>) -> Result<SoundfontStatus, Error> {
    blocking(move || app.state::<Soundfonts>().remove()).await
}

#[tauri::command]
pub async fn export_pdf(pages: Vec<String>, path: PathBuf) -> Result<(), Error> {
    blocking(move || export::export_pdf(&pages, &path)).await
}

/// Writes an export sent as the raw body (the path in a header), with no hash guard.
#[tauri::command]
pub async fn write_export(request: Request<'_>) -> Result<(), Error> {
    let write = export_write(request.body(), request.headers())?;
    blocking(move || export::write_export(&write.path, &write.bytes)).await
}
