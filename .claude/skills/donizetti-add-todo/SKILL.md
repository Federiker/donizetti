---
name: donizetti-add-todo
description: Adds work, bugs and owner decisions to Donizetti's TODO.md and the feature documents: finds where each belongs and whether it is already there, asks the owner what is unclear, writes the items and decisions, and commits only its own changes, because other sessions may be editing the same files. No product code. Use only when the owner asks for it.
argument-hint: "<what to add: work, a bug, a decision, an idea>"
disable-model-invocation: true
---

# Add to the TODO and the docs

To add: $ARGUMENTS. If nothing is given, ask for it first.

This skill writes TODO.md and the docs only: no product code, no tests, no
fixes, however small. A fix found on the way becomes an item.

## Other sessions

Another session may be working in this checkout at the same time, or none
may be. Assume one is:

- Before the first edit, run `git status` and `git diff --stat`, and note
  which files already have changes (staged or not) that are not yours. They
  belong to someone else: do not edit them away, revert, reformat, stage or
  commit them.
- Read a file again just before editing it, and change it with small, exact
  edits rather than rewriting it, so a change written meanwhile is not lost.
  Do not move, merge or reword other entries; mention what looks stale in the
  report instead.
- Never run `git add -A`, `git add .`, `git commit -a`, `git stash`,
  `git checkout -- <file>`, `git restore` or `git reset` on files you did not
  change alone.

## Read

AGENTS.md, TODO.md (every section, including Later, Awaiting owner decisions
and Verification), docs/README.md, docs/development.md and the feature
documents the additions touch (docs/features/`musicxml.md`, `playback.md`,
`editor.md`, `tauri.md`). Check the code only to place an item or to confirm
a bug is real (say if you could not confirm it). Look at the recent commits
(`git log --oneline -20`) for work that is already done.

## Place each addition

For each thing to add, find:

- **Whether it is already there**, in TODO.md or the docs, perhaps worded
  differently or decided otherwise. If so, extend that entry rather than add
  a second one, or ask when the new request contradicts a recorded decision.
- **Where it belongs:** Now (the current round, bugs and small fixes), Later,
  Awaiting owner decisions, or Verification (checks that need the native
  window or real files from other programs).
- **What it is:** one line for a small task, or a short list of slices for a
  piece of work with several parts. A bug says when it was found
  ("found 27 October 2026"), where (the package or crate, from the README's
  Workspace table), and what goes wrong; for a score, which program wrote the
  file and what is lost or wrong in the MusicXML written.
- **What is decided:** owner decisions go in the feature document (its
  decisions or open questions, dated and marked as the owner's), or in
  docs/development.md when they shape the whole repository, with a short TODO
  item linking to them. Do not invent decisions: what is not decided stays an
  open question.

## Questions

Ask with the interactive question tool, in small batches, concrete options
with a recommended one first: where an item goes when it is not clear, how to
split it, what an ambiguous request means, and anything that touches the
MusicXML written, the component's public API, the Tauri plugin's commands,
licences or what the user sees. Do not ask what the TODO, the docs or the code
already answer. When everything is clear, show the wording and the places
before writing, briefly, unless the owner said to just add it.

## Write and commit

- Follow TODO.md's own rules at its top and the style of the entries around
  the new one: short, UK English, what is left to do and the decisions it
  depends on, with links to the docs.
- Run `mise run spell` and `mise run links`, and fix only what you wrote.
- Commit only your own changes, as `[docs] <area>: <what was added>`; never
  push. First check `git diff --cached` is empty: if something is already
  staged, it is not yours, so ask before committing. A file only you changed
  is staged by path; in a file that had someone else's changes, stage only
  your hunks (a patch of just them through `git apply --cached`), and check
  `git diff --cached` shows nothing else. When your hunks cannot be separated
  from theirs, leave the file uncommitted and say so.

## At the end

A short report: what was added and where (with links), the decisions
recorded, the commit, anything left uncommitted and why, and entries that
looked stale or duplicated (offer to tidy them; do not tidy them yourself).
