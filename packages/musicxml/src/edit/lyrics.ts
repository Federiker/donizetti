import type { MappedNote, ScoreMap } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { childElements } from "../xml";
import { chordHead, editableMap, isTiedFrom, mappedNote, notesOf } from "./edit-context";
import { ScoreEditError } from "./edit-error";
import { createElement, edit, insertElement, insertInOrder, removeChildren, removeElement } from "./xml-edit";

/**
 * Where a syllable stands in its word (MusicXML's `<syllabic>`): `single` a word of its own, `begin` and
 * `middle` followed by a hyphen, `middle` and `end` preceded by one.
 */
export type Syllabic = "single" | "begin" | "middle" | "end";

/** An extender line (`<extend>`) as written: its `type` (start, continue, stop) or null when it has none. */
export type Extend = { type: "start" | "continue" | "stop" | null };

/** A `<lyric>` of a note, as written. */
export type Lyric = {
  element: Element;
  /** Its verse: the `number` attribute, "1" when there is none. */
  verse: string;
  /**
   * Its text: the syllables joined by their elisions (`<elision>`, an undertie ‿ when it is empty); empty for a
   * lyric that only carries an extender on from the note before.
   */
  text: string;
  /** The first syllable's place in its word (`single` when not written). */
  syllabic: Syllabic;
  /** Whether a hyphen joins it to the verse's lyric before it, and to the one after. */
  hyphenBefore: boolean;
  hyphenAfter: boolean;
  /** Several syllables on the note, joined by `<elision>`. */
  elided: boolean;
  /** Its extender line (a melisma), or null. MuseScore writes `<extend/>` on the lyric it starts from. */
  extend: Extend | null;
};

/** What `setLyric` writes. */
export type LyricInput = {
  /** The verse, "1" when not given (the `number` attribute, as MuseScore writes it). */
  verse?: string;
  text: string;
  /**
   * Whether a hyphen follows the syllable (MuseScore's `-`), which makes it `begin` or `middle`; a hyphen
   * before it comes from the verse's lyric before it. When not given, the hyphenation stays as it was.
   */
  hyphen?: boolean;
  /** Whether an extender line follows it (MuseScore's `_`): `<extend/>` on it. When not given, unchanged. */
  extend?: boolean;
};

const UNDERTIE = "‿";

type Syllable = { syllabic: Element | null; text: Element };

/** The syllables of a lyric: each `<text>` with the `<syllabic>` written before it, if any. */
function syllablesOf(lyric: Element): Syllable[] {
  const syllables: Syllable[] = [];
  let syllabic: Element | null = null;
  for (const child of Array.from(lyric.children)) {
    if (child.localName === "syllabic") syllabic = child;
    else if (child.localName === "text") {
      syllables.push({ syllabic, text: child });
      syllabic = null;
    } else if (child.localName === "elision") syllabic = null;
  }
  return syllables;
}

const syllabicText = (element: Element | null): Syllabic => {
  const value = (element?.textContent ?? "").trim();
  return value === "begin" || value === "middle" || value === "end" ? value : "single";
};

const hyphenBefore = (syllabic: Syllabic) => syllabic === "middle" || syllabic === "end";
const hyphenAfter = (syllabic: Syllabic) => syllabic === "begin" || syllabic === "middle";

/** The `<syllabic>` value of a syllable with or without a hyphen before and after it. */
function syllabicFor(before: boolean, after: boolean): Syllabic {
  if (before) return after ? "middle" : "end";
  return after ? "begin" : "single";
}

/** Reads a `<lyric>` element. */
export function readLyric(element: Element): Lyric {
  const syllables = syllablesOf(element);
  const parts: string[] = [];
  for (const child of Array.from(element.children)) {
    if (child.localName === "text") parts.push(child.textContent ?? "");
    else if (child.localName === "elision") parts.push(child.textContent || UNDERTIE);
  }
  const first = syllabicText(syllables[0]?.syllabic ?? null);
  const last = syllabicText(syllables.at(-1)?.syllabic ?? null);
  const extend = childElements(element, "extend")[0];
  const type = extend?.getAttribute("type");
  return {
    element,
    verse: element.getAttribute("number") ?? "1",
    text: parts.join(""),
    syllabic: first,
    hyphenBefore: syllables.length > 0 && hyphenBefore(first),
    hyphenAfter: syllables.length > 0 && hyphenAfter(last),
    elided: syllables.length > 1,
    extend: extend ? { type: type === "start" || type === "continue" || type === "stop" ? type : null } : null,
  };
}

