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

/** The letters of the `index`-th new measure after a number: a to z, then aa, bb… */
const lettersAt = (index: number) => LETTERS[index % LETTERS.length]!.repeat(1 + Math.floor(index / LETTERS.length));

/**
 * The number of a new measure after one numbered `previous` (null when it goes first, after "0"): the number
 * with the next letter not already taken, so 12a after 12, 12b after 12a or after 12 when 12a is taken.
 */
function letteredAfter(previous: string | null, taken: Set<string>): string {
  const before = previous ?? "0";
  const match = /^(.*\d)(([a-z])\3*)$/.exec(before);
  const base = match ? match[1]! : before;
  let index = match ? (match[2]!.length - 1) * LETTERS.length + LETTERS.indexOf(match[3]!) + 1 : 0;
  while (taken.has(base + lettersAt(index))) index += 1;
  return base + lettersAt(index);
}

/**
 * Numbers a part's measures after measures were added or removed (owner decision, 27 October 2026): measures
 * that were numbered 1, 2, 3… (`first`, from `plainNumbering` before the change) are numbered so again from the
 * same start; otherwise every measure keeps its number and each new one (`added`) takes the number of the measure
 * before it with a letter (12a, 12b), never refused.
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
  const taken = new Set(
    measures.filter((measure) => !fresh.has(measure)).map((measure) => measure.getAttribute("number") ?? ""),
  );
  let previous: string | null = null;
  for (const measure of measures) {
    if (fresh.has(measure)) {
      const number = letteredAfter(previous, taken);
      taken.add(number);
      if (measure.getAttribute("number") !== number) measure.setAttribute("number", number);
    }
    previous = measure.getAttribute("number");
  }
}
