// Runs the Rust workspace's tests: with cargo-nextest when it is installed
// (faster, one process per test, clearer failure output), otherwise with
// `cargo test`. Extra arguments are passed on, e.g.
// `mise run rust:test -- -p donizetti_soundfonts`.
//
// nextest does not run doctests; the workspace has none today. If some are
// added, run `cargo test --workspace --doc` as well (CI should too).
import { spawnSync } from "node:child_process";

const extra = process.argv.slice(2);
const hasNextest = spawnSync("cargo", ["nextest", "--version"], { stdio: "ignore" }).status === 0;
const args = hasNextest ? ["nextest", "run", "--workspace", ...extra] : ["test", "--workspace", ...extra];

if (!hasNextest) console.log("cargo-nextest is not installed; running cargo test instead.");
const result = spawnSync("cargo", args, { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
