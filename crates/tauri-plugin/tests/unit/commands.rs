use std::fs;

use tauri::{
    App, Manager,
    async_runtime::block_on,
    ipc::{Channel, InvokeResponseBody, IpcResponse},
    test::{MockRuntime, mock_builder, mock_context, noop_assets},
};

use super::PAGE;
use crate::{Builder, MUSESCORE_GENERAL, Soundfonts, commands, hash};

fn app(plugin: tauri::plugin::TauriPlugin<MockRuntime>) -> App<MockRuntime> {
    mock_builder()
        .plugin(plugin)
        .build(mock_context(noop_assets()))
        .unwrap()
}

fn raw(response: tauri::ipc::Response) -> Vec<u8> {
    match response.body().unwrap() {
        InvokeResponseBody::Raw(bytes) => bytes,
        InvokeResponseBody::Json(json) => panic!("not raw: {json}"),
    }
}

/// The error of a command that answers a `Response` (which has no `Debug` for `unwrap_err`).
fn failure<T>(result: Result<T, crate::Error>) -> crate::Error {
    match result {
        Ok(_) => panic!("the command succeeded"),
        Err(error) => error,
    }
}

#[test]
fn the_score_commands_read_with_the_hash_first() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("song.musicxml");
    fs::write(&path, b"<score-partwise/>").unwrap();
    let response = raw(block_on(commands::read_score(path.clone())).unwrap());
    assert_eq!(&response[..64], hash(b"<score-partwise/>").as_bytes());
    assert_eq!(&response[64..], b"<score-partwise/>");

    let error = failure(block_on(commands::read_score(folder.path().join("missing.musicxml"))));
    assert_eq!(error.code(), "read_failed");
}

#[test]
fn the_pdf_command_writes_the_file() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("song.pdf");
    block_on(commands::export_pdf(vec![PAGE.to_owned()], path.clone())).unwrap();
    assert!(fs::read(&path).unwrap().starts_with(b"%PDF-"));
}

#[test]
fn the_soundfont_lives_in_the_folder_the_app_chose() {
    let folder = tempfile::tempdir().unwrap();
    let soundfonts = folder.path().join("fonts");
    let app = app(Builder::new().soundfont_dir(&soundfonts).build());
    let handle = app.handle().clone();

    let status = commands::soundfont_status(app.state::<Soundfonts>());
    assert_eq!(status.installed, None);
    let error = failure(block_on(commands::read_soundfont(handle.clone())));
    assert_eq!(error.code(), "soundfont_not_installed");
    commands::cancel_soundfont_install(app.state::<Soundfonts>());

    // A file of the pinned size counts as installed (the download checks the bytes), so nothing is
    // downloaded here.
    fs::create_dir_all(&soundfonts).unwrap();
    let file = fs::File::create(soundfonts.join("MuseScore_General.sf3")).unwrap();
    file.set_len(MUSESCORE_GENERAL.bytes).unwrap();
    drop(file);
    let channel = Channel::new(|_| panic!("nothing to download"));
    let status = block_on(commands::install_soundfont(handle.clone(), channel)).unwrap();
    let installed = status.installed.unwrap();
    assert!(installed.path.starts_with(&soundfonts));
    let bytes = raw(block_on(commands::read_soundfont(handle.clone())).unwrap());
    assert_eq!(bytes.len() as u64, MUSESCORE_GENERAL.bytes);

    let removed = block_on(commands::remove_soundfont(handle)).unwrap();
    assert_eq!(removed.installed, None);
    assert!(!installed.path.exists());
}

#[test]
fn by_default_the_soundfont_is_in_the_app_data_folder() {
    let app = app(crate::init());
    let soundfonts = app.state::<Soundfonts>();
    assert_eq!(
        soundfonts.folder(),
        app.path().app_data_dir().unwrap().join("soundfonts")
    );
    assert_eq!(soundfonts.status().soundfont, MUSESCORE_GENERAL);
}
