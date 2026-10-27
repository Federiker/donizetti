---
name: donizetti-next
description: Says where the Donizetti project stands and recommends what to work on next, from TODO.md, the docs and the recent commits. Read-only. Use only when the owner asks for it.
argument-hint: "[an area or a goal to weigh, optional]"
disable-model-invocation: true
---

# Where things stand, and what next

Weigh especially: $ARGUMENTS (otherwise the whole project).

This skill changes nothing: no edits, no commits.

## Read

- AGENTS.md, TODO.md (every section) and docs/development.md (the owner
  decisions).
- The last 30 commits (`git log --oneline -30`) and the working tree's status,
  to see what was just finished and whether anything is half done.
- The skills in `.claude/skills/` (their descriptions), so you can point to
  the right one.
- Where an item's state is unclear, the feature document it links to
  (docs/features/); check the code only when the TODO and the docs disagree.

## Report, briefly

1. **Where it stands:** two or three sentences: what was finished recently,
   what is half done or uncommitted, anything blocking (failing checks, owner
   decisions waiting).
2. **Waiting for me:** the owner decisions that block the most work, each with
   what it unblocks.
3. **Recommended next:** the best next task and why (what it unblocks, its
   risk, its size), and how to start it: a skill (`/donizetti-…` with its
   argument) or a short prompt you write for it.
4. **Then:** two or three alternatives, one line each.

Order the recommendations by what reduces risk first (the MusicXML written
and what it keeps, failing or flaky checks, the public API), then by what
unblocks the most (jerome's switch to `<ScoreEditor>` among them), then by
size. Mention anything that looks stale: a TODO item that the code or git
history shows is done, a decision that is recorded in TODO.md but missing
from the docs. Offer to fix those; do not fix them yourself.
