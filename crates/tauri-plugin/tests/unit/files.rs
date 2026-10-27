use std::fs;

use super::{PAGE, names};
use crate::{Error, export_pdf, files::write_atomically, hash, read_score, write_score};

const EMPTY_HASH: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

#[test]
fn the_hash_is_sha256_in_lower_case_hexadecimal() {
    assert_eq!(hash(b""), EMPTY_HASH);
    assert_eq!(
        hash(b"abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
}

#[test]
fn a_score_is_read_with_its_hash() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("song.musicxml");
    fs::write(&path, b"abc").unwrap();
    let (bytes, read_hash) = read_score(&path).unwrap();
    assert_eq!(bytes, b"abc");
    assert_eq!(read_hash, hash(b"abc"));

    let missing = read_score(&folder.path().join("missing.musicxml")).unwrap_err();
    assert_eq!(missing.code(), "read_failed");
}

#[test]
fn a_new_score_is_written_without_a_hash() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("Für Elise.musicxml");
    let written = write_score(&path, b"<score-partwise/>", None).unwrap();
    assert_eq!(written, hash(b"<score-partwise/>"));
    assert_eq!(fs::read(&path).unwrap(), b"<score-partwise/>");
    assert_eq!(names(folder.path()), ["Für Elise.musicxml"]);

    // Without a hash, whatever is there is replaced (Save As).
    fs::write(&path, b"changed elsewhere").unwrap();
    write_score(&path, b"second", None).unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"second");
}

#[test]
fn a_score_changed_on_disk_is_not_overwritten() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("song.musicxml");
    let first = write_score(&path, b"first", None).unwrap();
    let second = write_score(&path, b"second", Some(&first)).unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"second");

    // Another program saved it after we read it.
    fs::write(&path, b"theirs").unwrap();
    let error = write_score(&path, b"ours", Some(&second)).unwrap_err();
    let Error::ChangedOnDisk {
        path: changed,
        expected,
        actual,
    } = &error
    else {
        panic!("{error:?}");
    };
    assert_eq!(changed, &path);
    assert_eq!(expected, &second);
    assert_eq!(actual, &hash(b"theirs"));
    assert_eq!(fs::read(&path).unwrap(), b"theirs");
    assert_eq!(names(folder.path()), ["song.musicxml"]);
}

#[test]
fn a_score_removed_since_it_was_read_counts_as_empty() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("song.musicxml");
    let error = write_score(&path, b"ours", Some(&hash(b"read before"))).unwrap_err();
    assert!(matches!(&error, Error::ChangedOnDisk { actual, .. } if actual == EMPTY_HASH));
    assert!(!path.exists());
    write_score(&path, b"ours", Some(EMPTY_HASH)).unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"ours");
}

#[test]
fn a_change_while_writing_is_caught_before_the_rename() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("song.musicxml");
    fs::write(&path, b"before").unwrap();
    let error = write_atomically(&path, b"ours", || {
        Err(Error::ChangedOnDisk {
            path: path.clone(),
            expected: String::new(),
            actual: String::new(),
        })
    })
    .unwrap_err();
    assert_eq!(error.code(), "changed_on_disk");
    assert_eq!(fs::read(&path).unwrap(), b"before");
    assert_eq!(names(folder.path()), ["song.musicxml"]);
}

#[test]
fn a_score_in_a_missing_folder_or_unreadable_is_an_error() {
    let folder = tempfile::tempdir().unwrap();
    let error = write_score(&folder.path().join("missing/song.musicxml"), b"x", None).unwrap_err();
    assert_eq!(error.code(), "write_failed");

    // A folder where the score should be: its hash cannot be checked, and it cannot be replaced.
    let taken = folder.path().join("taken.musicxml");
    fs::create_dir(&taken).unwrap();
    assert_eq!(
        write_score(&taken, b"x", Some(EMPTY_HASH)).unwrap_err().code(),
        "read_failed"
    );
    assert_eq!(write_score(&taken, b"x", None).unwrap_err().code(), "write_failed");
    assert_eq!(names(folder.path()), ["taken.musicxml"]);
}

#[test]
fn a_relative_path_is_written_in_the_current_folder() {
    let name = format!("donizetti-relative-{}.musicxml", std::process::id());
    let path = std::path::Path::new(&name);
    write_score(path, b"here", None).unwrap();
    assert_eq!(fs::read(path).unwrap(), b"here");
    fs::remove_file(path).unwrap();
}

#[test]
fn the_pages_are_exported_as_a_pdf() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("song.pdf");
    export_pdf(&[PAGE.to_owned(), PAGE.to_owned()], &path).unwrap();
    assert!(fs::read(&path).unwrap().starts_with(b"%PDF-"));

    let none = folder.path().join("none.pdf");
    assert_eq!(export_pdf(&[], &none).unwrap_err().code(), "pdf_no_pages");
    assert!(!none.exists());
}
