/** The demo app's own interface text (the editor's is in @donizetti/react). `{name}` and the like are filled in. */
export const appStrings = {
  title: "Donizetti",
  open: "Open…",
  new: "New…",
  newScore: "New score",
  newTitle: "Title",
  newComposer: "Composer",
  newKey: "Key signature",
  newTime: "Time signature",
  newPickup: "Start with a pickup measure",
  newTempo: "Tempo (quarter notes a minute)",
  newMeasures: "Measures",
  create: "Create",
  untitled: "untitled",
  readOnly: "Read-only",
  sample: "Sample: Little Tune",
  soundfont: "Soundfont…",
  soundfontReady: "Soundfont loaded",
  unsaved: "Unsaved changes",
  openFailed: "The file could not be opened.",
  saved: "Saved.",
  saveFailed: "The score could not be saved.",
  notSaved: "Not saved.",
  exported: "Exported.",
  exportFailed: "The score could not be exported.",

  // The desktop app: the soundfont, downloaded on request.
  soundfontDownload: "Download the soundfont ({size} MB)",
  soundfontDownloading: "Downloading the soundfont… {percent}%",
  soundfontProgress: "Soundfont download",
  soundfontFailed: "The soundfont could not be downloaded.",
  cancel: "Cancel",

  // The desktop app's dialogue boxes.
  scoreFiles: "MusicXML scores",
  musicXmlFiles: "MusicXML",
  mxlFiles: "Compressed MusicXML",
  midiFiles: "MIDI files",
  svgFiles: "SVG images",
  pdfFiles: "PDF documents",
  changedOnDiskTitle: "The file has changed",
  changedOnDiskQuestion:
    "{name} was changed by another program since it was opened. Overwrite it with this score? The other program's changes will be lost.",
  overwrite: "Overwrite",
  svgPagesTitle: "Several pages",
  svgPagesQuestion:
    "The score has {count} pages, written as {first} to {last}, replacing any files with those names. Write them?",
  svgPagesWrite: "Write the pages",

  /** The desktop app's errors, by the code `@donizetti/tauri` gives them. */
  errors: {
    read_failed: "{name} could not be read.",
    write_failed: "{name} could not be written; the file is as it was.",
    changed_on_disk: "{name} was changed by another program, so it was not overwritten.",
    invalid_request: "The app asked for something the plugin could not understand.",
    internal: "The work could not be finished.",
    soundfont_busy: "The soundfont is already being downloaded.",
    soundfont_cancelled: "The download was cancelled.",
    soundfont_download_failed: "The soundfont could not be downloaded. Check the internet connection and try again.",
    soundfont_verification_failed: "The downloaded soundfont was not the expected file, so it was not installed.",
    soundfont_not_installed: "The soundfont is not installed.",
    soundfont_storage_failed: "The soundfont could not be stored on this computer.",
    pdf_no_pages: "There are no pages to export.",
    pdf_invalid_svg: "Page {page} could not be read for the PDF.",
    pdf_no_fonts: "Page {page} has text, but this computer has no fonts to write it in.",
    pdf_conversion_failed: "Page {page} could not be made into PDF.",
    invalid_response: "The plugin gave an answer the app did not expect.",
    unknown: "The app could not do that.",
  },
} as const;

/** A message with its `{placeholders}` filled in; a value that is missing leaves its placeholder. */
export function fill(message: string, values: Readonly<Record<string, string | number>>): string {
  return message.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    key in values ? String(values[key]) : placeholder,
  );
}
