/**
 * The component's interface text in UK English (decision 6), one message a key. Placeholders are written
 * `{name}`; plurals are objects keyed by the categories of `Intl.PluralRules`. A host overrides any of them
 * with the `strings` prop, or routes every key through its own translations with the `t` prop.
 */
export const enGB = {
  "score.label": "Score: {name}",
  "score.untitled": "Untitled score",
  "score.loading": "Loading the score…",
  "score.drawFailed": "The score could not be drawn.",

  "read.not_xml": "This file is not MusicXML: it is not well-formed XML.",
  "read.not_musicxml": "This file is XML, but not a MusicXML score.",
  "read.timewise_unsupported":
    "This score is written measure by measure (score-timewise), which Donizetti cannot read yet.",
  "read.mxl_not_zip": "This compressed MusicXML file (.mxl) is damaged: it is not a readable archive.",
  "read.mxl_no_root_file": "This compressed MusicXML file (.mxl) does not say which file in it is the score.",
  "read.mxl_missing_file": "This compressed MusicXML file (.mxl) names a score it does not contain: {path}.",
  "read.unsupported_encoding": "This file is written in an encoding Donizetti cannot read: {encoding}.",
  "read.no_dom": "MusicXML can only be read in a browser window.",

  "readOnly.title": "This score can be played but not edited",
  "readOnly.no_parts": "It has no parts.",
  "readOnly.several_parts": { one: "It has {parts} part.", other: "It has {parts} parts." },
  "readOnly.several_staves": "A part has {staves} staves.",
  "readOnly.several_voices": "It has {voices} voices.",
  "readOnly.backup_or_forward": "Its notes are written out of time order, as several voices are.",
  "readOnly.explanation": "For now Donizetti edits scores with one part, one staff and one voice, such as lead sheets.",

  "toolbar.label": "Score tools",
  "toolbar.play": "Play",
  "toolbar.pause": "Pause",
  "toolbar.stop": "Back to the start",
  "toolbar.noSoundfont": "Playback needs a soundfont.",
  "toolbar.playFailed": "The score could not be played.",
  "toolbar.noteInput": "Note input",
  "toolbar.undo": "Undo",
  "toolbar.redo": "Redo",
  "toolbar.save": "Save",
  "toolbar.saved": "Saved",
  "toolbar.saveFailed": "The score could not be saved.",
  "toolbar.export": "Export",
  "toolbar.exportMidi": "MIDI file",
  "toolbar.exportSvg": "SVG image",
  "toolbar.exportPdf": "PDF",

  "length.label": "Length",
  "length.64th": "64th note",
  "length.32nd": "32nd note",
  "length.16th": "16th note",
  "length.eighth": "Eighth note",
  "length.quarter": "Quarter note",
  "length.half": "Half note",
  "length.whole": "Whole note",
  "length.breve": "Double whole note",
  "length.dot": "Dot",
  "length.rest": "Rest",
  "length.tie": "Tie",

  "selection.none": "Nothing selected",
  "selection.note": "{pitch}, {length}, measure {measure}",
  "selection.rest": "Rest, {length}, measure {measure}",
  "selection.cursor": "Note input at measure {measure}, beat {beat}",

  "edit.failed": "That change cannot be made here.",

  "textEntry.lyrics": "Lyrics, verse {verse}",
  "textEntry.chord": "Chord symbol",

  "palette.label": "Palette",
  "palette.show": "Show the palette",
  "palette.hide": "Hide the palette",
  "palette.selectFirst": "Select a note: the palette applies to its measure.",
  "palette.key": "Key signature",
  "palette.time": "Time signature",
  "palette.tempo": "Tempo",
  "palette.tempoPerMinute": "Quarter notes a minute",
  "palette.apply": "Apply",
  "palette.barlines": "Barlines and repeats",
  "palette.barline.startRepeat": "Start repeat",
  "palette.barline.endRepeat": "End repeat",
  "palette.barline.double": "Double barline",
  "palette.barline.final": "Final barline",
  "palette.barline.normal": "Normal barline",
  "palette.endings": "Endings",
  "palette.endingNumbers": "Ending numbers",
  "palette.jumps": "Jumps and markers",
  "palette.jump.segno": "Segno",
  "palette.jump.coda": "Coda",
  "palette.jump.toCoda": "To Coda",
  "palette.jump.fine": "Fine",
  "palette.jump.daCapo": "D.C.",
  "palette.jump.daCapoAlFine": "D.C. al Fine",
  "palette.jump.dalSegno": "D.S.",
  "palette.jump.dalSegnoAlCoda": "D.S. al Coda",
  "palette.measures": "Measures",
  "palette.measures.insert": "Insert a measure before",
  "palette.measures.append": "Add a measure at the end",
  "palette.measures.remove": "Remove the measure",

  "shortcuts.title": "Keyboard shortcuts",
} as const;

export type MessageKey = keyof typeof enGB;
export type Message = string | Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }>;
export type Strings = { readonly [key in MessageKey]: Message };
