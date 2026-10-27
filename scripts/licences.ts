// The npm packages' licences (`mise run licences`): Donizetti is CC0-1.0, so every package it installs
// must be under a permissive licence (owner decision, 27 October 2026; see docs/development.md,
// decision 1). Reads each installed package's package.json; a package under any other licence fails
// until the owner approves it here.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const allowed = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "Python-2.0",
  "Unlicense",
  "Zlib",
]);
/** Packages whose licence field is missing or unusual, checked by hand: name → why it is allowed. */
const reviewed: Record<string, string> = {};

const root = join(import.meta.dirname, "..");
const modules = join(root, "node_modules");

function licenceOf(manifest: { license?: unknown; licenses?: unknown }): string {
  const { license, licenses } = manifest;
  if (typeof license === "string") return license;
  if (license && typeof license === "object" && "type" in license) return String(license.type);
  if (Array.isArray(licenses)) return licenses.map((entry) => entry?.type ?? entry).join(" OR ");
  return "";
}

/** Whether an SPDX expression is satisfied by allowed licences (an OR needs one side, an AND both). */
function permitted(expression: string): boolean {
  const plain = expression.replace(/[()]/g, " ").trim();
  if (plain === "") return false;
  return plain.split(/\s+OR\s+/).some((side) => side.split(/\s+AND\s+/).every((name) => allowed.has(name.trim())));
}

const problems: string[] = [];
let checked = 0;
function visit(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.name.startsWith("@")) {
      visit(path);
      continue;
    }
    const manifestPath = join(path, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name !== "string" || manifest.name.startsWith("@donizetti/")) continue;
    checked += 1;
    const licence = licenceOf(manifest);
    if (!permitted(licence) && !(manifest.name in reviewed)) problems.push(`${manifest.name}: "${licence}"`);
  }
}
visit(modules);
visit(join(modules, ".bun", "node_modules"));

if (problems.length > 0) {
  console.error(`Packages under a licence not on the list (scripts/licences.ts):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`${checked} packages, every one under a permissive licence.`);
