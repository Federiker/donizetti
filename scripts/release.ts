// Releases Donizetti (owner decisions, 27 October 2026; see docs/development.md, decision 11): the
// four packages as tarballs on the GitHub release of the tag `v<version>`, installed by URL; the
// Tauri plugin (with the crates it uses) is taken by git at that tag, so it needs nothing more. By
// default a dry run (`mise run release:dry`): the tag's checks reported, the checks, the build and its
// verification in
// tmp/release, the release's notes and the GitHub calls it would make. With --release
// (`mise run release`, which `mise run tag` runs once it has pushed the tag), on a clean tree:
//
//   1. the tag here at HEAD, else it stops (`mise run tag` makes it);
//   2. the tag on origin at HEAD, and HEAD on origin's main, else it stops saying what to push;
//   3. the checks, the build and its verification;
//   4. the release made when GitHub has none for the tag, then each tarball uploaded, skipping one
//      it has already, so a release that stopped half way is run again as it is.
//
//   --release      release for real (GITHUB_TOKEN in .env)
//   --allow-dirty  a dry run with uncommitted changes
//   --skip-checks  a dry run without the type-check, the tests and Clippy
//
// The token comes from the gitignored .env (see .env.example) and goes only in the GitHub requests:
// never an argument, never printed, never in a child's environment.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPackages, type Tarball } from "./release/build";
import { calls, createRelease, type Release, releaseByTag, repositoryStatus, uploadAsset } from "./release/github";
import { releaseName, releaseNotes } from "./release/notes";
import { assetName, assetUrl, crateDependency, repository, tag, version } from "./release/packages";
import { fail, root, run, step } from "./release/run";
import { localTag, remoteProblems, short } from "./release/git";
import { verifyPackages } from "./release/verify";

const options = new Set(["--release", "--allow-dirty", "--skip-checks"]);
const args = process.argv.slice(2);
const unknown = args.filter((arg) => !options.has(arg));
if (unknown.length > 0) fail(`Unknown option ${unknown.join(", ")}; the options are ${[...options].join(", ")}.`);
const real = args.includes("--release");
const allowDirty = args.includes("--allow-dirty");
const skipChecks = args.includes("--skip-checks");
if (real && (allowDirty || skipChecks)) fail("--allow-dirty and --skip-checks are for dry runs only.");

/** The GitHub token, from .env or the environment, then taken out of the environment children inherit. */
function takeToken(): string | undefined {
  const file = join(root, ".env");
  let token: string | undefined;
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*GITHUB_TOKEN\s*=\s*(.*?)\s*$/);
      if (match) token = match[1]!.replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  token ||= process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  return token || undefined;
}

const token = takeToken();
if (real && !token) fail("Releasing needs GITHUB_TOKEN in .env (see .env.example).");
const repositoryName = `${repository.owner}/${repository.name}`;

console.log(`Donizetti ${version}, ${tag}: ${real ? "releasing for real" : "a dry run (--release releases)"}.`);

step("A clean tree");
const status = run("git", ["status", "--porcelain"], { capture: true }).trim();
if (status !== "" && !allowDirty) fail(`Uncommitted changes (commit them, or --allow-dirty for a dry run):\n${status}`);
console.log(status === "" ? "Nothing uncommitted." : "Uncommitted changes, allowed for this dry run.");

/** Where a real release would stop before the build, as the dry run finds. */
const stops: string[] = [];

/** Stops a real release with its reasons; a dry run reports them and goes on. */
function stopOrReport(...reasons: string[]) {
  if (real) fail(`${reasons.join("\n")}\nThen run \`mise run release\` again.`);
  stops.push(...reasons);
  for (const reason of reasons) console.log(`\`mise run release\` would stop here: ${reason}`);
}

