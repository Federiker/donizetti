// Checks the packages before they reach a release: every import of the built files is a declared
// dependency, then a consumer in tmp/release/consumer installs the four tarballs together (as a host
// installs them from the release), imports each with Node, type-checks a file using them with
// `moduleResolution: "nodenext"`, and builds a small Vite app on them, which must emit SpessaSynth's
// AudioWorklet processor (the `?url` import @donizetti/playback leaves to the host's Vite), then
// follows the processor's address through Vite's dev server set up as docs/features/playback.md says.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, relative } from "node:path";
import { build, createServer } from "vite";
import { filesIn, runTsc, type Tarball } from "./build";
import { catalog, type Package, packages, stageOf } from "./packages";
import { fail, releaseFolder, run, shown, step } from "./run";

/** `import … from "x"` and `export … from "x"`, `import "x"`, and `import("x")` (in code or in a type). */
const specifiers = [
  /^\s*(?:import|export)\s[^;"']*?\bfrom\s*(["'])([^"']+)\1/gm,
  /^\s*import\s*(["'])([^"']+)\1/gm,
  /\bimport\(\s*(["'])([^"']+)\1\s*\)/g,
];

/** The bare specifiers (packages, not files) a built file imports. */
function bareSpecifiers(text: string): string[] {
  return specifiers
    .flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[2]!))
    .filter((specifier) => !specifier.startsWith("."));
}

/** The package a bare specifier names: `react` for `react/jsx-runtime`, `@scope/name` for its subpaths. */
function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function checkImports(pkg: Package) {
  const stage = stageOf(pkg);
  const manifest = JSON.parse(readFileSync(join(stage, "package.json"), "utf8"));
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const imported = new Set<string>();
  for (const file of filesIn(join(stage, "dist"))) {
    if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
    const text = readFileSync(file, "utf8");
    for (const specifier of bareSpecifiers(text)) imported.add(packageName(specifier));
  }
  const undeclared = [...imported].filter((name) => !declared.has(name));
  if (undeclared.length > 0) fail(`${pkg.name} imports ${undeclared.join(", ")} without declaring it.`);
  console.log(`${pkg.name} imports ${[...imported].sort().join(", ") || "nothing"}: all declared.`);
}

const consumerSource = `import { mapScore, newScore, readScore, writeScore } from "@donizetti/musicxml";
import { createScoreEngine, type ScorePlayback } from "@donizetti/playback";
import { ScoreEditor, type SavedScore } from "@donizetti/react";
import { DonizettiPluginError, writeScore as writeScoreFile } from "@donizetti/tauri";

const score = readScore(newScore({ title: "A tune" }));
export const measures: number = mapScore(score.root)?.measures.length ?? 0;
export const bytes: Uint8Array = writeScore(score);
export const engine = createScoreEngine({ soundfont: async () => new Uint8Array(), processorUrl: "/processor.js" });
export let playback: ScorePlayback | undefined;
export const view = (
  <ScoreEditor
    source={bytes}
    fileName="tune.musicxml"
    soundfont={async () => new Uint8Array()}
    onSave={(file: SavedScore) => writeScoreFile({ path: "tune.musicxml", bytes: file.bytes })}
  />
);
export const failed = (error: unknown): boolean => error instanceof DonizettiPluginError && error.code === "changed_on_disk";
`;

const consumerImports = `import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

for (const name of ${JSON.stringify(packages.map((pkg) => pkg.name))}) {
  const module = await import(name);
  console.log(\`\${name}: \${Object.keys(module).length} exports\`);
}
const stylesheet = fileURLToPath(import.meta.resolve("@donizetti/react/style.css"));
if (!existsSync(stylesheet)) throw new Error(\`No stylesheet at \${stylesheet}\`);
console.log("@donizetti/react/style.css resolves.");
`;

const consumerConfig = {
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    jsx: "react-jsx",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    types: [],
    strict: true,
    noEmit: true,
    skipLibCheck: false,
  },
  files: ["consumer.tsx"],
};

const hostPage = `<!doctype html>
<html lang="en-GB">
  <head><meta charset="utf-8" /><title>Donizetti</title></head>
  <body><div id="root"></div><script type="module" src="./main.js"></script></body>
</html>
`;

const hostScript = `import { createScoreEngine } from "@donizetti/playback";
import { ScoreEditor } from "@donizetti/react";
import "@donizetti/react/style.css";
import { createElement } from "react";
import { createRoot } from "react-dom/client";

const soundfont = async () => new Uint8Array();
createRoot(document.getElementById("root")).render(createElement(ScoreEditor, { source: "", soundfont }));
globalThis.engine = createScoreEngine({ soundfont });
`;

/**
 * Builds a Vite app on the installed tarballs: @donizetti/playback leaves the processor's `?url` import
 * to the host's bundler, so the app's build must emit the processor and point to it.
 */
async function checkViteHost(consumer: string) {
  const out = join(consumer, "dist");
  step(`A Vite app on the tarballs, built in ${shown(out)}`);
  writeFileSync(join(consumer, "index.html"), hostPage);
  writeFileSync(join(consumer, "main.js"), hostScript);
  await build({
    configFile: false,
    root: consumer,
    logLevel: "warn",
    // OpenSheetMusicDisplay alone is over Vite's 500 kB warning; it is loaded on its own when drawing.
    build: { outDir: out, emptyOutDir: true, chunkSizeWarningLimit: 4096 },
  });
  const files = filesIn(out);
  const original = readFileSync(
    createRequire(join(consumer, "package.json")).resolve("spessasynth_lib/dist/spessasynth_processor.min.js"),
  );
  const processor = files.find((file) => file.endsWith(".js") && readFileSync(file).equals(original));
  if (!processor) return fail("The Vite app's build has no copy of SpessaSynth's processor among its assets.");
  const name = basename(processor);
  const pointing = files.filter(
    (file) => file !== processor && file.endsWith(".js") && readFileSync(file, "utf8").includes(name),
  );
  if (pointing.length === 0) fail(`The Vite app's build emits ${name}, but none of its scripts points to it.`);
  if (!files.some((file) => file.endsWith(".css") && readFileSync(file, "utf8").includes(".dz-editor"))) {
    fail("The Vite app's build has no stylesheet with @donizetti/react's styles.");
  }
  const scripts = pointing.map((file) => basename(file)).join(", ");
  console.log(`The Vite app's build emits SpessaSynth's processor as ${name}, its address in ${scripts}.`);
  console.log("The app's stylesheet has @donizetti/react's styles.");
  await checkViteDevServer(consumer, original);
}

/**
 * What a Vite host's dev server needs (docs/features/playback.md): esbuild's pre-bundling cannot follow the
 * processor's `?url` import (it fails to read the file with its query), so @donizetti/playback is served as
 * it is built and Vite's own import analysis gives the processor's address.
 */
const devServerDeps = { exclude: ["@donizetti/playback"] };

/** A match's group, or the script fails saying what was missing. */
function found(text: string | undefined, pattern: RegExp, what: string): string {
  return text?.match(pattern)?.[1] ?? fail(`In Vite's dev server, ${what} was not found.`);
}

/** Follows the processor's address through Vite's dev server: main.js, @donizetti/playback, its `?url` import. */
async function checkViteDevServer(consumer: string, original: Buffer) {
  step(`The Vite app in Vite's dev server, with optimizeDeps ${JSON.stringify(devServerDeps)}`);
  const server = await createServer({
    configFile: false,
    root: consumer,
    logLevel: "warn",
    optimizeDeps: devServerDeps,
    server: { middlewareMode: true, ws: false },
  });
  try {
    const main = await server.transformRequest("/main.js");
    const playback = found(
      main?.code,
      /from\s*"([^"]*\/@donizetti\/playback\/[^"]*)"/,
      "main.js's @donizetti/playback",
    );
    // @donizetti/react is pre-bundled (which waits for the optimiser, so the server closes cleanly after) and
    // imports the very module main.js does: one @donizetti/playback in the page.
    const react = found(
      main?.code,
      /from\s*"([^"]*\/\.vite\/deps\/@donizetti_react[^"]*)"/,
      "main.js's @donizetti/react",
    );
    const reactPlayback = found(
      (await server.transformRequest(react))?.code,
      /from\s*"([^"]*\/@donizetti\/playback\/[^"]*)"/,
      "@donizetti/react's @donizetti/playback",
    );
    if (reactPlayback !== playback) fail(`@donizetti/react imports ${reactPlayback}, main.js ${playback}: two copies.`);
    const module = await server.transformRequest(playback);
    const query = found(module?.code, /import\(\s*"([^"]*spessasynth_processor[^"]*\?url)"\s*\)/, "the `?url` import");
    const address = found((await server.transformRequest(query))?.code, /export default "([^"]+)"/, "the address");
    const file = address.startsWith("/@fs/") ? address.slice("/@fs/".length) : join(consumer, address);
    if (!existsSync(file) || !readFileSync(file).equals(original)) {
      fail(`Vite's dev server gives ${address} as the processor's address, which is not SpessaSynth's processor.`);
    }
    console.log(`Vite's dev server serves @donizetti/playback as built; the processor's address is ${address}.`);
  } finally {
    await server.close();
  }
}

