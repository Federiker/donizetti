// What the release and `mise run tag` ask Git: the tag `v<version>` here and on `origin`, and where
// HEAD and origin's main are. Only reads; `mise run tag` makes the commit and the tag itself.
import { attempt, run } from "./run";

/** Where the tag is in this clone. */
export type LocalTag =
  | { kind: "missing"; head: string }
  | { kind: "elsewhere"; head: string; tagged: string }
  | { kind: "here"; head: string };

/** A commit as the messages show it. */
export function short(commit: string): string {
  return commit.slice(0, 10);
}

/** The commit a revision names in this clone, or null when there is none. */
export function commitOf(revision: string): string | null {
  const { status, stdout } = attempt("git", ["rev-parse", "--quiet", "--verify", `${revision}^{commit}`], {
    capture: true,
  });
  return status === 0 ? stdout.trim() : null;
}

export function localTag(tag: string): LocalTag {
  const head = commitOf("HEAD") ?? "";
  const tagged = commitOf(`refs/tags/${tag}`);
  if (!tagged) return { kind: "missing", head };
  return tagged === head ? { kind: "here", head } : { kind: "elsewhere", head, tagged };
}

/** The branch checked out, or null when HEAD is detached. */
export function currentBranch(): string | null {
  const { status, stdout } = attempt("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { capture: true });
  return status === 0 ? stdout.trim() : null;
}

/** Refs on origin, from `git ls-remote`: each ref's commit. */
function remoteRefs(args: readonly string[]): Map<string, string> {
  const output = run("git", ["ls-remote", ...args, "origin"], { capture: true });
  return new Map(
    output
      .split(/\r?\n/)
      .filter((line) => line.includes("\t"))
      .map((line) => {
        const [commit, ref] = line.split("\t");
        return [ref!, commit!];
      }),
  );
}

/** Origin's tags, each with its commit (an annotated tag's peeled one), by name. */
export function remoteTags(): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [ref, commit] of remoteRefs(["--tags"])) {
    const name = ref.replace(/^refs\/tags\//, "");
    // An annotated tag's commit is its peeled ref (`^{}`), listed after the tag object's.
    if (name.endsWith("^{}")) tags.set(name.slice(0, -3), commit);
    else if (!tags.has(name)) tags.set(name, commit);
  }
  return tags;
}

/** Origin's main, or null when it has none. */
export function remoteMain(): string | null {
  return remoteRefs(["--heads"]).get("refs/heads/main") ?? null;
}

/** Whether a commit is on another (the other included), when this clone has the other. */
export function isAncestor(commit: string, of: string): boolean {
  if (commit === of) return true;
  if (attempt("git", ["cat-file", "-e", `${of}^{commit}`]).status !== 0) return false;
  return attempt("git", ["merge-base", "--is-ancestor", commit, of]).status === 0;
}

/**
 * What origin lacks for a release of HEAD at the tag: an empty list when the tag is there at HEAD and
 * HEAD is on origin's main, otherwise each problem with what to do.
 */
export function remoteProblems(tag: string, head: string): string[] {
  const tagged = remoteTags().get(tag);
  const main = remoteMain();
  const problems: string[] = [];
  if (!main || !isAncestor(head, main)) {
    problems.push(
      `HEAD (${short(head)}) is not on origin's main${main ? ` (at ${short(main)})` : ""}: push it with \`git push origin main\`.`,
    );
  }
  if (!tagged) problems.push(`origin has no ${tag}: push it with \`git push origin ${tag}\`.`);
  else if (tagged !== head) {
    problems.push(
      `origin's ${tag} is at ${short(tagged)}, not at HEAD (${short(head)}): a released tag is not moved; release a new version.`,
    );
  }
  return problems;
}
