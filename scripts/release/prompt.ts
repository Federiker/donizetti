// Questions at the terminal for `mise run tag`: each answer is the next line of standard input,
// typed or piped in, so the script works the same in PowerShell, Git Bash and a test. The terminal
// echoes what is typed (the lines are read as they come, not edited here).
import { createInterface, type Interface } from "node:readline";

let reader: Interface | undefined;
let ended = false;
const lines: string[] = [];
const waiting: ((line: string | null) => void)[] = [];

function start(): Interface {
  const created = createInterface({ input: process.stdin, terminal: false });
  created.on("line", (line) => {
    const next = waiting.shift();
    if (next) next(line);
    else lines.push(line);
  });
  created.on("close", () => {
    ended = true;
    for (const next of waiting.splice(0)) next(null);
  });
  return created;
}

/** Asks a question; the answer as typed, or null when the input has ended (Ctrl+Z, Ctrl+D, a pipe's end). */
export function ask(question: string): Promise<string | null> {
  reader ??= start();
  process.stdout.write(question);
  const line = lines.shift();
  if (line !== undefined) return Promise.resolve(line);
  if (ended) return Promise.resolve(null);
  return new Promise((resolve) => waiting.push(resolve));
}

/** Whether an answer is yes: `y` or `yes`, or nothing when yes is the default. */
export function isYes(answer: string, byDefault: boolean): boolean {
  const text = answer.trim().toLowerCase();
  return text === "" ? byDefault : text === "y" || text === "yes";
}

/** Stops reading the input, so the script can end and a program it runs has the terminal. */
export function stopAsking() {
  reader?.close();
  reader = undefined;
}
