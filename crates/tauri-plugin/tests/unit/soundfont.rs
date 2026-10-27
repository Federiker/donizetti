use std::fs;

use donizetti_soundfonts::{DownloadFailure, SoundfontError};

use super::pinned;
use crate::{Error, Soundfonts};

#[test]
fn the_status_says_what_is_on_offer_and_whether_it_is_installed() {
    let folder = tempfile::tempdir().unwrap();
    let soundfonts = Soundfonts::new(folder.path().join("soundfonts"));
    let status = soundfonts.status();
    assert_eq!(status.soundfont.name, "MuseScore General");
    assert_eq!(status.installed, None);
    assert!(!status.installing);
    let json = serde_json::to_value(&status).unwrap();
    assert_eq!(json["installed"], serde_json::Value::Null);
    assert_eq!(json["soundfont"]["bytes"], 39_900_972);
    assert_eq!(json["installing"], false);
}

#[test]
fn a_failed_download_installs_nothing_and_frees_the_installer() {
    let folder = tempfile::tempdir().unwrap();
    let soundfonts = Soundfonts::with_soundfont(folder.path().to_path_buf(), pinned(b"RIFF"));
    let mut reports = Vec::new();
    let error = soundfonts.install(|progress| reports.push(progress)).unwrap_err();
    assert!(matches!(
        error,
        Error::Soundfont(SoundfontError::Download(DownloadFailure::Unreachable))
    ));
    assert_eq!(reports.len(), 1, "the start is reported");
    assert_eq!((reports[0].received, reports[0].total), (0, 4));
    assert!(!soundfonts.status().installing);
    assert_eq!(soundfonts.read().unwrap_err().code(), "soundfont_not_installed");
}

#[test]
fn an_installed_soundfont_is_not_downloaded_again() {
    let folder = tempfile::tempdir().unwrap();
    let soundfonts = Soundfonts::with_soundfont(folder.path().to_path_buf(), pinned(b"RIFF"));
    fs::write(folder.path().join("MuseScore_General.sf3"), b"RIFF").unwrap();
    let status = soundfonts.install(|_| panic!("nothing to download")).unwrap();
    let installed = status.installed.unwrap();
    assert_eq!(installed.bytes, 4);
    assert!(!status.installing);
    assert_eq!(soundfonts.read().unwrap(), b"RIFF");

    let removed = soundfonts.remove().unwrap();
    assert_eq!(removed.installed, None);
    assert!(!installed.path.exists());
}

#[test]
fn one_download_at_a_time() {
    let folder = tempfile::tempdir().unwrap();
    let soundfonts = Soundfonts::with_soundfont(folder.path().to_path_buf(), pinned(b"RIFF"));
    let running = soundfonts.begin().unwrap();
    assert!(soundfonts.status().installing);
    assert_eq!(soundfonts.install(|_| {}).unwrap_err().code(), "soundfont_busy");
    assert_eq!(soundfonts.remove().unwrap_err().code(), "soundfont_busy");
    soundfonts.cancel();
    assert!(soundfonts.cancel_requested());
    drop(running);
    assert!(!soundfonts.status().installing);
}

#[test]
fn cancelling_with_no_download_running_does_nothing() {
    let folder = tempfile::tempdir().unwrap();
    let soundfonts = Soundfonts::new(folder.path().to_path_buf());
    soundfonts.cancel();
    assert!(!soundfonts.cancel_requested());
}
