import type { Step } from "../score-map";
import { childElement, childElements, childNumber, childText } from "../xml";

/** MusicXML's chord kinds (`<kind>`), as the specification names them. */
export type HarmonyKind =
  | "major"
  | "minor"
  | "augmented"
  | "diminished"
  | "dominant"
  | "major-seventh"
  | "minor-seventh"
  | "diminished-seventh"
  | "augmented-seventh"
  | "half-diminished"
  | "major-minor"
  | "major-sixth"
  | "minor-sixth"
  | "dominant-ninth"
  | "major-ninth"
  | "minor-ninth"
  | "dominant-11th"
  | "major-11th"
  | "minor-11th"
  | "dominant-13th"
  | "major-13th"
  | "minor-13th"
  | "suspended-second"
  | "suspended-fourth"
  | "Neapolitan"
  | "Italian"
  | "French"
  | "German"
  | "pedal"
  | "power"
  | "Tristan"
  | "other"
  | "none";

/** A note name in a chord symbol: its letter and its alteration in semitones. */
export type ChordNote = { step: Step; alter: number };

/**
 * A note added to, altered in or taken from the chord its kind makes (`<degree>`): an added one's alteration
 * is from a dominant chord's (major and perfect intervals, a minor seventh), an altered one's from the note the
 * kind already has. One the kind's text already spells is not printed again.
 */
export type ChordDegree = { value: number; alter: number; type: "add" | "alter" | "subtract"; printed: boolean };

/** A chord symbol (`<harmony>`) as MusicXML describes it. */
export type ChordSymbol = {
  /** Its root; null for no chord (N.C.). */
  root: ChordNote | null;
  kind: HarmonyKind;
  /** How the kind is spelt (`<kind text>`), as typed, after its symbol when `useSymbols`; null when unwritten. */
  text: string | null;
  /** Whether the kind is drawn with its symbol (`use-symbols`): − minor, + augmented, ° diminished, ø half-diminished, Δ major seventh. */
  useSymbols: boolean;
  /** Whether its degrees are drawn in parentheses (`parentheses-degrees`). */
  parenthesesDegrees: boolean;
  degrees: ChordDegree[];
  /** The bass note of a slash chord, or null. */
  bass: ChordNote | null;
};

const STEPS = "ABCDEFG";

/** The degrees each kind's chord has, to tell an alteration (`b5` in C7b5) from an addition (`b9` in C7b9). */
const KIND_DEGREES: Record<HarmonyKind, readonly number[]> = {
  major: [1, 3, 5],
  minor: [1, 3, 5],
  augmented: [1, 3, 5],
  diminished: [1, 3, 5],
  dominant: [1, 3, 5, 7],
  "major-seventh": [1, 3, 5, 7],
  "minor-seventh": [1, 3, 5, 7],
  "diminished-seventh": [1, 3, 5, 7],
  "augmented-seventh": [1, 3, 5, 7],
  "half-diminished": [1, 3, 5, 7],
  "major-minor": [1, 3, 5, 7],
  "major-sixth": [1, 3, 5, 6],
  "minor-sixth": [1, 3, 5, 6],
  "dominant-ninth": [1, 3, 5, 7, 9],
  "major-ninth": [1, 3, 5, 7, 9],
  "minor-ninth": [1, 3, 5, 7, 9],
  "dominant-11th": [1, 3, 5, 7, 9, 11],
  "major-11th": [1, 3, 5, 7, 9, 11],
  "minor-11th": [1, 3, 5, 7, 9, 11],
  "dominant-13th": [1, 3, 5, 7, 9, 11, 13],
  "major-13th": [1, 3, 5, 7, 9, 11, 13],
  "minor-13th": [1, 3, 5, 7, 9, 11, 13],
  "suspended-second": [1, 2, 5],
  "suspended-fourth": [1, 4, 5],
  Neapolitan: [1, 3, 5],
  Italian: [1, 3, 6],
  French: [1, 3, 4, 6],
  German: [1, 3, 5, 6],
  pedal: [1],
  power: [1, 5],
  Tristan: [1, 4, 6, 9],
  other: [],
  none: [],
};

