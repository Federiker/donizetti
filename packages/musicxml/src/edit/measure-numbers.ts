import { childElements } from "../xml";

/**
 * How a part's measures are numbered, read before measures are added or removed: the first number when they are
 * plain integers counting up by one (1, 2, 3… from any start, a pickup's 0 included), else null.
 */
export function plainNumbering(part: Element): number | null {
  const numbers = childElements(part, "measure").map((measure) => measure.getAttribute("number") ?? "");
  if (!numbers.every((number) => /^\d+$/.test(number))) return null;
  const first = Number(numbers[0] ?? 1);
  return numbers.every((number, index) => Number(number) === first + index) ? first : null;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** The letters of the `index`-th lettered measure after a number: a to z, then aa, bb… */
const lettersAt = (index: number) => LETTERS[index % LETTERS.length]!.repeat(1 + Math.floor(index / LETTERS.length));

/** Where letters stand in that order (a is 0, aa 26), or -1 when the text is not such letters. */
function letterIndex(letters: string): number {
  if (!/^([a-z])\1*$/.test(letters)) return -1;
  return (letters.length - 1) * LETTERS.length + LETTERS.indexOf(letters[0]!);
}

/**
 * The measures lettered after one measure, the run's head (or after the start of the part): the new ones and,
 * when the head's number has no letters (12, or the start, as 0), the old ones numbered `<base><letters>` (12a,
 * 12b; 0a, 0b), which are Donizetti's. Any other number is the file's and heads the next run.
 */
interface Run {
  /** The number the letters follow: 12 after 12 or 12a, 0 at the start. */
  base: string;
  /** The head's letter index (12a is 0), -1 when it has none: the members' letters come after it. */
  after: number;
  /** Whether old measures numbered `<base><letters>` belong to the run, not only new ones. */
  lettered: boolean;
  members: Element[];
}

/** The run after a measure numbered `head` (null for the start of the part). */
function runAfter(head: string | null): Run {
  if (head === null) return { base: "0", after: -1, lettered: true, members: [] };
  const match = /^(.*\d)([a-z]+)$/.exec(head);
  const after = match ? letterIndex(match[2]!) : -1;
  if (after < 0) return { base: head, after: -1, lettered: true, members: [] };
  return { base: match![1]!, after, lettered: false, members: [] };
}

/**
 * Letters a run that gained measures so its letters follow page order: each member takes the next letter after
 * the one before it, skipping numbers other measures have, unless it already has a later letter. So a new measure
 * before 0a becomes 0a and the old 0a becomes 0b, and members after a gap keep their letters.
 */
function letterRun(run: Run, measures: Element[], fresh: Set<Element>) {
  if (!run.members.some((member) => fresh.has(member))) return;
  const inRun = new Set(run.members);
  const taken = new Set(
    measures.filter((measure) => !inRun.has(measure)).map((measure) => measure.getAttribute("number") ?? ""),
  );
  let previous = run.after;
  for (const member of run.members) {
    const own = fresh.has(member) ? -1 : letterIndex((member.getAttribute("number") ?? "").slice(run.base.length));
    if (own > previous) {
      previous = own;
      continue;
    }
    let index = previous + 1;
    while (taken.has(run.base + lettersAt(index))) index += 1;
    const number = run.base + lettersAt(index);
    if (member.getAttribute("number") !== number) member.setAttribute("number", number);
    previous = index;
  }
}

/**
 * Numbers a part's measures after measures were added or removed (owner decisions, 27 October 2026): measures
 * that were numbered 1, 2, 3… (`first`, from `plainNumbering` before the change) are numbered so again from the
 * same start. Otherwise each new measure (`added`) takes the number of the measure before it with a letter (12a,
 * 12b; 0a, 0b… first), never refused, and the letters follow page order: the lettered measures after the same
 * number are lettered again where needed (a new measure before 12a is 12a, the old 12a 12b). The numbers the file
 * gave and those of runs that gained no measure are kept, so removing measures renumbers none.
 */
export function numberMeasures(part: Element, first: number | null, added: Iterable<Element>) {
  const measures = childElements(part, "measure");
  if (first !== null) {
    for (const [index, measure] of measures.entries()) {
      const number = String(first + index);
      if (measure.getAttribute("number") !== number) measure.setAttribute("number", number);
    }
    return;
  }
  const fresh = new Set(added);
  if (fresh.size === 0) return;
  let run = runAfter(null);
  for (const measure of measures) {
    const number = measure.getAttribute("number") ?? "";
    const lettered = run.lettered && number.startsWith(run.base) && letterIndex(number.slice(run.base.length)) >= 0;
    if (fresh.has(measure) || lettered) {
      run.members.push(measure);
      continue;
    }
    letterRun(run, measures, fresh);
    run = runAfter(number);
  }
  letterRun(run, measures, fresh);
}
