// The release's name and notes on GitHub. Edit the template below to change what a release says; the
// install lines are made from the packages and the version, so they stay right.
import { assetUrl, crateDependency, packages, repositoryUrl, tag, version } from "./packages";

export const releaseName = `Donizetti ${version}`;

/** One package's line in the notes: what it is, and how a host installs it. */
function packageLines(): string {
  const what: Record<string, string> = {
    "@donizetti/musicxml": "the score as a MusicXML document: reading, writing, `.mxl` and the edit operations",
    "@donizetti/playback": "the notes as played, MIDI files and the SpessaSynth player",
    "@donizetti/react":
      "`<ScoreEditor>` (with `react` and `react-dom`; it brings the two packages above); its stylesheet is `@donizetti/react/style.css`",
    "@donizetti/tauri": "the Tauri plugin's typed client, for a Tauri app",
  };
  return packages
    .map((pkg) => `- \`${pkg.name}\`: ${what[pkg.name] ?? ""}\n\n  \`\`\`sh\n  bun add ${assetUrl(pkg)}\n  \`\`\``)
    .join("\n\n");
}

/** The notes, in GitHub's Markdown. */
export function releaseNotes(): string {
  return `A React component for reading, playing, editing and saving MusicXML scores, and its Tauri integration.

## Packages

The packages are the tarballs below, installed by URL (each finds its siblings at this release):

${packageLines()}

SpessaSynth's AudioWorklet processor is found with Vite's \`?url\` import. A Vite build needs nothing more;
Vite's dev server needs \`optimizeDeps: { exclude: ["@donizetti/playback"] }\` in the app's Vite config;
another bundler gives \`createScoreEngine\` a \`processorUrl\` (see
[Playback](${repositoryUrl}/blob/${tag}/docs/features/playback.md#the-processor-url)).

## Tauri plugin

In the app's \`src-tauri/Cargo.toml\`, by git at this release's tag (Cargo takes the crates it uses from the same checkout):

\`\`\`toml
${crateDependency}
\`\`\`

See the [README](${repositoryUrl}#use-it-in-an-app) for how to use them.
`;
}
