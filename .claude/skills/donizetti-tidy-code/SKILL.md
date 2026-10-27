---
name: donizetti-tidy-code
description: A whole session of restructuring Donizetti's code to make it easier to manage, with the same behaviour: splitting large crates, packages and files into smaller cohesive ones, removing duplication and dead code, and bringing everything in line with AGENTS.md's conventions. Use only when the owner asks for a code clean-up.
argument-hint: "[crate, package or area to focus on, optional]"
disable-model-invocation: true
---

# Tidy the code

Focus, if given: $ARGUMENTS (otherwise the whole repository).

Before anything else, read AGENTS.md (its Conventions are the target), TODO.md,
README.md (the Workspace table, the commands and the commit prefixes),
docs/development.md, the root `Cargo.toml`, `package.json`, `knip.jsonc` and
`mise.toml`, and the README of each crate and package you will touch.

## How to work, for the whole session

- **Survey first, with numbers.** Measure before proposing anything: lines per
  file, files and lines per crate and package, the largest React components
  and hooks, the dependency graph (`cargo metadata`, the workspace
  `package.json` files) and any cycles, duplicated code across packages,
  dead code (Knip, `cargo machete`), entry files that hold more than exports,
  Tauri imports outside `@donizetti/tauri` and the demo app, raw strings in
  components, components and edit operations without a test, and crates that
  do not inherit from the workspace. Use subagents in parallel for the survey
  (the Explore agent, one part of the repository each), asking for numbers
  and concrete file lists.
- **Then questions and a plan.** Show me the findings as a short table and
  propose the changes, each with what moves where, the new crate or package
  names (`donizetti_<name>`, `@donizetti/<name>`, folders without the prefix),
  what depends on what afterwards, and why it is worth it. Ask with the
  interactive question tool (small batches, concrete options, a recommended
  one) about the splits that are a matter of taste, the size thresholds, and
  the order. Record the plan as slices in TODO.md.
- **Same behaviour, always.** Every change is a restructuring: no new
  features, no changed behaviour, no changed MusicXML written, public API
  (props, the imperative handle, exports other apps import) or plugin
  commands. A bug found on the way goes in TODO.md (or is fixed in its own
  `[fix]` commit with its test, after asking if it changes what the user
  sees).
- **One kind of change per commit.** Moves and renames alone as `[rename]`,
  restructuring as `[refactor]`, dead code as `[remove]`, tooling as
  `[build]`. Keep tests moving with the code (each package's or crate's
  `tests` folder), keep coverage at 80% or more, and update every README,
  document, link and code comment that names a moved path.
- **Prove nothing changed.** Run the whole checks (`mise run ci`) before each
  commit; the round-trip tests prove the MusicXML written is unchanged. Before
  the first change, take a reference set of screenshots from a Playwright run
  of the demo app (its scores, light and dark, into
  `tmp/screenshots/tidy-code/before/`); after each slice that touches the
  interface, take them again and compare them with the reference: any
  difference beyond a few anti-aliased pixels is a regression to fix before
  committing. Note build times and bundle sizes before and after the bigger
  splits.
- **Work continuously.** Do not stop after a slice: commit each verified slice
  yourself (never push), give a one-line report and go straight on to the
  next. Stop only to ask me when a doubt or a decision comes up (don't guess
  on public names, the public API, dependencies or licensing), and carry on as
  soon as I answer.
- **Subagents for slices.** Independent splits can be built at the same time
  by the donizetti-implementer agent, each in its own worktree, with a narrow
  brief: what moves where, the names, that behaviour must not change, and the
  checks to run. You keep TODO.md and the docs, review and integrate their
  work (one at a time, rebasing the next on the result) and run the checks.
- **Conventions as checks.** Where a convention can be checked by a script or
  a lint rule (export-only entry files, no Tauri imports outside its package,
  a test per component and per edit operation), offer to add the check as a
  TODO item.

## At the end

A short report: what was split, merged, moved or removed (with commits), the
numbers before and after, the screenshot comparison's result, and what is left
for another session.
