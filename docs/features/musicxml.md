# The score document

`@donizetti/musicxml` holds the score as a MusicXML document (decision 3):
the parsed XML is the score, the edit operations change it, and it is written
back with everything they did not touch exactly as it was written. There is no
model of our own to drift from the file.

## Reading

`readScore(bytes | text)` reads `.musicxml`, `.xml` and compressed `.mxl`,
told apart by their content (a zip archive starts with `PK`), not by the file
name.

- **Encodings**: UTF-8 (with or without a byte order mark) and UTF-16 in
  either byte order are read and written back as they were. A file declaring
  another encoding (Latin-1 from old exporters) is read with it and written as
  UTF-8, its declaration changed to say so.
- **`.mxl`**: the score is the first `<rootfile>` in
  `META-INF/container.xml` with the MusicXML media type (or none, as
  MusicXML 1 and 2 wrote). Every other file in the archive is kept.
- **Refused**, with a `MusicXmlError` carrying a code and parameters, never
  English text: `not_xml`, `not_musicxml`, `timewise_unsupported` (a
  `<score-timewise>` file), `mxl_not_zip`, `mxl_no_root_file`,
  `mxl_missing_file`, `unsupported_encoding`, `no_dom` (no `DOMParser` here).

## Writing

`writeScore(document, format?)` gives the file's bytes, as `.musicxml` or
`.mxl` (the format it was read in, unless another is asked for).

- **Unchanged**: the very bytes that were read.
- **Changed**: the text before and after the root element (declaration,
  DOCTYPE, comments) as read; every element, attribute, entity, quote and
  space the edits did not touch **exactly as written**; only what changed is
  written afresh. A tokenizer notes where each node was in the text when it is
  read, and a `MutationObserver` notes what the edits change: an untouched
  subtree is copied from the original text; an element whose attributes
  changed gets a new start tag (its children still copied when untouched); an
  element keeps its form (`<a/>` or `<a></a>`) while empty. Plain
  `XMLSerializer` would rewrite `<a></a>` as `<a/>` and quotes and entities its
  own way. If the text and the parsed tree ever cannot be matched, the score
  is still written correctly, through `XMLSerializer`, only without the
  original spelling.
- **`.mxl`**: the score is replaced in its archive and every other file kept;
  the `mimetype` file comes first, stored uncompressed, as the specification
  asks (added when the archive had none: MuseScore 4 writes none). Plain
  MusicXML asked to be `.mxl` goes into a new archive as `score.musicxml`.
- `restoreScore(document, text, revision)` replaces the tree with an earlier
  `scoreText` (undo and redo), keeping the encoding and archive;
  `isChanged(document)` says whether the score differs from the file read.

## The score map

`mapScore(root, part?)` lists a part's measures (their index, `number`,
divisions, key, time, whether implicit, the length the time signature asks
for and how far the notes reach) and notes (onset and length in whole notes,
voice, staff, chord, grace, rest, pitch), following `<backup>`, `<forward>`,
chords and changes of divisions, key and time. Positions are in whole notes,
as OpenSheetMusicDisplay's timestamps are, so `noteAt(map, measure, onset,
{ voice, staff, midi })` finds the `<note>` behind a note OSMD drew: the
click-to-XML mapping. Among notes starting together, timed notes come before
grace notes and the nearest pitch wins in a chord.

## What can be edited

`editabilityOf(root)` (decision 4): one part, one staff, one voice, no
`<backup>` or `<forward>`. Chords and grace notes within the one voice are
allowed. Otherwise every reason is given (`no_parts`, `several_parts`,
`several_staves`, `several_voices`, `backup_or_forward`) for the component to
say why the score is read-only.
