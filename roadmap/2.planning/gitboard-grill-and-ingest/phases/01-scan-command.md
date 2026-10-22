# Phase 01: `gitboard scan`

## Overview

A read-only CLI command that walks the repo and its worktrees, finds candidate planning and build documents, and reports status evidence for each one. It is the fact base both skills stand on.

## Directive

Add `gitboard scan [--json] [--include-ignored] [--max-files N]` to `src/cli.ts`, backed by a new `src/scan.ts`. Print a grouped human summary by default and a stable JSON document with `--json`.

## Objective/Goal

One command lists every document a person might want on the board, grouped into candidate features, with a suggested stage, a confidence and the evidence lines, and changes nothing on disk.

## Limitations/Restrictions

- Markdown and plain text only (`.md`, `.mdx`, `.txt`). No PDFs or images in 0.2.
- No network. GitHub data is out of scope here.
- Does not read file bodies past 256 KB.

## Guardrails

- Never writes, stages or commits. The test suite asserts the git status is identical before and after.
- Worktrees are read through their paths from `git worktree list --porcelain`; nothing is checked out or switched.
- The deny list and `rewriteSkip` are pruned with `find`-style pruning, never walked then filtered.

## Done when

- `gitboard scan --json` on a fixture repo returns every expected document and none of the denied ones.
- Each document has `path`, `source` (root, docs, dot-folder, agent-folder, worktree, lifecycle), `tracked`, `ignored`, `worktree` (path and branch when relevant), `lastCommit`, `mtime`, `checkboxes` (ticked and open), `headings`, `title`, `suggestedStage`, `confidence`, `evidence[]`.
- Documents are clustered into candidates by shared slug, shared branch or worktree, and cross-links.
- Docs already in the lifecycle folder are reported as `onBoard` and matched to candidates as possible duplicates.
- The JSON shape is documented in `docs/spec.md` and has a schema test.

## Orchestration

Builder implements `src/scan.ts` and fixtures; reviewer runs the fixture suite and one real repo.

## Depends on

none

## Steps

1. Fixture repo builder in `tests/fixtures/scan/`: root plan files, `docs/`, `.rpe/`, `.archify/`, `.claude/plans/`, `.claude/skills/` (must be excluded), a gitignored `.omc/plans/`, a linked worktree on a branch with commits ahead, and an existing lifecycle folder. Done when the builder script runs clean.
2. Walker with prune list and agent-folder include and exclude patterns. Done when the walker test passes.
3. Evidence extractor (checkbox counts, headings, decision lines, done markers, last commit, branch ahead count). Done when unit tests cover each rule in the stage evidence table.
4. Clusterer and stage suggester. Done when fixture candidates match the expected stages.
5. CLI wiring, human output, `--json`. Done when the CLI test passes.

## UI

none

## Files/references

- `src/cli.ts`, new `src/scan.ts`, `src/git.ts` (worktree listing), `src/config.ts` (`rewriteSkip`)
- `src/board.ts` for how features and slugs are read today
- `file-system` skill: prune patterns and metadata commands

## Review

A reviewer who did not write the code runs the suite and `gitboard scan` on ecomm canvas, read only.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

`npm run typecheck`, `npm test`, and `git status --porcelain` unchanged after `gitboard scan` on the fixture and on ecomm canvas.