/** Installs the tarballs in a fresh consumer, then imports, type-checks and builds them there. */
async function checkConsumer(tarballs: readonly Tarball[]) {
  const consumer = join(releaseFolder, "consumer");
  step(`A consumer of the tarballs, in ${shown(consumer)}`);
  rmSync(consumer, { recursive: true, force: true });
  mkdirSync(consumer, { recursive: true });
  const local = Object.fromEntries(
    tarballs.map((tarball) => [tarball.pkg.name, `file:${relative(consumer, tarball.file).replaceAll("\\", "/")}`]),
  );
  const manifest = {
    name: "donizetti-consumer",
    private: true,
    type: "module",
    dependencies: {
      ...local,
      react: catalog.react,
      "react-dom": catalog["react-dom"],
      "@types/react": catalog["@types/react"],
      "@types/react-dom": catalog["@types/react-dom"],
    },
    // The siblings' dependencies on each other are the release's URLs, which exist only once it is
    // made: here they are met by the local tarballs.
    overrides: Object.fromEntries(Object.keys(local).map((name) => [name, `$${name}`])),
  };
  writeFileSync(join(consumer, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(consumer, "tsconfig.json"), `${JSON.stringify(consumerConfig, null, 2)}\n`);
  writeFileSync(join(consumer, "consumer.tsx"), consumerSource);
  writeFileSync(join(consumer, "imports.mjs"), consumerImports);
  run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--loglevel", "error"], { cwd: consumer });
  run("node", ["imports.mjs"], { cwd: consumer });
  runTsc(["--project", join(consumer, "tsconfig.json")]);
  console.log("The consumer type-checks with moduleResolution nodenext.");
  await checkViteHost(consumer);
}

export async function verifyPackages(tarballs: readonly Tarball[]) {
  step("Imports of the built files");
  for (const pkg of packages) checkImports(pkg);
  await checkConsumer(tarballs);
}
