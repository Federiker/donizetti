// Removes the build outputs (`mise run clean`): every package's dist, the coverage reports, the
// TypeScript caches and, with --rust, Cargo's target folder. Never touches tmp/.
import { globSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const targets = [
  ...globSync("packages/*/dist", { cwd: root }),
  ...globSync("packages/*/coverage", { cwd: root }),
  "coverage",
  "node_modules/.cache/tsc",
  ...globSync("packages/*/node_modules/.cache/tsc", { cwd: root }),
  ...(process.argv.includes("--rust") ? ["target"] : []),
];
for (const target of targets) {
  rmSync(join(root, target), { recursive: true, force: true });
  console.log(`Removed ${target}`);
}
