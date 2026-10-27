// Versions as `mise run tag` and the release use them: `x.y.z` with an optional pre-release
// (`0.2.0-alpha.1`), compared by SemVer's precedence; the root Cargo.toml's `[workspace.package]`
// version read and rewritten; and the Cargo.lock a version bump should give. Pure functions on text.

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** The pre-release's identifiers (`["alpha", "1"]`), empty for a release. */
  prerelease: string[];
}

const number = "(0|[1-9]\\d*)";
const identifier = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const pattern = new RegExp(`^${number}\\.${number}\\.${number}(?:-(${identifier}(?:\\.${identifier})*))?$`);

/** A version from its text, or null when it is not `x.y.z` with an optional pre-release. */
export function parseVersion(text: string): Version | null {
  const match = text.trim().match(pattern);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

export function formatVersion(version: Version): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length > 0 ? `${core}-${version.prerelease.join(".")}` : core;
}

function compareIdentifiers(a: string, b: string): number {
  const numericA = /^\d+$/.test(a);
  const numericB = /^\d+$/.test(b);
  if (numericA && numericB) return Math.sign(Number(a) - Number(b));
  if (numericA !== numericB) return numericA ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** SemVer's precedence: negative when `a` comes before `b`, 0 when equal, positive after. */
export function compareVersions(a: Version, b: Version): number {
  const core = Math.sign(a.major - b.major) || Math.sign(a.minor - b.minor) || Math.sign(a.patch - b.patch);
  if (core !== 0) return core;
  // A pre-release comes before its release.
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return Math.sign(b.prerelease.length) - Math.sign(a.prerelease.length);
  }
  for (let index = 0; index < Math.min(a.prerelease.length, b.prerelease.length); index++) {
    const order = compareIdentifiers(a.prerelease[index]!, b.prerelease[index]!);
    if (order !== 0) return order;
  }
  return Math.sign(a.prerelease.length - b.prerelease.length);
}

/** The version after this one by default: the next patch (`0.1.0` → `0.1.1`), a pre-release's release. */
export function nextPatch(version: Version): Version {
  if (version.prerelease.length > 0) return { ...version, prerelease: [] };
  return { ...version, patch: version.patch + 1, prerelease: [] };
}

/** The tag a version is released under. */
export function tagOf(version: string): string {
  return `v${version}`;
}

/** The `version = "…"` line of the `[workspace.package]` section: its value and where it is. */
function versionLine(cargoToml: string): { value: string; start: number; end: number } | null {
  const section = cargoToml.match(/^\[workspace\.package\][^\S\n]*\r?\n/m);
  if (!section || section.index === undefined) return null;
  const from = section.index + section[0].length;
  const next = cargoToml.slice(from).search(/^\[/m);
  const body = cargoToml.slice(from, next === -1 ? undefined : from + next);
  const line = body.match(/^(version\s*=\s*")([^"]*)"/m);
  if (!line || line.index === undefined) return null;
  const start = from + line.index + line[1]!.length;
  return { value: line[2]!, start, end: start + line[2]!.length };
}

/** The root Cargo.toml's `[workspace.package]` version, or null when it has none. */
export function workspaceVersion(cargoToml: string): string | null {
  return versionLine(cargoToml)?.value ?? null;
}

/** The root Cargo.toml with another `[workspace.package]` version, or null when it has none. */
export function withWorkspaceVersion(cargoToml: string, version: string): string | null {
  const line = versionLine(cargoToml);
  return line ? `${cargoToml.slice(0, line.start)}${version}${cargoToml.slice(line.end)}` : null;
}

/**
 * The Cargo.lock a version bump should give: the workspace's own crates (the packages without a
 * `source`, which the registry's and git's have) at the new version, and nothing else changed.
 */
export function lockWithVersion(cargoLock: string, version: string): string {
  return cargoLock
    .split(/(?=^\[\[package\]\]$)/m)
    .map((block) =>
      block.startsWith("[[package]]") && !/^source = /m.test(block)
        ? block.replace(/^version = "[^"]*"$/m, `version = "${version}"`)
        : block,
    )
    .join("");
}
