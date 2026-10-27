import { mapScore, midiOf, type Pitch } from "../score-map";
import type { ScoreDocument } from "../score-document";
import { childElement, childElements, childNumber } from "../xml";
import { ScoreEditError } from "./edit-error";
import { writtenLength } from "./lengths";
import { createNote, notePitch, templateOfNote } from "./note-elements";
import { type Changes, finish, measureIndexOf, noChanges, operate, pitchesChanged } from "./operation";
import { checkPitch } from "./overwrite";
import { chordOf, nextChord, previousChord, untie } from "./ties";
import { createElement, insertElement, insertInOrder, removeChildren, removeElement, stripLayout } from "./xml-edit";

/**
 * Adds a note of this pitch to a note's chord (Alt+1–9 and Shift+A–G in note input), after the chord's last note,
 * with its length and stem; the chord's ties and lyrics stay where they are. Returns the new note.
 */
export function addChordNote(document: ScoreDocument, note: Element, pitch: Pitch): Element {
  checkPitch(pitch);
  return operate(document, [note], (root, [target]) => {
    const chord = chordOf(target!);
    const first = chord[0]!;
    if (childElement(first, "rest") || childElement(first, "grace")) throw new ScoreEditError("not_a_note");
    const midi = midiOf(pitch);
    if (chord.some((member) => notePitch(member) && midiOf(notePitch(member)!) === midi)) {
      throw new ScoreEditError("duplicate_pitch");
    }
    const added = createNote(root.ownerDocument, templateOfNote(first), {
      pitch,
      chord: true,
      duration: childNumber(first, "duration") ?? 0,
      length: writtenLength(first),
    });
    const tuplet = childElement(first, "time-modification");
    if (tuplet) insertInOrder(added, stripLayout(tuplet.cloneNode(true) as Element), "note");
    const stem = childElement(first, "stem");
    const own = childElement(added, "stem");
    if (stem && own) own.textContent = stem.textContent;
    const last = chord.at(-1)!;
    insertElement(last.parentElement!, added, last.nextElementSibling);
    const changes = noChanges();
    changes.notes.add(added);
    pitchesChanged(changes, root, [added]);
    finish(root, changes);
    return added;
  });
}

/** Moves what belongs to a chord rather than to one of its notes (lyrics, notations other than ties) to another note. */
function handOver(from: Element, to: Element) {
  for (const lyric of childElements(from, "lyric")) insertInOrder(to, stripLayout(lyric), "note");
  const notations = childElement(from, "notations");
  if (!notations) return;
  const kept = Array.from(notations.children).filter((child) => child.localName !== "tied");
  if (kept.length === 0) return;
  const target = childElement(to, "notations");
  if (target) for (const child of kept) insertElement(target, stripLayout(child));
  else insertInOrder(to, createElement(to.ownerDocument, "notations", kept.map(stripLayout)), "note");
}

/** Removes a note from its chord, its ties undone; when it is the chord's first, the next note takes its place. */
function removeFromChord(root: Element, note: Element, changes: Changes): Element {
  const chord = chordOf(note);
  const measure = measureIndexOf(mapScore(root)!, note);
  pitchesChanged(changes, root, untie(note));
  let first = chord[0]!;
  if (note === first) {
    first = chord[1]!;
    removeChildren(first, "chord");
    handOver(note, first);
    changes.rhythm.add(measure);
  }
  removeElement(note);
  for (const member of chord) if (member !== note) changes.notes.add(member);
  changes.pitches.add(measure);
  return first;
}

/**
 * Removes a note from its chord (Delete on a note of a chord), leaving the chord's other notes; its ties are undone
 * at both ends. Throws `not_a_chord` for a note alone. Returns the chord's first note.
 */
export function removeChordNote(document: ScoreDocument, note: Element): Element {
  return operate(document, [note], (root, [target]) => {
    if (chordOf(target!).length < 2) throw new ScoreEditError("not_a_chord");
    const changes = noChanges();
    const first = removeFromChord(root, target!, changes);
    finish(root, changes);
    return first;
  });
}

/**
 * Turns a note into a rest of its length (Delete), as MuseScore does: a note of a chord is removed from it
 * instead (`removeChordNote`). Its ties are undone at both ends; its lyrics, accidental, stem and beams go (the
 * measure is beamed again); everything else it carries stays. Throws `not_a_note` for a rest or a grace note.
 * Returns the rest, or the chord's first note.
 */
export function toRest(document: ScoreDocument, note: Element): Element {
  return operate(document, [note], (root, [target]) => {
    const element = target!;
    if (!childElement(element, "pitch") || childElement(element, "grace")) throw new ScoreEditError("not_a_note");
    const changes = noChanges();
    if (chordOf(element).length > 1) {
      const first = removeFromChord(root, element, changes);
      finish(root, changes);
      return first;
    }
    const measure = measureIndexOf(mapScore(root)!, element);
    pitchesChanged(changes, root, untie(element));
    const neighbours = [...(previousChord(element) ?? []), ...(nextChord(element) ?? [])];
    const pitch = childElement(element, "pitch")!;
    insertElement(element, createElement(element.ownerDocument, "rest"), pitch);
    removeElement(pitch);
    for (const name of ["accidental", "stem", "notehead", "beam", "lyric"]) removeChildren(element, name);
    for (const neighbour of neighbours) changes.notes.add(neighbour);
    changes.rhythm.add(measure);
    finish(root, changes);
    return element;
  });
}
