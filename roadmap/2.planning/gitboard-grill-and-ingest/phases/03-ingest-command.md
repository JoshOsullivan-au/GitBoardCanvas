# Phase 03: `gitboard ingest`

## Overview

A CLI command that reads an approved manifest and files each accepted candidate into the lifecycle folder as a feature, in one commit on the main branch, using the same lock and worktree path as `gitboard move`.

## Directive

Add `gitboard ingest [manifest] [--dry-run]` backed by `src/ingest.ts`. The default manifest path is `.gitboard/ingest/manifest.json`.

## Objective/Goal

Accepted candidates appear on the board in the stage the person chose, each with a build list file, a feature folder and a `references.md` that records where every document came from.

## Limitations/Restrictions

- Ingest does not decide inclusion, stage, slug or group. It refuses a manifest without `approvedBy` and `approvedAt`.
- No edits to the body of a filed document. Links inside it are rewritten only when the document was moved with `git mv`.

## Guardrails

- Tracked files in the main checkout: `git mv` into `<stage>/<slug>/docs/`, keeping history.
- Filed documents keep their bytes: no front matter or other edits beyond link rewrites after a move.
- Untracked, gitignored, or worktree files: copied, never moved. The source stays where it is.
- Slug clash with an existing feature: stop and report, never merge silently.
- One commit, subject `gitboard: ingest <n> features`, with a `GitBoard-Ingest: <manifest hash>` trailer. Fast-forward only, same redo-on-main-moved rule as move.
- The configured lint command runs before the commit; a failure aborts with nothing committed.

## Done when

- `--dry-run` prints every create, copy and move and touches nothing.
- A fixture ingest creates `<stage>/<slug>.md` from `templates/feature/FEATURE.md` (build list seeded from the source's checkboxes when it has them), `<stage>/<slug>/README.md`, `docs/` and `references.md` with a provenance table (source path, source, branch or worktree, last commit, copied or moved).
- Running the same manifest twice is a no-op with a clear message.
- A manifest entry pointing into another worktree is copied, and that worktree's `git status` is unchanged.

## Orchestration

Builder writes `src/ingest.ts` on top of the move engine's lock and worktree helpers; reviewer runs fixtures and a dry run on a real repo.

## Depends on

01 (manifest uses scan's document shape), 02 (`.gitboard/` path and default folder)

## Steps

1. Manifest schema and validation, with tests. Done when invalid manifests are refused with a reason.
2. Planner that turns a manifest into an ordered list of operations; `--dry-run` prints it. Done when the planner test matches the expected list.
3. Executor in a move-style worktree with lock, lint gate and one fast-forward commit. Done when the fixture ingest test passes, including the clash and second-run cases.
4. Provenance `references.md` writer. Done when its snapshot test passes.

## UI

none in this phase. The board shows ingested features with no change.

## Files/references

- `src/move.ts`, `src/pipeline.ts`, `src/links.ts`, `src/lint.ts`, new `src/ingest.ts`
- `templates/feature/`
- `file-organizer` skill: propose, confirm, log every move, archive never delete

## Review

Reviewer runs the fixtures and `gitboard ingest --dry-run` against a manifest made by hand for ecomm canvas.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

`npm run typecheck`, `npm test`, and a fixture run showing one new commit and an unchanged worktree status.
