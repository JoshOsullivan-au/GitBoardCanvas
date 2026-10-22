# Phase 02: end-to-end check

## Overview

Run Gitboard Canvas against a fresh repository and fix what breaks. Cover init, serve, list, lint and a move from the board.

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

In progress.

## Verify

Command output for each Done when line.
