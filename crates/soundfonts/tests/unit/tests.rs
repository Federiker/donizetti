use std::{fs, sync::atomic::AtomicBool};

use sha2::{Digest, Sha512};

use crate::{
    DownloadFailure, Installer, MUSESCORE_GENERAL, Soundfont, SoundfontError,
    download::{Receiver, hex, verify_file},
};

/// A soundfont pinned to bytes made up for the test.
fn pinned(bytes: &[u8]) -> Soundfont {
    let sha512: &'static str = Box::leak(hex(&Sha512::digest(bytes)).into_boxed_str());
    Soundfont {
        bytes: bytes.len() as u64,
        sha512,
        ..MUSESCORE_GENERAL
    }
}

#[test]
fn musescore_general_is_pinned_with_its_notice() {
    assert!(MUSESCORE_GENERAL.url.starts_with("https://"));
    assert_eq!(MUSESCORE_GENERAL.sha512.len(), 128);
    assert_eq!(MUSESCORE_GENERAL.licence, "MIT");
    for credit in [
        "Frank Wen",
        "Michael Cowgill",
        "S. Christian Collins",
        "Ethan Winer",
        "Michael Schorsch",
    ] {
        assert!(MUSESCORE_GENERAL.notice.contains(credit), "{credit}");
    }
}

#[test]
fn the_soundfont_serialises_without_its_notice() {
    let value = serde_json::to_value(&MUSESCORE_GENERAL).unwrap();
    assert_eq!(value["fileName"], "MuseScore_General.sf3");
    assert_eq!(value["bytes"], 39_900_972);
    assert!(value.get("notice").is_none());
}

#[test]
fn only_the_exact_pinned_file_is_installed_from_disk() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("font.sf3");
    fs::write(&source, b"RIFF a soundfont").unwrap();
    let root = directory.path().join("soundfonts");
    let installer = Installer::new(root.clone(), pinned(b"RIFF a soundfont"));
    assert_eq!(installer.root(), root);
    assert!(installer.installed().is_none());
    assert!(matches!(installer.read(), Err(SoundfontError::NotInstalled)));

    let result = installer.install_from_file(&source).unwrap();
    assert_eq!(result.bytes, 16);
    assert_eq!(result.path, root.join("MuseScore_General.sf3"));
    assert_eq!(result.notice_path, root.join("MuseScore_General.sf3.LICENSE.md"));
    assert_eq!(installer.read().unwrap(), b"RIFF a soundfont");
    let notice = fs::read_to_string(&result.notice_path).unwrap();
    assert!(notice.contains("MIT license"));
    assert!(!root.join("MuseScore_General.sf3.part").exists());

    let other = directory.path().join("other.sf3");
    fs::write(&other, b"RIFF something else").unwrap();
    assert!(matches!(
        verify_file(installer.soundfont(), &other),
        Err(SoundfontError::Verification)
    ));
    assert!(matches!(
        installer.install_from_file(&other),
        Err(SoundfontError::Verification)
    ));
    assert_eq!(installer.read().unwrap(), b"RIFF a soundfont");

    installer.uninstall().unwrap();
    assert!(installer.installed().is_none());
    assert!(!result.notice_path.exists());
    installer.uninstall().unwrap();
}

#[test]
fn a_missing_source_file_is_a_storage_error() {
    let directory = tempfile::tempdir().unwrap();
    let installer = Installer::new(directory.path().to_path_buf(), pinned(b"x"));
    let error = installer
        .install_from_file(&directory.path().join("missing.sf3"))
        .unwrap_err();
    assert_eq!(error.code(), "soundfont_storage_failed");
    let SoundfontError::Storage { path, .. } = &error else {
        panic!("{error:?}");
    };
    assert!(path.ends_with("missing.sf3"));
}

#[test]
fn a_file_of_the_wrong_size_is_not_installed() {
    let directory = tempfile::tempdir().unwrap();
    let installer = Installer::new(directory.path().to_path_buf(), pinned(b"RIFF"));
    fs::write(installer.path(), b"RIFF and more").unwrap();
    assert!(installer.installed().is_none());
    assert!(matches!(installer.read(), Err(SoundfontError::NotInstalled)));
}

#[test]
fn a_root_that_cannot_be_created_is_a_storage_error() {
    let directory = tempfile::tempdir().unwrap();
    let blocker = directory.path().join("file");
    fs::write(&blocker, b"not a folder").unwrap();
    let source = directory.path().join("font.sf3");
    fs::write(&source, b"RIFF").unwrap();
    let installer = Installer::new(blocker.join("soundfonts"), pinned(b"RIFF"));
    let error = installer.install_from_file(&source).unwrap_err();
    assert_eq!(error.code(), "soundfont_storage_failed");
    assert!(installer.installed().is_none());
}

