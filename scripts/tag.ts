// `mise run tag`: sets the version, commits it, tags it and pushes, then offers to release (owner
// decisions, 27 October 2026; see docs/development.md, decision 11). It asks before each step, Enter
// taking the default:
//
//   1. on main, with nothing uncommitted or untracked: the new version (the next patch by default; the
//      current one when it was never tagged, as for the first release), written to the root
//      Cargo.toml and Cargo.lock;
//   2. the commit, of those two files only (`[release] Donizetti <version>` by default; the hooks run);
//   3. the annotated tag `v<version>`, which the release requires;
//   4. `git push --atomic origin main <tag>`, or how to push later and how to undo it here;
//   5. the release itself (`bun scripts/release.ts --release`, as `mise run release`).
//
// Ctrl+C or the end of the input at a question stops it; nothing is changed before the commit, and
// after it the script says what it has done and how to undo it.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitOf, currentBranch, isAncestor, remoteMain, remoteTags, short } from "./release/git";
import { ask, isYes, stopAsking } from "./release/prompt";
import { attempt, root, run, step } from "./release/run";
import {
  compareVersions,
  formatVersion,
  lockWithVersion,
  nextPatch,
  parseVersion,
  tagOf,
  type Version,
  withWorkspaceVersion,
  workspaceVersion,
} from "./release/version";

const cargoToml = join(root, "Cargo.toml");
const cargoLock = join(root, "Cargo.lock");

/** What the script has done, and the commands that undo it here (printed, never run). */
const done: string[] = [];
const undo: string[] = [];

/** Ends the script, saying what it did before stopping. */
function stop(reason: string, code = 1): never {
  stopAsking();
  console.error(`\n${reason}`);
  if (done.length > 0) {
    console.error(`\nDone so far:\n${done.map((line) => `- ${line}`).join("\n")}`);
    if (undo.length > 0) console.error(`To undo it here:\n${undo.map((line) => `  ${line}`).join("\n")}`);
  }
  process.exit(code);
}

process.on("SIGINT", () => stop("Stopped (Ctrl+C).", 130));

/** Asks until an answer is accepted (`{ value }`, else why not); the end of the input stops the script. */
async function askUntil<T>(question: string, accept: (answer: string) => { value: T } | string): Promise<T> {
  for (;;) {
    const answer = await ask(question);
    if (answer === null) stop("Stopped: no answer.");
    const result = accept(answer.trim());
    if (typeof result !== "string") return result.value;
    console.log(result);
  }
}

step("Before starting");
const status = run("git", ["status", "--porcelain", "--untracked-files=all"], { capture: true }).trim();
if (status !== "") {
  stop(`Uncommitted changes or untracked files: commit those first, each with its own prefix.\n${status}`);
}
const branch = currentBranch();
if (branch !== "main") stop(`HEAD is ${branch ? `on ${branch}` : "detached"}: a version is set on main.`);
const head = commitOf("HEAD") ?? stop("HEAD has no commit.");
const originMain = remoteMain();
if (originMain && !isAncestor(originMain, head)) {
  stop(`origin's main (${short(originMain)}) has commits this main lacks: pull them first.`);
}
const originTags = remoteTags();
const tagTaken = (tag: string) => commitOf(`refs/tags/${tag}`) !== null || originTags.has(tag);

const currentText = workspaceVersion(readFileSync(cargoToml, "utf8")) ?? stop("No version in Cargo.toml.");
const current = parseVersion(currentText) ?? stop(`Cargo.toml's version ${currentText} is not x.y.z.`);
const currentTagged = tagTaken(tagOf(currentText));
console.log(`\nThe version is ${currentText}${currentTagged ? "" : `, never tagged (no ${tagOf(currentText)})`}.`);

step("The version");
const suggested = formatVersion(currentTagged ? nextPatch(current) : current);
const version = await askUntil<Version>(`New version [${suggested}]: `, (answer) => {
  const typed = answer === "" ? suggested : answer;
  const parsed = parseVersion(typed);
  if (!parsed) return `${typed} is not a version: x.y.z, or x.y.z-alpha.1 for a pre-release.`;
  const order = compareVersions(parsed, current);
  if (order < 0 || (order === 0 && currentTagged)) return `${typed} is not after ${currentText}.`;
  if (tagTaken(tagOf(typed))) return `${tagOf(typed)} exists already, here or on origin.`;
  return { value: parsed };
});
const versionText = formatVersion(version);
const tag = tagOf(versionText);
const bump = compareVersions(version, current) > 0;
if (!bump) console.log(`${versionText} is Cargo.toml's already: no commit, the tag goes on HEAD.`);

