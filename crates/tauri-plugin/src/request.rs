use std::path::PathBuf;

use tauri::{http::HeaderMap, ipc::InvokeBody};

use crate::error::Error;

/// The header that carries the file's path in `write_score` and `write_export`, percent-encoded as
/// UTF-8 (`encodeURIComponent`), since a header holds only ASCII.
pub(crate) const PATH_HEADER: &str = "donizetti-path";
/// The header that carries the hash a save quotes, when it quotes one.
pub(crate) const EXPECTED_HASH_HEADER: &str = "donizetti-expected-hash";

/// A `write_score` request: the score's bytes are the request's body, sent raw rather than as JSON (a
/// number per byte), and the path and hash travel in headers.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ScoreWrite {
    pub path: PathBuf,
    pub bytes: Vec<u8>,
    pub expected_hash: Option<String>,
}

/// A `write_export` request: as a `write_score` request, without a hash.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ExportWrite {
    pub path: PathBuf,
    pub bytes: Vec<u8>,
}

fn header<'a>(headers: &'a HeaderMap, name: &str) -> Result<Option<&'a str>, Error> {
    headers
        .get(name)
        .map(|value| {
            value
                .to_str()
                .map_err(|_| Error::invalid_request(format!("the {name} header is not ASCII")))
        })
        .transpose()
}

/// The path in the path header, decoded.
fn path_header(headers: &HeaderMap) -> Result<PathBuf, Error> {
    let path = header(headers, PATH_HEADER)?
        .ok_or_else(|| Error::invalid_request(format!("the {PATH_HEADER} header is missing")))?;
    let path = PathBuf::from(percent_decode(path)?);
    if path.as_os_str().is_empty() {
        return Err(Error::invalid_request("the path is empty"));
    }
    Ok(path)
}

/// The body's bytes: raw from the custom protocol, or a JSON array of bytes where Tauri falls back to
/// `postMessage` (Android, or a webview that blocks the protocol).
fn body_bytes(body: &InvokeBody) -> Result<Vec<u8>, Error> {
    match body {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(value) => serde_json::from_value(value.clone())
            .map_err(|error| Error::invalid_request(format!("the body is not the file's bytes: {error}"))),
    }
}

/// Reads a `write_score` request.
pub(crate) fn score_write(body: &InvokeBody, headers: &HeaderMap) -> Result<ScoreWrite, Error> {
    let path = path_header(headers)?;
    let expected_hash = header(headers, EXPECTED_HASH_HEADER)?.map(str::to_owned);
    let bytes = body_bytes(body)?;
    Ok(ScoreWrite {
        path,
        bytes,
        expected_hash,
    })
}

/// Reads a `write_export` request.
pub(crate) fn export_write(body: &InvokeBody, headers: &HeaderMap) -> Result<ExportWrite, Error> {
    let path = path_header(headers)?;
    let bytes = body_bytes(body)?;
    Ok(ExportWrite { path, bytes })
}

fn hex_digit(digit: u8) -> Option<u8> {
    match digit {
        b'0'..=b'9' => Some(digit - b'0'),
        b'a'..=b'f' => Some(digit - b'a' + 10),
        b'A'..=b'F' => Some(digit - b'A' + 10),
        _ => None,
    }
}

/// Undoes `encodeURIComponent`: each `%XY` is the byte `XY`, and the bytes are UTF-8.
pub(crate) fn percent_decode(text: &str) -> Result<String, Error> {
    let invalid = || Error::invalid_request("the path is not percent-encoded UTF-8");
    let mut bytes = Vec::with_capacity(text.len());
    let mut input = text.bytes();
    while let Some(byte) = input.next() {
        if byte == b'%' {
            let high = input.next().and_then(hex_digit).ok_or_else(invalid)?;
            let low = input.next().and_then(hex_digit).ok_or_else(invalid)?;
            bytes.push(high << 4 | low);
        } else {
            bytes.push(byte);
        }
    }
    String::from_utf8(bytes).map_err(|_| invalid())
}

/// `read_score`'s answer, sent raw: the hash's 64 hexadecimal characters, then the file's bytes. One
/// binary answer carries both without turning the file into JSON.
pub(crate) fn score_response(bytes: &[u8], hash: &str) -> Vec<u8> {
    let mut response = Vec::with_capacity(hash.len() + bytes.len());
    response.extend_from_slice(hash.as_bytes());
    response.extend_from_slice(bytes);
    response
}
