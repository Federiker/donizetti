---
name: donizetti-find-bugs
description: A whole session of finding bugs in Donizetti and fixing them, package by package, with a failing test before each fix, a commit per fix and screenshots of every visible one. Use only when the owner asks for a bug hunt.
argument-hint: "[package, crate or area to focus on, optional]"
disable-model-invocation: true
---

# Find and fix bugs

Focus, if given: $ARGUMENTS (otherwise the whole repository, area by area).

Before anything else, read AGENTS.md, TODO.md (Now, Verification, and the
bugs and known issues noted beside items), docs/README.md, docs/development.md
(the decisions, the checks, the coverage) and the feature document of each
area you will look at (docs/features/`musicxml.md`, `playback.md`,
`editor.md`, `tauri.md`). The areas are the packages and crates in the
README's Workspace table.

## How to work, for the whole session

- **Questions first.** Start with one round of questions with the interactive
  question tool (small batches, concrete options, a recommended one): which
  areas first, how deep (what the MusicXML written keeps first, then the edit
  operations, playback and the Tauri plugin, then the rest of the interface),
  and what counts as a bug here rather than a design change. Then show me the
  order of the hunt.
- **Hunt in rounds, one area at a time.** For each area:
  - Run the area's tests and the whole checks, and note failures and flaky
    tests (run a flaky one alone and under load).
  - Drive the demo app with Playwright: write a script in
    `tmp/find-bugs/` that opens the area's scores (invented ones and
    public-domain exports from MuseScore, Sibelius, Finale and Dorico, plain
    and `.mxl`), edits, plays and saves them, light and dark and narrow, and
    treat every page error, console error, wrong note selected, bar that no
    longer adds up, cut-off text, overlap or unreachable control as a lead.
  - Read the area's code with subagents in parallel (the Explore agent, one
    narrow brief each: the XML round trip and what an edit leaves untouched,
    bar durations, ties, beams, lyrics and chord symbols in MusicXML's order,
    the click-to-XML mapping, `.mxl` archives, playback timing through
    repeats and jumps, the Tauri plugin's file writes and downloads, errors
    between Rust and TypeScript, accessibility and keyboard paths, raw
    user-visible strings, race conditions in hooks and the player). Ask each
    for concrete failure scenarios with file and line, not opinions; verify
    every lead yourself before acting on it.
  - Look especially for data loss: anything that writes a score, undo and
    redo, saving `.mxl`, a file changed on disk while open, and content the
    editor does not model (other programs' elements, comments, layout) that
    must be written back byte for byte (decision 3).
- **Fix each confirmed bug.** Record it first in TODO.md under Now ("found
  <date>"), write the failing test (in the package's or crate's `tests`
  folder; a small invented or public-domain score as its fixture) that
  reproduces it, then fix it, run the whole checks, and commit it as
  `[fix] …` (never push). Remove its TODO item once the fix is in and the
  feature document says what now happens, if it says anything about it.
- **Work continuously.** Do not stop after a fix: give a one-line report and
  go straight on to the next. Stop only to ask me when a fix needs a decision
  (anything that affects the MusicXML written, the public API, licences or
  what the user sees beyond restoring the documented behaviour), and carry on
  as soon as I answer. A bug whose fix needs a decision I have not made yet
  goes in TODO.md with the question beside it; continue with the next one
  meanwhile.
- **Subagents for fixes.** Independent fixes can be built at the same time by
  the donizetti-implementer agent, in its own worktree when files could
  overlap, each with a narrow brief: the bug, the failing scenario, the test
  to write and the files involved. You keep TODO.md and the docs, review and
  integrate their work and run the checks on the result.
- **Checks.** Keep coverage at 80% or more and run the whole checks
  (`mise run ci`, or at least the parts the change touches plus coverage)
  before each commit.
- **Screenshots.** For every bug you can see, take a picture before and after
  the fix from a Playwright run of the demo app (light and dark, and narrow
  where it matters) into `tmp/screenshots/find-bugs/`, named in order
  (`01-…`, `02-…`). Mention the new pictures in the reports.
- **Things you cannot check here** (the native window on each platform,
  sound, screen readers, real files from programs not installed here) go in
  TODO.md's Verification section, grouped by area, with what to look for.

## At the end

A short report: the bugs fixed (one line each, with its commit), the ones
recorded but waiting for a decision, the Verification items added, and the
areas not yet looked at, so the next session can carry on.