/** How each kind is usually spelt, for a `<harmony>` written without `text` (and to display one). */
const DEFAULT_TEXT: Record<HarmonyKind, string> = {
  major: "",
  minor: "m",
  augmented: "+",
  diminished: "dim",
  dominant: "7",
  "major-seventh": "maj7",
  "minor-seventh": "m7",
  "diminished-seventh": "dim7",
  "augmented-seventh": "+7",
  "half-diminished": "m7b5",
  "major-minor": "m(maj7)",
  "major-sixth": "6",
  "minor-sixth": "m6",
  "dominant-ninth": "9",
  "major-ninth": "maj9",
  "minor-ninth": "m9",
  "dominant-11th": "11",
  "major-11th": "maj11",
  "minor-11th": "m11",
  "dominant-13th": "13",
  "major-13th": "maj13",
  "minor-13th": "m13",
  "suspended-second": "sus2",
  "suspended-fourth": "sus4",
  Neapolitan: "N6",
  Italian: "It+6",
  French: "Fr+6",
  German: "Ger+6",
  pedal: "ped",
  power: "5",
  Tristan: "Tristan",
  other: "",
  none: "N.C.",
};

/** The symbol a kind is drawn with when `use-symbols` is yes; its text follows it. */
const KIND_SYMBOL: Partial<Record<HarmonyKind, string>> = {
  minor: "-",
  "minor-seventh": "-",
  "minor-sixth": "-",
  "minor-ninth": "-",
  "minor-11th": "-",
  "minor-13th": "-",
  "major-minor": "-",
  augmented: "+",
  "augmented-seventh": "+",
  diminished: "°",
  "diminished-seventh": "°",
  "half-diminished": "ø",
  "major-seventh": "Δ",
  "major-ninth": "Δ",
  "major-11th": "Δ",
  "major-13th": "Δ",
};

/** What follows a kind's symbol when it has no text: C−7, CΔ9, C°7 (C−, C+, C°, Cø, CΔ need none). */
const AFTER_SYMBOL: Partial<Record<HarmonyKind, string>> = {
  "minor-seventh": "7",
  "minor-sixth": "6",
  "minor-ninth": "9",
  "minor-11th": "11",
  "minor-13th": "13",
  "major-minor": "Δ7",
  "augmented-seventh": "7",
  "diminished-seventh": "7",
  "major-ninth": "9",
  "major-11th": "11",
  "major-13th": "13",
};

type Spelling = { kind: HarmonyKind; implied?: ReadonlyArray<readonly [number, number, ChordDegree["type"]]> };

const spellings = (kind: HarmonyKind, ...texts: string[]) => texts.map((text) => [text, { kind }] as const);

/** How a kind may be typed (without symbols), with the degrees a spelling such as "7sus4" implies. */
const TEXT_SPELLINGS = new Map<string, Spelling>([
  ...spellings("major", "", "maj", "Maj", "M", "ma"),
  ...spellings("minor", "m", "mi", "min"),
  ...spellings("augmented", "aug"),
  ...spellings("diminished", "dim", "o"),
  ...spellings("dominant", "7"),
  ...spellings("major-seventh", "maj7", "Maj7", "MA7", "M7", "ma7"),
  ...spellings("minor-seventh", "m7", "mi7", "min7"),
  ...spellings("diminished-seventh", "dim7", "o7"),
  ...spellings("augmented-seventh", "aug7"),
  ...spellings("half-diminished", "m7b5", "mi7b5", "min7b5", "m7(b5)"),
  ...spellings("major-minor", "mMaj7", "mmaj7", "mM7", "m(maj7)", "m(Maj7)", "m(M7)", "minMaj7", "min(maj7)"),
  ...spellings("major-sixth", "6", "maj6", "M6"),
  ...spellings("minor-sixth", "m6", "mi6", "min6"),
  ...spellings("dominant-ninth", "9"),
  ...spellings("major-ninth", "maj9", "Maj9", "M9", "ma9"),
  ...spellings("minor-ninth", "m9", "mi9", "min9"),
  ...spellings("dominant-11th", "11"),
  ...spellings("major-11th", "maj11", "Maj11", "M11"),
  ...spellings("minor-11th", "m11", "mi11", "min11"),
  ...spellings("dominant-13th", "13"),
  ...spellings("major-13th", "maj13", "Maj13", "M13"),
  ...spellings("minor-13th", "m13", "mi13", "min13"),
  ...spellings("suspended-second", "sus2"),
  ...spellings("suspended-fourth", "sus4", "sus"),
  ...spellings("power", "5"),
  // Spellings that name the kind and degrees together (MusicXML's own example is "13sus").
  ["2", { kind: "major", implied: [[2, 0, "add"]] }],
  ["6/9", { kind: "major-sixth", implied: [[9, 0, "add"]] }],
  ["69", { kind: "major-sixth", implied: [[9, 0, "add"]] }],
  ["m6/9", { kind: "minor-sixth", implied: [[9, 0, "add"]] }],
  ["m69", { kind: "minor-sixth", implied: [[9, 0, "add"]] }],
  ["7sus2", { kind: "suspended-second", implied: [[7, 0, "add"]] }],
  ["7sus4", { kind: "suspended-fourth", implied: [[7, 0, "add"]] }],
  ["7sus", { kind: "suspended-fourth", implied: [[7, 0, "add"]] }],
  [
    "9sus4",
    {
      kind: "suspended-fourth",
      implied: [
        [7, 0, "add"],
        [9, 0, "add"],
      ],
    },
  ],
  [
    "9sus",
    {
      kind: "suspended-fourth",
      implied: [
        [7, 0, "add"],
        [9, 0, "add"],
      ],
    },
  ],
  [
    "13sus4",
    {
      kind: "suspended-fourth",
      implied: [
        [7, 0, "add"],
        [9, 0, "add"],
        [13, 0, "add"],
      ],
    },
  ],
  [
    "13sus",
    {
      kind: "suspended-fourth",
      implied: [
        [7, 0, "add"],
        [9, 0, "add"],
        [13, 0, "add"],
      ],
    },
  ],
  // An altered dominant, written with the degrees MuseScore 4 gives it.
  [
    "7alt",
    {
      kind: "dominant",
      implied: [
        [5, -1, "alter"],
        [5, 1, "add"],
        [9, -1, "add"],
        [9, 1, "add"],
      ],
    },
  ],
]);

