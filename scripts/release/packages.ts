// What is released (owner decisions, 27 October 2026; see docs/development.md, decision 11): the
// four packages as tarballs on a GitHub release, under their own @donizetti/* names, and the
// manifests published in them, made from the packages' own.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, releaseFolder, root } from "./run";
import { tagOf, workspaceVersion } from "./version";

export interface Package {
  /** Its name, in the workspace and in its tarball. */
  name: string;
  /** Its folder under packages/. */
  folder: string;
  /** Its stylesheet, published with its imports inlined as dist/style.css (`<name>/style.css`). */
  stylesheet?: string;
}

/** The packages, each after the ones it depends on. */
export const packages: readonly Package[] = [
  { name: "@donizetti/musicxml", folder: "musicxml" },
  { name: "@donizetti/playback", folder: "playback" },
  { name: "@donizetti/tauri", folder: "tauri" },
  { name: "@donizetti/react", folder: "react", stylesheet: "src/style.css" },
];

/**
 * The Tauri plugin, which hosts take by git at the release's tag; Cargo finds the crates it uses
 * (`donizetti_soundfonts`, `donizetti_pdf`) by their paths in the same checkout.
 */
export const crate = "tauri-plugin-donizetti";

/** The GitHub repository the releases are made in (its `origin`). */
export const repository = { owner: "Federiker", name: "donizetti" };

export const repositoryUrl = `https://github.com/${repository.owner}/${repository.name}`;

/** The version of everything released: the root Cargo.toml's `[workspace.package]` version. */
export const version =
  workspaceVersion(readFileSync(join(root, "Cargo.toml"), "utf8")) ??
  fail("No version in the root Cargo.toml's [workspace.package].");

/** The release's tag. */
export const tag = tagOf(version);

/** A package's tarball, as `npm pack` names it: `donizetti-react-0.1.0.tgz` for `@donizetti/react`. */
export function assetName(pkg: Package): string {
  return `${pkg.name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

/** Where a host installs a package from: its tarball on the release. */
export function assetUrl(pkg: Package): string {
  return `${repositoryUrl}/releases/download/${tag}/${assetName(pkg)}`;
}

/** The line a Cargo host adds for the plugin: the repository, pinned to the release's tag. */
export const crateDependency = `${crate} = { git = "${repositoryUrl}", tag = "${tag}" }`;

/** The folder a package is staged in: its built files, its README, the licence and its manifest. */
export function stageOf(pkg: Package): string {
  return join(releaseFolder, pkg.folder);
}

/** The folder the packed tarballs (the release's assets) are written to. */
export const tarballFolder = join(releaseFolder, "tarballs");

export function sourceOf(pkg: Package): string {
  return join(root, "packages", pkg.folder);
}

type Ranges = Record<string, string>;

interface SourceManifest {
  description?: string;
  keywords?: string[];
  sideEffects?: boolean | string[];
  dependencies?: Ranges;
  peerDependencies?: Ranges;
}

/** The root package.json's catalog of shared ranges. */
export const catalog: Ranges = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces.catalog;

/** A dependency as published: `catalog:` from the root's catalog, a sibling as its tarball's URL. */
function publishedRange(name: string, range: string): string {
  if (range === "catalog:") return catalog[name] ?? fail(`${name} is not in the root package.json's catalog.`);
  if (range.startsWith("workspace:")) {
    const sibling = packages.find((pkg) => pkg.name === name);
    return sibling ? assetUrl(sibling) : fail(`${name} is not one of the released packages.`);
  }
  if (range.includes(":")) fail(`${name}: the range "${range}" cannot be published.`);
  return range;
}

function publishedRanges(ranges: Ranges | undefined): Ranges | undefined {
  if (!ranges) return undefined;
  return Object.fromEntries(Object.entries(ranges).map(([name, range]) => [name, publishedRange(name, range)]));
}

/** The package.json published for a package: no devDependencies, scripts or `private`. */
export function publishedManifest(pkg: Package): Record<string, unknown> {
  const source: SourceManifest = JSON.parse(readFileSync(join(sourceOf(pkg), "package.json"), "utf8"));
  if (!source.description) fail(`${pkg.name} has no description in its package.json.`);
  const entry = { types: "./dist/index.d.ts", import: "./dist/index.js" };
  return {
    name: pkg.name,
    version,
    description: source.description,
    keywords: source.keywords,
    homepage: `${repositoryUrl}/tree/main/packages/${pkg.folder}#readme`,
    bugs: `${repositoryUrl}/issues`,
    repository: { type: "git", url: `git+${repositoryUrl}.git`, directory: `packages/${pkg.folder}` },
    license: "CC0-1.0",
    type: "module",
    sideEffects: source.sideEffects ?? false,
    exports: pkg.stylesheet ? { ".": entry, "./style.css": "./dist/style.css" } : { ".": entry },
    types: entry.types,
    files: ["dist", "README.md", "LICENSE"],
    dependencies: publishedRanges(source.dependencies),
    peerDependencies: publishedRanges(source.peerDependencies),
  };
}