step(`The tag ${tag} here`);
const local = localTag(tag);
if (local.kind === "missing") {
  stopOrReport(`there is no ${tag}: \`mise run tag\` sets the version, commits it, tags it and pushes both.`);
} else if (local.kind === "elsewhere") {
  stopOrReport(
    `${tag} is at ${short(local.tagged)}, not at HEAD (${short(local.head)}): check out the tagged commit, or release a new version.`,
  );
} else {
  console.log(`${tag} is at HEAD (${short(local.head)}).`);
}

step(`${tag} and main on origin`);
const problems = remoteProblems(tag, local.head);
if (problems.length > 0) stopOrReport(...problems);
else console.log(`origin has ${tag} at HEAD, and HEAD is on origin's main.`);

if (skipChecks) {
  step("The checks: skipped (--skip-checks)");
} else {
  for (const task of ["typecheck", "test", "rust:clippy"]) {
    step(`Check: mise run ${task}`);
    run("mise", ["run", task]);
  }
}

const tarballs = await buildPackages();
await verifyPackages(tarballs);

const notes = releaseNotes();

/** Uploads each tarball the release does not have yet. */
async function uploadTarballs(release: Release) {
  for (const tarball of tarballs) {
    const name = assetName(tarball.pkg);
    const there = release.assets.find((asset) => asset.name === name);
    if (there?.state === "uploaded") {
      const differs =
        there.size === tarball.size ? "" : ` (this build's is ${tarball.size} bytes; the release's is kept)`;
      console.log(`${name}: on the release already, ${there.size} bytes${differs}: skipped.`);
      continue;
    }
    if (there) fail(`${name} is on the release but its upload never finished: delete it on ${release.html_url}.`);
    console.log(`> ${calls.upload(name)}`);
    const asset = await uploadAsset(token!, release, tarball.file);
    console.log(`${name}: uploaded, ${asset.size} bytes.`);
  }
}

/** What the dry run says of the token: whether GitHub lets it read the repository. */
async function tokenCheck(): Promise<string> {
  if (!token) return "GitHub token: none (GITHUB_TOKEN in .env); `mise run release` needs it.";
  console.log(`> ${calls.repository}`);
  try {
    const answer = await repositoryStatus(token);
    return answer === 200
      ? `GitHub token: can read ${repositoryName}.`
      : `GitHub token: GitHub answered ${answer} reading ${repositoryName}.`;
  } catch (error) {
    return `GitHub token: could not reach GitHub (${(error as Error).message}).`;
  }
}

function summary(list: readonly Tarball[]) {
  for (const tarball of list) {
    console.log(`- ${assetUrl(tarball.pkg)}\n  ${tarball.size} bytes: ${tarball.files.join(", ")}`);
  }
  console.log(`- the plugin, by git: ${crateDependency}`);
}

step(`The release ${releaseName} on GitHub`);
if (real) {
  console.log(`> ${calls.release(tag)}`);
  let release = await releaseByTag(token!, tag);
  if (release) {
    console.log(`The release is there: ${release.html_url}`);
  } else {
    console.log(`> ${calls.create}`);
    release = await createRelease(token!, tag, releaseName, notes);
    console.log(`Created ${release.html_url}`);
  }
  await uploadTarballs(release);
  step("Released");
  summary(tarballs);
  console.log(`\n${release.html_url}`);
} else {
  console.log(await tokenCheck());
  console.log(`\nThe calls \`mise run release\` would make:`);
  console.log(`- ${calls.release(tag)}`);
  console.log(`- ${calls.create}, when there is none: "${releaseName}", not a draft nor a prerelease`);
  for (const tarball of tarballs) console.log(`- ${calls.upload(assetName(tarball.pkg))}, unless it is there`);
  console.log(`\nThe release's notes:\n\n${notes}`);
  step("Dry run done");
  summary(tarballs);
  if (stops.length === 0) console.log(`\nEverything is ready for ${tag}; \`mise run release\` releases it.`);
  else console.log(`\nThe build is ready for ${tag}; \`mise run release\` would stop first:\n- ${stops.join("\n- ")}`);
}
