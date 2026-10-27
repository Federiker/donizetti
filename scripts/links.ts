// Checks the links in the Markdown files git tracks with lychee (config: lychee.toml), so build
// outputs, node_modules and tmp are never read. Extra arguments are passed on.
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const listed = spawnSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" });
if (listed.status !== 0) {
  console.error(listed.stderr || "git ls-files failed.");
  process.exit(1);
}
const files = listed.stdout.split("\n").filter(Boolean);
const result = spawnSync("lychee", ["--no-progress", ...process.argv.slice(2), ...files], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) {
  console.error(`${result.error.message} (is lychee installed? See mise.toml.)`);
  process.exit(1);
}
process.exit(result.status ?? 1);
