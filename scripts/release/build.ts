// Builds each package into its staging folder (tmp/release/<folder>): dist/index.js from Vite's library
// mode, the declarations from tsc (tsconfig.build.json: the sources, not the tests), the stylesheet
// with its imports inlined, the README, the licence and the published manifest, then packs each into
// the tarball the release carries (tmp/release/tarballs). The tracked files are never changed.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { assetName, type Package, packages, publishedManifest, sourceOf, stageOf, tarballFolder } from "./packages";
import { fail, root, run, shown, step } from "./run";

const tsc = fileURLToPath(import.meta.resolve("typescript/bin/tsc"));

/** Runs TypeScript's compiler with Bun, so the script needs nothing on the path for it. */
export function runTsc(args: readonly string[]) {
  run(process.execPath, [tsc, ...args]);
}

/** Every bare import is left to the package's dependencies: its siblings, React, zod, Tauri's API. */
function external(id: string): boolean {
  return !id.startsWith(".") && !id.startsWith("\0") && !isAbsolute(id);
}

/** A stylesheet with its relative `@import`s replaced by the files they name, recursively. */
function inlinedStylesheet(file: string): string {
  if (!existsSync(file)) fail(`${shown(file)} does not exist.`);
  return readFileSync(file, "utf8").replace(/^@import\s+"(\.[^"]+)";[ \t]*$/gm, (_, path: string) =>
    inlinedStylesheet(join(dirname(file), path)).trimEnd(),
  );
}

const relativeSpecifier = /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']*)\2/g;

/**
 * A declaration file's relative imports with the `.js` a Node consumer needs (`moduleResolution`
 * `node16` or `nodenext`): the sources import without an extension (decision 12).
 */
function withExtensions(file: string, text: string): string {
  return text.replace(relativeSpecifier, (_, lead: string, quote: string, specifier: string) => {
    const target = join(dirname(file), specifier);
    if (existsSync(`${target}.d.ts`)) return `${lead}${quote}${specifier}.js${quote}`;
    if (existsSync(join(target, "index.d.ts"))) return `${lead}${quote}${specifier}/index.js${quote}`;
    return fail(`${shown(file)} imports ${specifier}, which has no declarations.`);
  });
}

/** The files under a folder, as absolute paths. */
export function filesIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

async function buildPackage(pkg: Package) {
  const source = sourceOf(pkg);
  const stage = stageOf(pkg);
  const dist = join(stage, "dist");
  step(`Build ${pkg.name} in ${shown(stage)}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  await build({
    configFile: false,
    root: source,
    publicDir: false,
    logLevel: "warn",
    build: {
      lib: { entry: join(source, "src", "index.ts"), formats: ["es"], fileName: "index" },
      outDir: dist,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: "es2022",
      rollupOptions: { external },
    },
  });
  runTsc(["--project", join(source, "tsconfig.build.json"), "--outDir", dist]);
  if (pkg.stylesheet) writeFileSync(join(dist, "style.css"), inlinedStylesheet(join(source, pkg.stylesheet)));
  for (const file of filesIn(dist)) {
    if (file.endsWith(".d.ts")) writeFileSync(file, withExtensions(file, readFileSync(file, "utf8")));
  }
  writeFileSync(join(stage, "package.json"), `${JSON.stringify(publishedManifest(pkg), null, 2)}\n`);
  cpSync(join(source, "README.md"), join(stage, "README.md"));
  cpSync(join(root, "LICENSE"), join(stage, "LICENSE"));
}

/** A packed package: the release's asset. */
export interface Tarball {
  pkg: Package;
  file: string;
  /** Its size in bytes. */
  size: number;
  /** The paths inside it, from the package's folder. */
  files: string[];
}

interface PackResult {
  filename: string;
  size: number;
  files: { path: string }[];
}

/** Packs each staged package into tmp/release/tarballs, under the name its release asset has. */
function packPackages(): Tarball[] {
  step(`Tarballs in ${shown(tarballFolder)}`);
  rmSync(tarballFolder, { recursive: true, force: true });
  mkdirSync(tarballFolder, { recursive: true });
  return packages.map((pkg) => {
    const output = run("npm", ["pack", stageOf(pkg), "--pack-destination", tarballFolder, "--json", "--silent"], {
      capture: true,
    });
    const [packed] = JSON.parse(output) as PackResult[];
    if (!packed) return fail(`npm pack gave nothing for ${pkg.name}.`);
    if (packed.filename !== assetName(pkg))
      fail(`npm pack named ${pkg.name} ${packed.filename}, not ${assetName(pkg)}.`);
    const tarball = {
      pkg,
      file: join(tarballFolder, packed.filename),
      size: packed.size,
      files: packed.files.map((file) => file.path).sort(),
    };
    console.log(`${packed.filename}: ${tarball.size} bytes, ${tarball.files.length} files.`);
    return tarball;
  });
}

/** Builds and packs every package, after the declarations of those they reference (`tsc --build`). */
export async function buildPackages(): Promise<Tarball[]> {
  step("Declarations of the referenced packages");
  runTsc(["--build", ...packages.map(sourceOf)]);
  for (const pkg of packages) await buildPackage(pkg);
  return packPackages();
}
