// What the release script's steps share: the repository's root, its messages and running programs.
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative } from "node:path";

export const root = join(import.meta.dirname, "..", "..");

/** Where the script builds and checks the packages: under the gitignored tmp/. */
export const releaseFolder = join(root, "tmp", "release");

/** Ends the script with a reason. */
export function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

/** Announces the next step. */
export function step(title: string) {
  console.log(`\n== ${title}`);
}

/** A path as the messages show it: from the root when inside it (anything else as it is). */
export function shown(path: string): string {
  if (!isAbsolute(path)) return path;
  const fromRoot = relative(root, path);
  return fromRoot.startsWith("..") ? path : fromRoot.replaceAll("\\", "/");
}

interface RunOptions {
  cwd?: string;
  /** Returns the program's output instead of showing it. */
  capture?: boolean;
}

interface Outcome {
  /** The exit code, null when the program could not start or was stopped. */
  status: number | null;
  stdout: string;
}

/**
 * Runs a program and says how it ended, without failing the script. Its arguments are printed, so a
 * token never goes in them; no child is given one (the script keeps its tokens to itself). npm is a
 * .cmd file on Windows, which only the shell runs.
 */
export function attempt(command: string, args: readonly string[], options: RunOptions = {}): Outcome {
  console.log(`> ${[command, ...args].map(shown).join(" ")}`);
  const shell = process.platform === "win32" && command === "npm";
  const quoted = args.map((arg) => (shell && /[\s"&|<>^]/.test(arg) ? `"${arg}"` : arg));
  const result = spawnSync(shell ? [command, ...quoted].join(" ") : command, shell ? [] : quoted, {
    cwd: options.cwd ?? root,
    env: process.env,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    shell,
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  return { status: result.status, stdout: result.stdout ?? "" };
}

/** Runs a program and fails the script when it fails. */
export function run(command: string, args: readonly string[], options: RunOptions = {}): string {
  const { status, stdout } = attempt(command, args, options);
  if (status !== 0) fail(`${command} failed (exit code ${status}).`);
  return stdout;
}
