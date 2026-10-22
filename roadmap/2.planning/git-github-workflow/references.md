# References

Read these before starting any phase.

## Files in this repo

- `src/move.ts`: the move engine; the landing step (`git merge --ff-only`), redo, archive tags and the finally block that removes the worktree and branch
- `src/pipeline.ts`: the `gh pr list` read, its 60-second cache, the `gitboard-move/` branch filter, and how branches are attributed to features
- `src/types.ts`: `PullRequest`, `CardGit`, `Card.landed`, `MoveResult`
- `src/board.ts`: how Landed is read from the main branch
- `src/config.ts`: key style, shape checks, hand-written merge of nested keys
- `src/hooks.ts`: `{slug}` placeholder style and why hooks cannot create a lasting worktree (they run in the throwaway move worktree)
- `src/ui/board.html`: `gitBadge`, `GIT_STEPS`, filters, the details panel
- `docs/spec.md`: section 1.7, the never-pushes line, R3, R14, section 3
- `tests/move.test.ts`, `tests/pipeline.test.ts`, `tests/server.test.ts`: test patterns; no `gh` fake exists yet

## Research and prior art

- `feature-dev`: explore, clarify, design, build, review
- `using-git-worktrees`: ignored folder check, no nesting, skip when present, `.worktrees/` default
- `github:pr-manager`: pull request lifecycle and status reads
- `github:workflow-automation`: check runs and least-privilege writes
- `gh pr list --json statusCheckRollup,reviewDecision,mergeable,mergedAt,mergeCommit`

## Designs

none