/** A note's lyrics, in the order written. */
export function lyricsOf(note: Element): Lyric[] {
  return childElements(note, "lyric").map(readLyric);
}

/** A note's lyric in a verse ("1" by default), or null. */
export function lyricOf(note: Element, verse = "1"): Lyric | null {
  return lyricsOf(note).find((lyric) => lyric.verse === verse) ?? null;
}

/**
 * Why a note cannot take a lyric, or null when it can: lyrics go on notes, not on rests, grace notes or notes
 * tied from the one before (MuseScore skips those when moving to the next note). A chord's lyrics go on its
 * first note.
 */
export function lyricRefusal(note: MappedNote): "rest" | "grace" | "tied" | null {
  if (note.rest) return "rest";
  if (note.grace) return "grace";
  if (isTiedFrom(note.element)) return "tied";
  return null;
}

const takesLyrics = (note: MappedNote) => !note.chord && lyricRefusal(note) === null;

/**
 * The next note after this one that takes a lyric (MuseScore's Space and `-` in lyric entry), or null at the
 * end of the part: rests, grace notes, tied continuations and a chord's other notes are skipped.
 */
export function nextLyricNote(map: ScoreMap, note: Element): MappedNote | null {
  const notes = notesOf(map);
  const index = notes.indexOf(mappedNote(map, note));
  return notes.slice(index + 1).find(takesLyrics) ?? null;
}

/** The note before this one that takes a lyric (MuseScore's Shift+Space in lyric entry), or null. */
export function previousLyricNote(map: ScoreMap, note: Element): MappedNote | null {
  const notes = notesOf(map);
  const head = chordHead(map, mappedNote(map, note));
  return notes.slice(0, notes.indexOf(head)).reverse().find(takesLyrics) ?? null;
}

/** The verse's nearest syllables before and after a note: the lyrics its hyphens join it to. */
function neighbours(map: ScoreMap, head: MappedNote, verse: string): { before: Lyric | null; after: Lyric | null } {
  const notes = notesOf(map);
  const index = notes.indexOf(head);
  const withText = (note: MappedNote) => {
    const lyric = lyricOf(note.element, verse);
    return lyric && syllablesOf(lyric.element).length > 0 ? lyric : null;
  };
  let before: Lyric | null = null;
  for (let at = index - 1; at >= 0 && !before; at -= 1) before = withText(notes[at]!);
  let after: Lyric | null = null;
  for (let at = index + 1; at < notes.length && !after; at += 1) after = withText(notes[at]!);
  return { before, after };
}

/** Sets whether a hyphen comes before or after a lyric, changing only the `<syllabic>` on that side. */
function setHyphen(lyric: Element, side: "before" | "after", hyphen: boolean) {
  const syllables = syllablesOf(lyric);
  const syllable = side === "before" ? syllables[0] : syllables.at(-1);
  if (!syllable) return;
  const current = syllabicText(syllable.syllabic);
  const value =
    side === "before" ? syllabicFor(hyphen, hyphenAfter(current)) : syllabicFor(hyphenBefore(current), hyphen);
  if (value === current) return;
  if (syllable.syllabic) syllable.syllabic.textContent = value;
  else insertElement(lyric, createElement(lyric.ownerDocument, "syllabic", value), syllable.text);
}

/** The verse numbers in order: numerically when both are numbers. */
function verseAfter(verse: string, other: string): boolean {
  const [a, b] = [Number(verse), Number(other)];
  return Number.isFinite(a) && Number.isFinite(b) ? b > a : false;
}

/** The note that takes a lyric for a note given: the chord's first note, refused when it takes none. */
function lyricNote(map: ScoreMap, note: Element): MappedNote {
  const head = chordHead(map, mappedNote(map, note));
  const refusal = lyricRefusal(head);
  if (refusal) throw new ScoreEditError("lyric_not_allowed", { reason: refusal });
  return head;
}

/**
 * Writes a note's lyric in a verse, replacing the one there (its attributes, elisions and other children kept
 * where they still apply), and keeps the verse's hyphenation consistent: the syllable is `begin`, `middle`,
 * `end` or `single` from the hyphen before it (the verse's previous syllable) and after it, and the verse's
 * next syllable is changed to agree. Returns the `<lyric>`. A chord's lyric goes on its first note.
 */
