// The commit-msg hook (lefthook.yml): the first line must start with a known [prefix] and some
// words, e.g. "[fix] Keep the caret after undo". What each prefix means is in the README's
// "Git conventions". Git's own merge, revert and fixup messages are let through.
import { readFileSync } from "node:fs";

const prefixes = [
  "add",
  "fix",
  "remove",
  "refactor",
  "rename",
  "perf",
  "look",
  "strings",
  "docs",
  "test",
  "fmt",
  "build",
  "deps",
  "security",
  "release",
  "revert",
  "init",
];

const file = process.argv[2];
if (!file) {
  console.error("Usage: bun scripts/commit-message.ts <commit message file>");
  process.exit(2);
}
const firstLine =
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((line) => line.trim() !== "" && !line.startsWith("#")) ?? "";

const gitOwn = /^(Merge |Revert "|fixup! |squash! |amend! )/;
const prefixed = new RegExp(`^\\[(${prefixes.join("|")})\\] \\S`);
if (gitOwn.test(firstLine) || prefixed.test(firstLine)) process.exit(0);

console.error(`The commit message should start with a prefix and a space, e.g. "[fix] Keep the caret after undo".`);
console.error(`Prefixes: ${prefixes.map((prefix) => `[${prefix}]`).join(" ")}`);
console.error(`What each one means: README.md, "Git conventions". First line was: "${firstLine}"`);
process.exit(1);
