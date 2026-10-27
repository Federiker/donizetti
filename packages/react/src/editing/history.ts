import { restoreScore, type ScoreDocument, scoreText } from "@donizetti/musicxml";

/** How many changes can be undone. */
const LIMIT = 200;

type Snapshot = { text: string; revision: number };

/**
 * Undo and redo for a score (decision 7): the score's text before each change (about 130 kB for 128 bars, so a
 * long history stays small), restored as a new document. The document is replaced on undo and redo; edits
 * change it in place.
 */
export class ScoreHistory {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];

  constructor(private current: ScoreDocument) {}

  get document(): ScoreDocument {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Runs a change on the document, remembering how it was before, and returns what the change returned. A change
   * that throws leaves the document as it was and nothing to undo.
   */
  change<T>(run: (document: ScoreDocument) => T): T {
    const before = { text: scoreText(this.current), revision: this.current.revision };
    let result: T;
    try {
      result = run(this.current);
    } catch (error) {
      if (scoreText(this.current) !== before.text)
        this.current = restoreScore(this.current, before.text, before.revision);
      throw error;
    }
    this.past.push(before);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
    return result;
  }

  undo(): boolean {
    const snapshot = this.past.pop();
    if (!snapshot) return false;
    this.future.push({ text: scoreText(this.current), revision: this.current.revision });
    this.current = restoreScore(this.current, snapshot.text, snapshot.revision);
    return true;
  }

  redo(): boolean {
    const snapshot = this.future.pop();
    if (!snapshot) return false;
    this.past.push({ text: scoreText(this.current), revision: this.current.revision });
    this.current = restoreScore(this.current, snapshot.text, snapshot.revision);
    return true;
  }
}