export function setLyric(document: ScoreDocument, note: Element, input: LyricInput): Element {
  const map = editableMap(document);
  const head = lyricNote(map, note);
  if (input.text === "") throw new ScoreEditError("empty_lyric");
  const verse = input.verse ?? "1";
  const existing = lyricOf(head.element, verse);
  const { before, after } = neighbours(map, head, verse);
  const hasSyllables = existing !== null && syllablesOf(existing.element).length > 0;
  const hyphenBeforeIt = before?.hyphenAfter ?? false;
  const hyphenAfterIt = input.hyphen ?? (hasSyllables ? existing.hyphenAfter : (after?.hyphenBefore ?? false));
  const syllabic = syllabicFor(hyphenBeforeIt, hyphenAfterIt);
  return edit(document, (xml) => {
    let lyric: Element;
    if (existing && hasSyllables) {
      lyric = existing.element;
      if (existing.text !== input.text) {
        // New text replaces every syllable of the lyric (MuseScore writes an elided "a‿e" as one text).
        const [first, ...others] = syllablesOf(lyric);
        for (const other of others) {
          if (other.syllabic) removeElement(other.syllabic);
          removeElement(other.text);
        }
        removeChildren(lyric, "elision");
        first!.text.textContent = input.text;
      }
      setHyphen(lyric, "before", hyphenBeforeIt);
      setHyphen(lyric, "after", hyphenAfterIt);
    } else if (existing) {
      // A lyric carrying only an extender (or laughing, humming) on from the note before takes the syllable.
      lyric = existing.element;
      for (const name of ["extend", "laughing", "humming"]) removeChildren(lyric, name);
      insertInOrder(lyric, createElement(xml, "syllabic", syllabic), "lyric");
      insertInOrder(lyric, createElement(xml, "text", input.text), "lyric");
    } else {
      lyric = createElement(
        xml,
        "lyric",
        [createElement(xml, "syllabic", syllabic), createElement(xml, "text", input.text)],
        {
          number: verse,
        },
      );
      const later = childElements(head.element, "lyric").find((other) =>
        verseAfter(verse, other.getAttribute("number") ?? "1"),
      );
      if (later) insertElement(head.element, lyric, later);
      else insertInOrder(head.element, lyric, "note");
    }
    if (input.extend === true && childElements(lyric, "extend").length === 0) {
      insertInOrder(lyric, createElement(xml, "extend"), "lyric");
    } else if (input.extend === false) removeChildren(lyric, "extend");
    if (after && after.hyphenBefore !== hyphenAfterIt) setHyphen(after.element, "before", hyphenAfterIt);
    return lyric;
  });
}

/**
 * Removes a note's lyric in a verse ("1" by default). The hyphens around it stay consistent: a word whose last
 * syllable goes now ends on the syllable before (`begin` becomes `single`, `middle` becomes `end`), one whose
 * first syllable goes now begins on the syllable after.
 */
export function removeLyric(document: ScoreDocument, note: Element, verse = "1") {
  const map = editableMap(document);
  const head = chordHead(map, mappedNote(map, note));
  const lyric = lyricOf(head.element, verse);
  if (!lyric) throw new ScoreEditError("no_lyric", { verse });
  const { before, after } = neighbours(map, head, verse);
  edit(document, () => {
    if (before && lyric.hyphenBefore && !lyric.hyphenAfter) setHyphen(before.element, "after", false);
    if (after && lyric.hyphenAfter && !lyric.hyphenBefore) setHyphen(after.element, "before", false);
    removeElement(lyric.element);
  });
}

/**
 * Keeps each verse's hyphenation consistent across notes about to go (measures removed): where the syllables
 * before and after them disagree on the hyphen between them, neither keeps it.
 */
export function rejoinLyrics(map: ScoreMap, removed: Set<Element>) {
  const notes = notesOf(map);
  const first = notes.findIndex((note) => removed.has(note.element));
  if (first < 0) return;
  let last = first;
  while (last + 1 < notes.length && removed.has(notes[last + 1]!.element)) last += 1;
  const verses = new Set(
    notes.slice(first, last + 1).flatMap((note) => lyricsOf(note.element).map((lyric) => lyric.verse)),
  );
  for (const verse of verses) {
    const syllable = (note: MappedNote) => {
      const lyric = lyricOf(note.element, verse);
      return lyric && syllablesOf(lyric.element).length > 0 ? lyric : null;
    };
    const before =
      notes
        .slice(0, first)
        .map(syllable)
        .reverse()
        .find((lyric) => lyric !== null) ?? null;
    const after =
      notes
        .slice(last + 1)
        .map(syllable)
        .find((lyric) => lyric !== null) ?? null;
    if (before?.hyphenAfter && !after?.hyphenBefore) setHyphen(before.element, "after", false);
    if (after?.hyphenBefore && !before?.hyphenAfter) setHyphen(after.element, "before", false);
  }
}
