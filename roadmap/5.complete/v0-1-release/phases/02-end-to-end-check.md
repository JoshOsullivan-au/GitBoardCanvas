# Phase 02: end-to-end check

## Overview

Run GitBoard Canvas against a fresh repository and fix what breaks. Cover init, serve, list, lint and a move from the board.

## Directive

Start from an empty repo, follow the README exactly, and note every step that does not work.

## Objective/Goal

The quick start in the README works unchanged on Node 22.12 and the current Node release.

## Limitations/Restrictions

Fixes only. New features go to a new roadmap item.

## Guardrails

Never run the check inside a repo that holds real work.

## Done when

- `npx gitboard-canvas init` creates the folders, templates and config.
- A move from the board lands one commit.
- `gitboard lint` exits 0 on a fresh repo.

## Orchestration

A tester runs the steps, a builder fixes, the tester repeats.

## Depends on

Phase 01

## Steps

1. Create a temporary repo.
2. Run the quick start.
3. Record each failure and fix it.

## UI

none

## Files/references

[`../README.md`](../README.md), `docs/spec.md`.

## Review

A second person repeats the quick start from the README alone.

## Loop

A failed check returns to Steps.

## Execution

22/10/2026, branch `release/v0-1-e2e`.

- Packed the package (`npm pack`, 32 files, 67.9 kB) and installed the tarball into a new temporary repo, so the run matches `npx gitboard-canvas` once published.
- Ran the README quick start as a script on Node 22.12.0 and Node 26.8.2: init, copy the template, commit, lint, list, serve, a move through the board's `/api/move`, a terminal move, lint again.
- A second agent repeated the quick start from the README alone. Every step passed. Findings fixed: step 5 read as if a person both drags and runs the terminal move (it now says "instead of dragging"), and `gitboard serve` did not say how to stop it (it now prints "Press Ctrl+C to stop."). Finding for phase 03: when run through `npx`, `--version` and `--help` reach npm unless they follow `--`.
- Rerun on Node 22.12 after the fixes: all steps pass.

## Verify

| Done when | Node 22.12.0 | Node 26.8.2 |
| --- | --- | --- |
| `init` creates the folders, templates and config | exit 0; five stage folders, `templates/feature/`, `gitboard.config.json`, `.gitignore` with `.worktrees/` | exit 0, same |
| A move from the board lands one commit | `POST /api/move` 200, commits added: 1, subject `gitboard: move checkout-redesign to Planning` | same |
| `gitboard lint` exits 0 on a fresh repo | `gitboard lint: ok`, exit 0 | same |

`npm run typecheck` clean and `vitest run` 102 of 102 on Node 22.12.
