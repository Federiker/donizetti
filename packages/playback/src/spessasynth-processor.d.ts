// SpessaSynth's AudioWorklet processor, imported with Vite's `?url` suffix: the address the bundler serves the
// file at (vite/client declares every `?url` import the same way; this lets the package check without it).
declare module "spessasynth_lib/dist/spessasynth_processor.min.js?url" {
  const url: string;
  export default url;
}