const defaultMessage = `[release] Donizetti ${versionText}`;
let message = "";
if (bump) {
  step("The commit");
  message = await askUntil(`Commit message [${defaultMessage}]: `, (answer) => ({ value: answer || defaultMessage }));
}

step("The tag");
await askUntil(`Tag [${tag}]: `, (answer) =>
  answer === "" || answer === tag
    ? { value: tag }
    : `The release needs ${tag}, Cargo.toml's version as a tag; give that (or Enter), or stop with Ctrl+C.`,
);

/** Puts Cargo.toml and Cargo.lock back as they were committed. */
function restoreVersionFiles() {
  run("git", ["checkout", "HEAD", "--", "Cargo.toml", "Cargo.lock"]);
}

if (bump) {
  step(`${versionText} in Cargo.toml and Cargo.lock`);
  const lockBefore = readFileSync(cargoLock, "utf8");
  const toml = withWorkspaceVersion(readFileSync(cargoToml, "utf8"), versionText) ?? stop("No version in Cargo.toml.");
  writeFileSync(cargoToml, toml);
  if (attempt("cargo", ["update", "--workspace", "--offline"]).status !== 0) {
    restoreVersionFiles();
    stop("cargo could not update Cargo.lock: nothing changed.");
  }
  if (readFileSync(cargoLock, "utf8") !== lockWithVersion(lockBefore, versionText)) {
    restoreVersionFiles();
    stop("Cargo.lock changed more than the workspace's own versions: nothing changed.");
  }
  const changed = run("git", ["status", "--porcelain"], { capture: true }).trim().split(/\r?\n/);
  if (changed.some((line) => !/^ ?M (Cargo\.toml|Cargo\.lock)$/.test(line))) {
    restoreVersionFiles();
    stop(`Files other than Cargo.toml and Cargo.lock changed:\n${changed.join("\n")}\nNothing was committed.`);
  }
  console.log(run("git", ["diff", "--stat"], { capture: true }).trimEnd());

  step("Committing");
  run("git", ["add", "--", "Cargo.toml", "Cargo.lock"]);
  while (attempt("git", ["commit", "--message", message]).status !== 0) {
    console.log("The commit was refused (the hook says why). Another message, or Ctrl+C to stop:");
    const again = await ask(`Commit message [${defaultMessage}]: `);
    if (again === null) {
      restoreVersionFiles();
      stop("Stopped: nothing changed.");
    }
    message = again.trim() || defaultMessage;
  }
  done.push(`committed ${short(commitOf("HEAD") ?? "")} "${message}" (Cargo.toml and Cargo.lock at ${versionText})`);
  undo.unshift("git reset --hard HEAD~1");
}

step(`The tag ${tag}`);
run("git", ["tag", "--annotate", tag, "--message", `Donizetti ${versionText}`]);
done.push(`tagged HEAD ${tag}, annotated, here only`);
undo.unshift(`git tag -d ${tag}`);

step("The push");
const push = ["push", "--atomic", "origin", "main", tag];
const unpushed = originMain
  ? run("git", ["log", "--oneline", `${originMain}..HEAD`], { capture: true }).trim()
  : "(origin has no main yet)";
console.log(`\`git ${push.join(" ")}\` sends ${tag} and main's commits that origin lacks:\n${unpushed || "(none)"}`);
const pushNow = await ask(`Push main and ${tag} to origin now? [y/N] `);
if (pushNow === null || !isYes(pushNow, false)) {
  stop(`Not pushed. Push them later with \`git ${push.join(" ")}\`, then run \`mise run release\`.`, 0);
}
if (attempt("git", push).status !== 0) stop("The push failed; with --atomic, nothing was pushed.");
done.push(`pushed main and ${tag} to origin`);
// Once pushed, a tag is not taken back: the commands above would undo this clone only.
undo.length = 0;

step("The release");
const releaseNow = await ask("Create the GitHub release now? [Y/n] ");
stopAsking();
if (releaseNow === null || !isYes(releaseNow, true)) {
  console.log(`\n${tag} is pushed; \`mise run release\` makes its release when you are ready.`);
  process.exit(0);
}
const release = spawnSync(process.execPath, [join(root, "scripts", "release.ts"), "--release"], {
  cwd: root,
  stdio: "inherit",
});
process.exit(release.status ?? 1);