#[test]
fn a_download_is_checked_as_it_arrives() {
    let directory = tempfile::tempdir().unwrap();
    let soundfont = pinned(b"RIFF a soundfont");

    let target = directory.path().join("good.part");
    let mut receiver = Receiver::create(&soundfont, &target, Some(16)).unwrap();
    assert_eq!(receiver.accept(b"RIFF ").unwrap(), 5);
    assert_eq!(receiver.accept(b"a soundfont").unwrap(), 16);
    receiver.finish().unwrap();
    assert_eq!(fs::read(&target).unwrap(), b"RIFF a soundfont");

    // The server announces another size: refused before anything is written.
    let announced = directory.path().join("announced.part");
    assert!(matches!(
        Receiver::create(&soundfont, &announced, Some(17)),
        Err(SoundfontError::Verification)
    ));
    assert!(!announced.exists());

    // More bytes than pinned.
    let mut receiver = Receiver::create(&soundfont, &directory.path().join("long.part"), None).unwrap();
    assert!(matches!(
        receiver.accept(b"RIFF a soundfont and more"),
        Err(SoundfontError::Verification)
    ));

    // The right size, other bytes.
    let mut receiver = Receiver::create(&soundfont, &directory.path().join("other.part"), None).unwrap();
    receiver.accept(b"RIFF a soundfonT").unwrap();
    assert!(matches!(receiver.finish(), Err(SoundfontError::Verification)));

    // Too short.
    let mut receiver = Receiver::create(&soundfont, &directory.path().join("short.part"), None).unwrap();
    receiver.accept(b"RIFF").unwrap();
    assert!(matches!(receiver.finish(), Err(SoundfontError::Verification)));

    // The target must not exist yet.
    assert!(matches!(
        Receiver::create(&soundfont, &target, None),
        Err(SoundfontError::Storage { .. })
    ));
}

#[test]
fn a_download_refused_by_the_server_installs_nothing() {
    let directory = tempfile::tempdir().unwrap();
    let soundfont = Soundfont {
        url: "https://127.0.0.1:9/MuseScore_General.sf3",
        ..pinned(b"x")
    };
    let root = directory.path().join("soundfonts");
    let installer = Installer::new(root.clone(), soundfont);
    let error = installer.install(&AtomicBool::new(false), |_| {}).unwrap_err();
    assert!(matches!(error, SoundfontError::Download(DownloadFailure::Unreachable)));
    assert!(installer.installed().is_none());
    assert!(!root.join("MuseScore_General.sf3.part").exists());
    assert!(!root.join("MuseScore_General.sf3.LICENSE.md").exists());
    let cancelled = installer.install(&AtomicBool::new(true), |_| {}).unwrap_err();
    assert!(matches!(
        cancelled,
        SoundfontError::Cancelled | SoundfontError::Download(_)
    ));
}

#[test]
fn errors_serialise_as_codes_with_their_parameters() {
    let json = |error: &SoundfontError| serde_json::to_value(error).unwrap();
    assert_eq!(
        json(&SoundfontError::Busy),
        serde_json::json!({ "code": "soundfont_busy", "params": {} })
    );
    assert_eq!(
        json(&SoundfontError::Download(DownloadFailure::Status(404))),
        serde_json::json!({
            "code": "soundfont_download_failed",
            "params": { "reason": "status", "status": 404 },
        })
    );
    assert_eq!(
        json(&SoundfontError::Download(DownloadFailure::Interrupted)),
        serde_json::json!({ "code": "soundfont_download_failed", "params": { "reason": "interrupted" } })
    );
    assert_eq!(
        json(&SoundfontError::Storage {
            path: "fonts/a.sf3".into(),
            detail: "denied".to_owned(),
        }),
        serde_json::json!({
            "code": "soundfont_storage_failed",
            "params": { "path": "fonts/a.sf3", "detail": "denied" },
        })
    );
    let codes = [
        (SoundfontError::Cancelled, "soundfont_cancelled"),
        (SoundfontError::Verification, "soundfont_verification_failed"),
        (SoundfontError::NotInstalled, "soundfont_not_installed"),
        (
            SoundfontError::Download(DownloadFailure::Setup),
            "soundfont_download_failed",
        ),
    ];
    for (error, code) in codes {
        assert_eq!(json(&error)["code"], code);
        assert!(!error.to_string().is_empty());
    }
    assert!(
        SoundfontError::Download(DownloadFailure::Status(503))
            .to_string()
            .contains("503")
    );
    assert!(
        SoundfontError::Download(DownloadFailure::Unreachable)
            .to_string()
            .contains("unreachable")
    );
    assert!(
        SoundfontError::Storage {
            path: "a.sf3".into(),
            detail: "denied".to_owned()
        }
        .to_string()
        .contains("a.sf3")
    );
}

/// Checks the real pinned file (path in `DONIZETTI_SOUNDFONT_FILE`) installs: the pinned size and
/// checksum are right.
#[test]
#[ignore = "needs the real 38 MB soundfont"]
fn the_real_file_matches_the_pin() {
    let Ok(path) = std::env::var("DONIZETTI_SOUNDFONT_FILE") else {
        return;
    };
    let directory = tempfile::tempdir().unwrap();
    let installer = Installer::new(directory.path().to_path_buf(), MUSESCORE_GENERAL);
    installer.install_from_file(std::path::Path::new(&path)).unwrap();
    assert!(installer.installed().is_some());
}

/// Downloads the real soundfont (38 MB) from its pinned address and installs it.
#[test]
#[ignore = "downloads 38 MB"]
fn the_real_download_matches_the_pin() {
    let directory = tempfile::tempdir().unwrap();
    let installer = Installer::new(directory.path().to_path_buf(), MUSESCORE_GENERAL);
    let mut last = 0;
    let result = installer
        .install(&AtomicBool::new(false), |received| {
            assert!(received > last);
            last = received;
        })
        .unwrap();
    assert_eq!(last, MUSESCORE_GENERAL.bytes);
    assert_eq!(result.bytes, MUSESCORE_GENERAL.bytes);
}
