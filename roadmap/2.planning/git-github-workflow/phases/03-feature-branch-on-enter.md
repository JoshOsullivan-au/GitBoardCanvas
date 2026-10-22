# Phase 03: a feature branch and worktree on stage entry

## Overview

When a move lands in a stage named by `branches.onEnter`, create the feature's branch and worktree so building starts in isolation. Complete cards list leftover branches and worktrees with the commands to remove them.

## Directive

Add `src/branches.ts` with `ensureFeatureWorktree(root, config, slug)` and call it from `moveFeature` after the move lands. Add the `branches` config key.

## Objective/Goal

Moving a card to In progress gives a person or agent `.worktrees/<slug>` on `feature/<slug>`, ready to build in.

## Limitations/Restrictions

- Local only: no push, no remote branch.
- No install, build or test runs in the new worktree; repos differ too much.

## Guardrails

- From the `using-git-worktrees` practice: refuse when the worktree folder is not ignored by git (and print the `.gitignore` line); never create a worktree inside another worktree; skip when the branch and worktree exist; reuse an existing branch that has no worktree.
- Branch is cut from the main branch's current tip, never from the move branch.
- A failure here is a warning on a landed move; it never undoes the move.
- Never runs `git worktree remove` or `git branch -d`; the Complete card only shows them.

## Done when

- Config `branches.onEnter`, `branches.name` and `branches.path` load, validate and merge like `hooks`; `{slug}` is substituted and the result is checked as a branch name and a repo-relative path.
- `MoveResult` and the API response carry `feature: { branch, path, created }` or a warning; the CLI prints it.
- Tests: new branch and worktree; branch exists without worktree; both exist; folder not ignored; slug branch name invalid; move still lands when creation fails.
- A Complete card's details list matching branches and worktrees, "merged, safe to remove" when nothing is ahead of the main branch, and the two commands.

## Orchestration

Builder; reviewer runs it in a temp repo and in a repo with other sessions' worktrees.

## Depends on

none

## Steps

1. Config key and validation, with tests. Done when bad names and paths are refused.
2. `ensureFeatureWorktree` with tests for every case. Done when all pass.
3. Wire into `moveFeature`, result, API and CLI. Done when the move test sees the worktree.
4. Complete card cleanup list. Done when the UI test sees the commands.

## UI

A line in the move toast ("Worktree ready: .worktrees/<slug>") and a cleanup list in Complete card details.

## Files/references

- `src/move.ts` (`moveFeature` after landing), `src/git.ts` (`listWorktrees`), `src/config.ts`, `src/hooks.ts` (placeholder style), `src/types.ts`, `src/ui/board.html`, `tests/move.test.ts`
- `using-git-worktrees` skill

## Review

Reviewer confirms no other worktree's files change and the main checkout's branch never switches.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

`npm run typecheck`, `npm test`, and `git worktree list` before and after a move to In progress.
