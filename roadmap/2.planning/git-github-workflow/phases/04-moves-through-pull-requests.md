# Phase 04: moves land through a pull request

## Overview

With `landing: "pr"`, a move makes its one commit as today, then pushes the move branch and opens a pull request instead of fast-forwarding the main branch. The board shows the move in flight until the merge is pulled.

## Directive

Split `attemptMove` in `src/move.ts` at the landing step: `landLocal` (today's fast-forward and redo) and `landPullRequest` (push, `gh pr create`). Add `landing` and `remote` config keys.

## Objective/Goal

A repo with a protected main branch can move cards from the board, and every move goes through the team's review and checks.

## Limitations/Restrictions

- The tool never merges, approves, labels or comments.
- One open move pull request per feature; a second move is refused until it merges or closes.

## Guardrails

- `git push <remote> <branch>`, never `--force` or `--force-with-lease`; only `gitboard-move/*` branches are ever pushed.
- A rejected push keeps the commit as `archive/<branch>`; a failed `gh pr create` after a good push leaves the remote branch and prints the command to retry. The tool never deletes a remote branch.
- Plan blocks: no such remote, `gh auth status` fails, `github: false`, or an open move pull request for the slug.
- The card stays in its old stage until the merge reaches the local main branch; the board never pretends a move landed.

## Done when

- `landing` and `remote` load and validate; `"pr"` with `github: false` is a config error.
- `MoveResult` carries `pr: { number, url }`; `commit` is the move commit on the branch; the API and CLI report the pull request link.
- Pipeline stops hiding `gitboard-move/*` branches that have an open pull request and shows "Moving to <Stage>, PR #n" on the card.
- Tests with a bare `origin` and the fake `gh`: pull request opened with the right base, head, title and trailers; push rejected (archive tag, main untouched); `gh pr create` fails after push (branch kept, message names the command); second move refused while one is open; `landing: "local"` behaviour unchanged (every existing move test passes untouched).

## Orchestration

Builder; a reviewer who did not write it runs it against a real throwaway GitHub repo with branch protection.

## Depends on

01 (fake `gh` kit and pull request types), 03 (feature worktree runs after the pull request opens)

## Steps

1. Config keys and plan blocks, with tests. Done when each block names its cause.
2. `landPullRequest` with push, create and failure paths, with tests. Done when every case passes.
3. In-flight move on the card, with pipeline and UI tests. Done when the card shows the pull request and stays in its stage.
4. API, CLI and toast text. Done when both report the link.

## UI

Move toast "Pull request #n opened" with the link; card chip "Moving to <Stage>, PR #n".

## Files/references

- `src/move.ts` (attemptMove landing step and finally block), `src/pipeline.ts` (move branch filter), `src/server.ts` (move response), `src/cli.ts` (move output), `src/config.ts`, `src/types.ts`, `tests/move.test.ts`
- `github:pr-manager` skill

## Review

Reviewer on a real protected repo: drag a card, see the pull request with checks, merge on GitHub, pull, see the card in its new stage.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

`npm run typecheck`, `npm test`, and the reviewer's pull request link.
