import type { ScoreDocument } from "../score-document";
import { childElement } from "../xml";
import { ScoreEditError } from "./edit-error";
import { type NoteLength, noteLengthOf, wholeNotesOf, writtenLength } from "./lengths";
import { finish, noChanges, operate, pitchesChanged } from "./operation";
import { checkLength, type NoteEdit, placeOf, positionAt, writeSpan } from "./overwrite";
import { notePitch } from "./note-elements";
import { chordOf, hasTie, tieNotes, tiePartner, untie } from "./ties";

/**
 * Ties a note to the next one of the same pitch, or unties it when it is tied (T on a selected note). Ties are
 * written as `<tie>` and `<notations><tied>`, across barlines too. Returns the note it is now tied to, or null
 * when the tie was removed; throws `no_tie_partner` when the next chord has no note of its pitch.
 */
export function toggleTie(document: ScoreDocument, note: Element): Element | null {
  return operate(document, [note], (root, [target]) => {
    const element = target!;
    if (!notePitch(element)) throw new ScoreEditError("not_a_note");
    const changes = noChanges();
    if (hasTie(element, "start")) {
      pitchesChanged(changes, root, [element, ...untie(element, ["start"])]);
      finish(root, changes);
      return null;
    }
    const partner = tiePartner(element, "start");
    if (!partner) throw new ScoreEditError("no_tie_partner");
    tieNotes(element, partner);
    pitchesChanged(changes, root, [partner]);
    finish(root, changes);
    return partner;
  });
}

/**
 * T in note input, as MuseScore does: adds after a note's chord a chord of the same pitches tied to it, of its
 * length unless another is given, overwriting what follows (as `writeNote`, across the barline too). Returns the
 * notes written and the cursor's next position.
 */
export function addTiedNote(document: ScoreDocument, note: Element, length?: NoteLength): NoteEdit {
  if (length) checkLength(length);
  return operate(document, [note], (root, [target]) => {
    const chord = chordOf(target!).filter((member) => notePitch(member) !== null);
    if (chord.length === 0 || childElement(target!, "grace")) throw new ScoreEditError("not_a_note");
    const place = placeOf(root, target!);
    const written = length ?? writtenLength(chord[0]!) ?? noteLengthOf(place.length);
    if (!written) throw new ScoreEditError("unsupported_rhythm", { measure: String(place.measure) });
    const changes = noChanges();
    const { pieces, next } = writeSpan(
      root,
      positionAt(place.map, place.measure, place.onset + place.length),
      wholeNotesOf(written),
      { pitches: chord.map((member) => notePitch(member)!), length: written, continuesTie: true },
      changes,
    );
    for (const [index, member] of chord.entries()) {
      if (hasTie(member, "start")) untie(member, ["start"]);
      tieNotes(member, pieces[0]![index]!);
    }
    finish(root, changes);
    return { notes: pieces.map((piece) => piece[0]!), next };
  });
}
