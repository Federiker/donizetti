---
name: donizetti-design-round
description: Designs and builds one Donizetti topic in a whole session: reads its areas, asks the owner questions in small batches until the design is clear, records the decisions in the docs and the slices in TODO.md, then builds slice by slice without stopping, with subagents, checks, commits and screenshots. Use only when the owner starts it for a topic.
argument-hint: "<topic, with any points already decided>"
disable-model-invocation: true
---

# A design round, then the build

Topic: $ARGUMENTS. If no topic is given, ask for it first.

## Before anything else

Read AGENTS.md and TODO.md. Find every place the topic touches: its items in
TODO.md (and Later, Awaiting owner decisions, Verification), its feature
document under docs/features/ (`musicxml.md`, `playback.md`, `editor.md`,
`tauri.md`), docs/development.md (the owner decisions), docs/research/, the
READMEs of the packages and crates involved (the README's Workspace table
lists them) and the code itself. Read the open questions already recorded.

If the owner's message lists things **already decided**, do not ask about them
again, but do ask how to carry them out.

## The questions

- Ask with the interactive question tool: small batches, concrete options, a
  recommended one first, each option saying what it changes. Ask only what
  materially affects the work.
- Drill down until the design is clear, starting with what is hardest to
  change later: the MusicXML written (decision 3: what the editor does not
  touch stays byte for byte), the component's public API (props, the
  imperative handle, the strings' keys), the Tauri plugin's commands and
  permissions, licences and dependencies (decision 1: permissive only),
  network access, what the user sees, keyboard shortcuts, accessibility.
- Add the design points the owner did not list but the work needs. In every
  topic, consider read-only scores (more than one part, staff or voice) and
  what the component says about them, undo and redo, playback and the cursor
  while editing, files from MuseScore, Sibelius, Finale and Dorico (plain and
  `.mxl`), the host's overrides (strings, `--dz-*` theme variables, keys),
  the browser demo and the Tauri window, narrow widths, light, dark and forced
  colours, keyboard shortcuts (`packages/react/src/keyboard/shortcuts.ts`,
  its strings and docs/features/editor.md) and accessibility (what a screen
  reader hears about the selection).
- When a topic has several jobs, do them in order and open each with its own
  round of questions.

## Record, then show the plan

- Write the decisions into the docs: the feature document (a new one in
  docs/features/ if needed, listed in docs/README.md), and owner decisions
  that shape the whole repository in docs/development.md.
- Write the slices into TODO.md (a short list under the item, as AGENTS.md
  describes), and show me the slice order before building.

## Build, without stopping

- Work continuously: do not stop after a slice. Commit each verified slice
  yourself with its prefix (never push), give a one-line report and go
  straight on to the next. Stop only to ask when a new doubt or decision comes
  up (don't guess on anything listed above as hard to change), and carry on as
  soon as I answer.
- Use subagents for independent slices at the same time (the
  donizetti-implementer agent, in its own worktree when files could overlap).
  Give each a narrow brief with the decisions it needs; you keep TODO.md and
  the docs, review and integrate their work, and run the checks on the result.
- Tests come with the code: each edit operation on plain XML, with a round
  trip proving the rest of the file is unchanged. Keep coverage at 80% or more
  and run the whole checks (`mise run ci`, or at least every part the change
  touches plus coverage) before each commit.
- Test scores are public-domain or invented music only; probe files and
  downloads go in `tmp/<topic>/`, fixtures worth keeping in the package's
  `tests/fixtures/`, exactly as the program that wrote them saved them.
- Keep screenshot examples of the new UI (light and dark, and narrow where it
  matters) from Playwright runs of the demo app in `tmp/screenshots/<topic>/`,
  named in order (`01-…`, `02-…`); add demo scores when the screens need
  them. Mention the new pictures in the reports.
- Tick each slice when it is done and verified; when the whole item is done
  and described in its feature document, remove it from TODO.md. What needs
  the native window or real files from other programs goes in Verification.

## At the end

A short report: what was built (with commits), the decisions recorded and
where, what is left in TODO.md, and the Verification items added.
