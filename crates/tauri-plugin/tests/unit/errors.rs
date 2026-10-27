use std::error::Error as _;

use donizetti_pdf::PdfError;
use donizetti_soundfonts::SoundfontError;
use serde_json::json;

use crate::Error;

fn json(error: &Error) -> serde_json::Value {
    serde_json::to_value(error).unwrap()
}

#[test]
fn errors_reach_the_app_as_codes_with_their_parameters() {
    assert_eq!(
        json(&Error::ReadFailed {
            path: "song.musicxml".into(),
            detail: "denied".to_owned()
        }),
        json!({ "code": "read_failed", "params": { "path": "song.musicxml", "detail": "denied" } })
    );
    assert_eq!(
        json(&Error::WriteFailed {
            path: "song.musicxml".into(),
            detail: "full".to_owned()
        }),
        json!({ "code": "write_failed", "params": { "path": "song.musicxml", "detail": "full" } })
    );
    assert_eq!(
        json(&Error::ChangedOnDisk {
            path: "song.musicxml".into(),
            expected: "aa".to_owned(),
            actual: "bb".to_owned(),
        }),
        json!({
            "code": "changed_on_disk",
            "params": { "path": "song.musicxml", "expectedHash": "aa", "actualHash": "bb" },
        })
    );
    assert_eq!(
        json(&Error::invalid_request("no path")),
        json!({ "code": "invalid_request", "params": { "detail": "no path" } })
    );
    assert_eq!(
        json(&Error::Internal {
            detail: "stopped".to_owned()
        }),
        json!({ "code": "internal", "params": { "detail": "stopped" } })
    );
    assert_eq!(
        json(&Error::from(SoundfontError::NotInstalled)),
        json!({ "code": "soundfont_not_installed", "params": {} })
    );
    assert_eq!(
        json(&Error::from(PdfError::NoFonts { page: 2 })),
        json!({ "code": "pdf_no_fonts", "params": { "page": 2 } })
    );
}

#[test]
fn errors_have_a_message_for_logs_and_keep_their_cause() {
    let errors = [
        Error::ReadFailed {
            path: "a".into(),
            detail: "d".to_owned(),
        },
        Error::WriteFailed {
            path: "a".into(),
            detail: "d".to_owned(),
        },
        Error::ChangedOnDisk {
            path: "a".into(),
            expected: String::new(),
            actual: String::new(),
        },
        Error::invalid_request("d"),
        Error::Internal { detail: "d".to_owned() },
        Error::from(SoundfontError::Busy),
        Error::from(PdfError::NoPages),
    ];
    for error in &errors {
        assert!(!error.to_string().is_empty(), "{error:?}");
    }
    assert!(errors[0].source().is_none());
    assert!(errors[5].source().is_some());
    assert!(errors[6].source().is_some());
    assert_eq!(errors[5].code(), "soundfont_busy");
    assert_eq!(errors[6].code(), "pdf_no_pages");
}
