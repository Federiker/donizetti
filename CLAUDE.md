@AGENTS.md

Use the workspace's `AGENTS.md` as the shared project guidance. Keep any
Claude-specific workflow additions here rather than duplicating those rules.

The owner wants questions asked whenever a task starts (with the question
tool, small batches, a recommended option), then continuous work: commit each
verified slice with its prefix (never push) and go straight on to the next.
Subagents and worktrees may be used freely for independent slices.

Session-long tasks the owner starts by name are skills in `.claude/skills/`,
all prefixed `donizetti-`:

- `/donizetti-design-round <topic>`: questions until the design is clear, the
  decisions in the docs and the slices in TODO.md, then the build.
- `/donizetti-next [area]`: where the project stands and what to do next
  (read-only).
- `/donizetti-add-todo <what>`: work, bugs and decisions into TODO.md and the
  docs, committing only its own changes.
- `/donizetti-find-bugs [area]`, `/donizetti-tidy-code [area]`: a bug hunt,
  a restructuring.
