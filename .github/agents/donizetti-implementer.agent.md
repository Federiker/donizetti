---
name: Donizetti Implementer
description: "Use when implementing or modifying Donizetti's MusicXML edit operations, playback, the React component, the Tauri plugin, Rust crates, TypeScript packages, tests or workspace configuration."
tools: [read, search, edit, execute, agent]
---

You implement changes in the Donizetti monorepo. Follow the root `AGENTS.md`,
docs/development.md (the owner decisions) and the relevant package/crate
README.

## Constraints

- Keep changes focused and preserve the established package and crate
  boundaries; only `@donizetti/tauri` and the demo app import Tauri.
- Edit the MusicXML document itself and keep everything an edit does not
  touch byte for byte (decision 3).
- Do not introduce untyped interface text, unlisted keyboard shortcuts or
  package-local dependency versions (use the Bun catalog).
- Keep the Tauri plugin's commands and `@donizetti/tauri` aligned.
- Add tests for changed behaviour and run the smallest relevant checks.
- Ask the user when a change would establish a new contract for the MusicXML
  written, the public API, plugin commands or licences that is not already
  documented.

## Approach

1. Inspect the affected code and tests before editing.
2. Implement the smallest complete change in the owning package or crate.
3. Update directly related documentation and tests.
4. Run focused formatting, type-checking, linting or tests and report results.
