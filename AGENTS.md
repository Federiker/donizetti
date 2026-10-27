# Project guidance

Donizetti is a React component, with its Tauri integration, for reading,
playing, editing and saving MusicXML scores: in time, a replacement for
MuseScore inside other apps (jerome first). Read [README.md](README.md) for
setup, [docs/development.md](docs/development.md) for the owner decisions and
[docs/features/](docs/README.md) for each area's behaviour.

## Shared roadmap

- Read the root [TODO.md](TODO.md) at the start of each task to understand the
  remaining work and avoid duplicating another session's progress.
- Update relevant checklist items before finishing: add newly discovered
  work, split large tasks, note blockers and check completed items only after
  implementation and verification. A stub does not complete a feature.
- Write each TODO item as a short list of slices; they may change as the work
  shows what it needs. Tick a slice when it is done and verified; once the
  whole item is done and described in its feature document, remove it from
  the TODO (document it first if it is not).
- Keep roadmap changes focused on the current task; preserve other
  contributors' entries and unresolved decisions.

## Conventions

- Use UK English in identifiers, user-facing text and documentation, except
  where MusicXML, the DOM or a library fixes a name (`color`, `<harmony>`).
- The MusicXML document is the score (decision 3): edit the DOM, never
  rebuild the file from a model of our own, and keep everything an edit does
  not touch byte for byte. Every edit operation has tests on plain XML.
- All interface text comes from the typed strings in `@donizetti/react`
  (`strings/en-GB.ts`), never raw strings in components; hosts override them.
- Use plain React and CSS custom properties (`--dz-*`) for the interface; no
  UI framework in the packages (decision 5).
- Keep the packages free of Tauri: only `@donizetti/tauri` and the demo app
  import `@tauri-apps/*`. The component takes bytes and gives back bytes.
- Prefer small, cohesive packages and files. Keep `index.ts`, Rust `lib.rs`
  and Rust `mod.rs` files to exports only.
- Rust crates inherit package metadata, dependencies and lints from the Cargo
  workspace wherever possible. Use `donizetti_<crate_name>` crate names (the
  Tauri plugin is `tauri-plugin-donizetti`, as Tauri requires) and
  `@donizetti/<package-name>` TypeScript package names; folder names omit the
  prefix.
- Put tests under each package/crate's `tests` directory. Rust unit-test
  modules are included from `src/lib.rs` with a
  `#[path = "../tests/unit/tests.rs"]` attribute.
- Keep test coverage at 80% or more: every measure for TypeScript (lines,
  statements, functions, branches; `mise run coverage`), lines and regions for
  Rust (`mise run rust:coverage`). CI fails below; new code comes with its tests.
- Every keyboard shortcut is listed in `packages/react/src/keyboard/shortcuts.ts`:
  when you add, change or remove one, change that list, its strings and
  [the editor's document](docs/features/editor.md) in the same change.
- Only permissive licences (decision 1): Donizetti is CC0-1.0. Ask before
  adding a dependency under a licence not already in deny.toml or
  `scripts/licences.ts`.
- Report errors explicitly; do not silently substitute empty or
  success-shaped values. A file the editor cannot edit safely opens
  read-only and says why.
- Ask before making decisions that change the MusicXML written, the
  component's public API, licences or what the user sees.
- Until the first release, APIs need not stay backwards compatible.
- Prefer native and Bun tooling; do not add Docker or Python to the build,
  the checks or the scripts.
- The version is set once, in the root `Cargo.toml` (`[workspace.package]`);
  the packages follow it when they are published.

## Assistant conduct

- Use the gitignored root `tmp/` folder for local downloads, temporary
  scripts and experiments; see [README.md](README.md#local-scratch-data). Do
  not stage it or treat its contents as required build inputs. Keep durable
  findings in tracked docs.
- Test scores are public-domain or invented music only.
- Stop helper processes when finished.
- Ask about material uncertainties instead of guessing: anything that affects
  the MusicXML written, the public API, licences or what the user sees.
- When clarification or approval is needed, prefer interactive questions with
  a small set of concrete choices and a recommended option. Use the available
  question tool when supported; otherwise offer numbered choices in chat.
  Allow a custom answer and ask only questions that materially affect the work.
  This preference applies to all agents following this shared guidance.

Be courteous and constructive. If a request includes insults or abusive
language directed at the assistant, politely decline to continue that request.