/** How a kind may be typed after its symbol (`use-symbols`): C−7, C+, D°, Dø7, CΔ7. */
const SYMBOL_SPELLINGS: Record<string, Record<string, HarmonyKind>> = {
  "-": {
    "": "minor",
    "7": "minor-seventh",
    "6": "minor-sixth",
    "9": "minor-ninth",
    "11": "minor-11th",
    "13": "minor-13th",
    maj7: "major-minor",
    Maj7: "major-minor",
    M7: "major-minor",
    "(maj7)": "major-minor",
    Δ7: "major-minor",
    Δ: "major-minor",
  },
  "+": { "": "augmented", "7": "augmented-seventh" },
  "°": { "": "diminished", "7": "diminished-seventh" },
  ø: { "": "half-diminished", "7": "half-diminished" },
  Δ: { "": "major-seventh", "7": "major-seventh", "9": "major-ninth", "11": "major-11th", "13": "major-13th" },
};

/** Characters typed several ways, each read as one: ♭ and ♯, the minus sign, the triangle, the degree signs. */
const VARIANTS: Record<string, string> = { "♭": "b", "♯": "#", "−": "-", "△": "Δ", º: "°", Ø: "ø" };

const NO_CHORD = /^(N\.?\s?C\.?|no chord)$/i;

/** An accidental as an alteration: "b" −1, "bb" −2, "#" 1, "##" or "x" 2. */
function alterOf(accidental: string): number {
  if (accidental === "x") return 2;
  return [...accidental].reduce((sum, character) => sum + (character === "#" ? 1 : -1), 0);
}

/**
 * The kind spelt at the start of a chord's extension (what follows its root), the longest spelling first: its
 * kind, the text it is written with, whether with its symbol, the degrees it implies and where it ends.
 */
function kindAt(
  normal: string,
  typed: string,
): { kind: HarmonyKind; text: string; useSymbols: boolean; implied: ChordDegree[]; end: number } | null {
  const symbol = normal[0];
  if (symbol && SYMBOL_SPELLINGS[symbol]) {
    const table = SYMBOL_SPELLINGS[symbol]!;
    const spelling = Object.keys(table)
      .filter((candidate) => normal.startsWith(candidate, 1))
      .sort((a, b) => b.length - a.length)[0];
    if (spelling !== undefined) {
      return {
        kind: table[spelling]!,
        text: typed.slice(1, 1 + spelling.length),
        useSymbols: true,
        implied: [],
        end: 1 + spelling.length,
      };
    }
  }
  const spelling = [...TEXT_SPELLINGS.keys()]
    .filter((candidate) => normal.startsWith(candidate))
    .sort((a, b) => b.length - a.length)[0];
  if (spelling === undefined) return null;
  const { kind, implied = [] } = TEXT_SPELLINGS.get(spelling)!;
  return {
    kind,
    text: typed.slice(0, spelling.length),
    useSymbols: false,
    implied: implied.map(([value, alter, type]) => ({ value, alter, type, printed: false })),
    end: spelling.length,
  };
}

