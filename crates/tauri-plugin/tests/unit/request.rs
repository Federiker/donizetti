use std::path::PathBuf;

use tauri::{
    http::{HeaderMap, HeaderValue},
    ipc::InvokeBody,
};

use crate::request::{ExportWrite, ScoreWrite, export_write, percent_decode, score_response, score_write};

fn headers(pairs: &[(&'static str, &[u8])]) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in pairs {
        headers.insert(*name, HeaderValue::from_bytes(value).unwrap());
    }
    headers
}

#[test]
fn a_write_carries_its_path_and_hash_in_headers_and_its_bytes_raw() {
    let request = score_write(
        &InvokeBody::Raw(b"<score-partwise/>".to_vec()),
        &headers(&[
            ("donizetti-path", b"C%3A%5CScores%5CF%C3%BCr%20Elise.musicxml"),
            ("donizetti-expected-hash", b"abc"),
        ]),
    )
    .unwrap();
    assert_eq!(
        request,
        ScoreWrite {
            path: PathBuf::from("C:\\Scores\\Für Elise.musicxml"),
            bytes: b"<score-partwise/>".to_vec(),
            expected_hash: Some("abc".to_owned()),
        }
    );
}

#[test]
fn a_write_through_post_message_carries_its_bytes_as_json() {
    let request = score_write(
        &InvokeBody::Json(serde_json::json!([60, 47, 62])),
        &headers(&[("donizetti-path", b"song.musicxml")]),
    )
    .unwrap();
    assert_eq!(request.bytes, b"</>");
    assert_eq!(request.expected_hash, None);

    let error = score_write(
        &InvokeBody::Json(serde_json::json!({ "bytes": "not bytes" })),
        &headers(&[("donizetti-path", b"song.musicxml")]),
    )
    .unwrap_err();
    assert_eq!(error.code(), "invalid_request");
}

#[test]
fn a_write_without_a_usable_path_is_refused() {
    let body = InvokeBody::Raw(Vec::new());
    for headers in [
        headers(&[]),
        headers(&[("donizetti-path", b"")]),
        headers(&[("donizetti-path", b"%zz")]),
        headers(&[("donizetti-path", b"\xff")]),
        headers(&[("donizetti-path", b"song"), ("donizetti-expected-hash", b"\xff")]),
    ] {
        assert_eq!(score_write(&body, &headers).unwrap_err().code(), "invalid_request");
    }
}

#[test]
fn an_export_carries_its_path_in_a_header_and_its_bytes_raw_or_as_json() {
    let request = export_write(
        &InvokeBody::Raw(b"MThd".to_vec()),
        &headers(&[("donizetti-path", b"C%3A%5CScores%5CF%C3%BCr%20Elise.mid")]),
    )
    .unwrap();
    assert_eq!(
        request,
        ExportWrite {
            path: PathBuf::from("C:\\Scores\\Für Elise.mid"),
            bytes: b"MThd".to_vec(),
        }
    );

    let request = export_write(
        &InvokeBody::Json(serde_json::json!([77, 84])),
        &headers(&[("donizetti-path", b"song.mid")]),
    )
    .unwrap();
    assert_eq!(request.bytes, b"MT");

    for (body, headers) in [
        (InvokeBody::Raw(Vec::new()), headers(&[])),
        (InvokeBody::Raw(Vec::new()), headers(&[("donizetti-path", b"")])),
        (
            InvokeBody::Json(serde_json::json!("not bytes")),
            headers(&[("donizetti-path", b"song.mid")]),
        ),
    ] {
        assert_eq!(export_write(&body, &headers).unwrap_err().code(), "invalid_request");
    }
}

#[test]
fn percent_encoding_is_undone_as_utf8() {
    assert_eq!(percent_decode("plain").unwrap(), "plain");
    assert_eq!(percent_decode("%E2%99%AA%2f%2F").unwrap(), "♪//");
    for invalid in ["%", "%4", "%g0", "%0g", "%FF"] {
        assert_eq!(
            percent_decode(invalid).unwrap_err().code(),
            "invalid_request",
            "{invalid}"
        );
    }
}

#[test]
fn a_read_answers_the_hash_then_the_bytes() {
    let hash = "a".repeat(64);
    let response = score_response(b"<score/>", &hash);
    assert_eq!(&response[..64], hash.as_bytes());
    assert_eq!(&response[64..], b"<score/>");
}
