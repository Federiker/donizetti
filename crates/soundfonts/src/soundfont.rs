use serde::Serialize;

/// A soundfont Donizetti can download: where from, exactly what to expect, and the notice that must
/// travel with it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Soundfont {
    pub id: &'static str,
    pub name: &'static str,
    pub version: &'static str,
    pub licence: &'static str,
    /// The pinned HTTPS address; redirects are refused.
    pub url: &'static str,
    pub bytes: u64,
    /// SHA-512 of the file, in lower-case hexadecimal.
    pub sha512: &'static str,
    /// The file name it is stored under.
    pub file_name: &'static str,
    /// The acknowledgements and licence that must accompany it (stored beside it when installed).
    #[serde(skip)]
    pub notice: &'static str,
}

/// MuseScore General 0.2.0 (SF3), the default General MIDI soundfont of MuseScore 3: MIT-licensed, by
/// Frank Wen, Michael Cowgill and S. Christian Collins with instruments by Ethan Winer and Michael
/// Schorsch. Pinned as jerome pins it (20 October 2026).
pub const MUSESCORE_GENERAL: Soundfont = Soundfont {
    id: "musescore-general",
    name: "MuseScore General",
    version: "0.2.0",
    licence: "MIT",
    url: "https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3",
    bytes: 39_900_972,
    sha512: "245687aa1ab41d7b048cad985fae5bdec03d5e50023ade4e2b0d2f93801f89338fa9e76633b8ff7953a8c83e6b7a6a0eddcb91bc4ec15291d84dadc27e90e4c7",
    file_name: "MuseScore_General.sf3",
    notice: include_str!("../notices/MuseScore_General_License.md"),
};