const DEGREE = /^(add|no|omit)?(bb|##|b|#|\+|-)?(\d{1,2})/;
const DEGREE_VALUES = new Set([1, 2, 3, 4, 5, 6, 7, 9, 11, 13]);

/** The degrees typed after the kind (b9, #11, add9, no3, in parentheses or not), or null when not all are. */
function degreesAt(
  normal: string,
  kind: HarmonyKind,
  implied: ChordDegree[],
): { degrees: ChordDegree[]; parentheses: boolean } | null {
  const degrees: ChordDegree[] = [];
  let parentheses = false;
  let at = 0;
  const present = new Set([...KIND_DEGREES[kind], ...implied.map((degree) => degree.value)]);
  while (at < normal.length) {
    const character = normal[at]!;
    if ("(),".includes(character) || character === " ") {
      if (character === "(") parentheses = true;
      at += 1;
      continue;
    }
    const match = DEGREE.exec(normal.slice(at));
    if (!match) return null;
    const [whole, keyword, accidental = "", digits] = match;
    const value = Number(digits);
    if (!DEGREE_VALUES.has(value)) return null;
    const alter = accidental === "+" ? 1 : accidental === "-" ? -1 : alterOf(accidental);
    if (keyword === "no" || keyword === "omit") {
      if (alter !== 0) return null;
      degrees.push({ value, alter: 0, type: "subtract", printed: true });
    } else if (keyword === "add" || !present.has(value) || alter === 0) {
      degrees.push({ value, alter, type: "add", printed: true });
    } else degrees.push({ value, alter, type: "alter", printed: true });
    at += whole.length;
  }
  return { degrees, parentheses };
}

/** A note name at the start of the text: its letter and accidentals, or null. */
function noteAt(normal: string): (ChordNote & { length: number }) | null {
  const match = /^([A-G])(bb|##|b|#|x)?/.exec(normal);
  if (!match) return null;
  return { step: match[1] as Step, alter: alterOf(match[2] ?? ""), length: match[0].length };
}

/**
 * Reads a chord symbol as a user types it (C, Am7, F/A, Bb7b9, F#m7b5, Csus4, Gmaj7, C6/9, D°, Dø7, C+,
 * Cdim7, E7#9, N.C.…) into MusicXML's terms: the root, the kind with the text typed for it (as MuseScore keeps
 * it), the degrees added or altered, the bass. Null when it is not a chord symbol Donizetti reads: text that
 * is not understood is refused, never guessed at.
 */
export function parseChordSymbol(input: string): ChordSymbol | null {
  const typed = input.trim();
  if (NO_CHORD.test(typed)) {
    return {
      root: null,
      kind: "none",
      text: typed,
      useSymbols: false,
      parenthesesDegrees: false,
      degrees: [],
      bass: null,
    };
  }
  // The same characters, each written one way; every variant is one character, so positions match the typed text.
  const normal = [...typed].map((character) => VARIANTS[character] ?? character).join("");
  if (normal.length !== typed.length) return null;
  const root = noteAt(normal);
  if (!root) return null;
  let end = normal.length;
  let bass: ChordNote | null = null;
  const slash = /\/([A-G](?:bb|##|b|#|x)?)$/.exec(normal);
  if (slash) {
    const note = noteAt(slash[1]!)!;
    bass = { step: note.step, alter: note.alter };
    end = slash.index;
  }
  const extension = normal.slice(root.length, end);
  const kind = kindAt(extension, typed.slice(root.length, end));
  if (!kind) return null;
  const rest = degreesAt(extension.slice(kind.end), kind.kind, kind.implied);
  if (!rest) return null;
  return {
    root: { step: root.step, alter: root.alter },
    kind: kind.kind,
    text: kind.text === "" ? null : kind.text,
    useSymbols: kind.useSymbols,
    parenthesesDegrees: rest.parentheses,
    degrees: [...kind.implied, ...rest.degrees],
    bass,
  };
}

const KINDS = new Set(Object.keys(KIND_DEGREES));

/** A note name as written in a `<harmony>`: `<root-step>`/`<root-alter>` or `<bass-step>`/`<bass-alter>`. */
function readNote(parent: Element | null, prefix: "root" | "bass"): ChordNote | null {
  if (!parent) return null;
  const step = childText(parent, `${prefix}-step`) ?? "";
  if (step.length !== 1 || !STEPS.includes(step)) return null;
  return { step: step as Step, alter: childNumber(parent, `${prefix}-alter`) ?? 0 };
}

/**
 * Reads a `<harmony>` written by any program, or null when it has no root (a Roman numeral or a function) or a
 * kind MusicXML does not name.
 */
export function readChordSymbol(harmony: Element): ChordSymbol | null {
  const kindElement = childElement(harmony, "kind");
  const kind = (kindElement?.textContent ?? "").trim();
  if (!kindElement || !KINDS.has(kind)) return null;
  const root = readNote(childElement(harmony, "root"), "root");
  if (!root && kind !== "none") return null;
  const degrees = childElements(harmony, "degree").map((degree): ChordDegree => {
    const type = childText(degree, "degree-type");
    return {
      value: childNumber(degree, "degree-value") ?? 0,
      alter: childNumber(degree, "degree-alter") ?? 0,
      type: type === "alter" || type === "subtract" ? type : "add",
      printed: degree.getAttribute("print-object") !== "no",
    };
  });
  return {
    root: kind === "none" ? null : root,
    kind: kind as HarmonyKind,
    text: kindElement.getAttribute("text"),
    useSymbols: kindElement.getAttribute("use-symbols") === "yes",
    parenthesesDegrees: kindElement.getAttribute("parentheses-degrees") === "yes",
    degrees,
    bass: readNote(childElement(harmony, "bass"), "bass"),
  };
}

const noteText = (note: ChordNote) =>
  note.step + (note.alter < 0 ? "b".repeat(-note.alter) : "#".repeat(Math.max(0, note.alter)));

function degreeText(degree: ChordDegree): string {
  const accidental = degree.alter < 0 ? "b".repeat(-degree.alter) : "#".repeat(Math.max(0, degree.alter));
  if (degree.type === "subtract") return `no${degree.value}`;
  if (degree.type === "add" && degree.alter === 0) return `add${degree.value}`;
  return accidental + degree.value;
}

/** How the kind is shown: its symbol and text as written, or its usual spelling when the text does not spell it. */
function kindText(symbol: ChordSymbol): string {
  const prefix = symbol.useSymbols ? (KIND_SYMBOL[symbol.kind] ?? "") : "";
  if (symbol.text !== null) {
    const shown = prefix + symbol.text;
    // MuseScore writes "4" for a sus4 chord's text; a text read back as another kind is not trusted.
    const reread = parseChordSymbol(`C${shown}`);
    if (symbol.kind === "other" || reread?.kind === symbol.kind) return shown;
  }
  return prefix === "" ? DEFAULT_TEXT[symbol.kind] : prefix + (AFTER_SYMBOL[symbol.kind] ?? "");
}

/**
 * A chord symbol as text a user may type and read back (`parseChordSymbol`): the root, the kind as written
 * (its symbol and text), the degrees printed, the bass. For no chord, its text (N.C.).
 */
export function chordSymbolText(symbol: ChordSymbol): string {
  if (symbol.kind === "none" || !symbol.root) return symbol.text || DEFAULT_TEXT.none;
  const printed = symbol.degrees.filter((degree) => degree.printed).map(degreeText);
  const degrees = printed.length > 0 && symbol.parenthesesDegrees ? `(${printed.join(",")})` : printed.join("");
  return noteText(symbol.root) + kindText(symbol) + degrees + (symbol.bass ? `/${noteText(symbol.bass)}` : "");
}

/**
 * The text of a `<harmony>` from any program, to edit it: its chord symbol's text, a Roman numeral's or
 * function's text, or an empty string when there is nothing to show.
 */
export function harmonyText(harmony: Element): string {
  const symbol = readChordSymbol(harmony);
  if (symbol) return chordSymbolText(symbol);
  const numeral = childElement(harmony, "numeral");
  const numeralRoot = numeral ? childElement(numeral, "numeral-root") : null;
  if (numeralRoot) return numeralRoot.getAttribute("text") ?? (numeralRoot.textContent ?? "").trim();
  return childText(harmony, "function") ?? childElement(harmony, "kind")?.getAttribute("text") ?? "";
}
