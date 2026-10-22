# Phase 06: real repo dry run, then docs

## Overview

Run GitBoard Grill and a dry-run GitBoard Ingest on a real fragmented repo, fix what breaks, then document both skills and both commands.

## Directive

Use ecomm canvas as the real repo: `product-roadmap/`, `docs/research/`, `.rpe/`, `.archify/`, `.planning/`, `.omc/`, `.claude/worktrees/` and `.worktrees/`. Dry run only; nothing is committed to ecomm canvas.

## Objective/Goal

Evidence that the skills hold up outside fixtures, and docs a new user can follow.

## Limitations/Restrictions

- No real ingest into ecomm canvas in this phase. Its board already exists; the dry run checks detection, duplicate matching and stage suggestions.

## Guardrails

- Read only on ecomm canvas. Its worktrees belong to other sessions.

## Done when

- A grill transcript and a dry-run plan from ecomm canvas, with every candidate either matched to an existing feature or listed as new, are saved under this feature's `docs/`.
- Misclassifications found are fixed in scan or the skills, with a test each.
- README has a "Bring an existing repo" section; `docs/spec.md` documents `scan`, `ingest` and the manifest; `CHANGELOG.md` has the entries.

## Orchestration

Builder runs the session with Josh; reviewer checks the docs against the CLI help.

## Depends on

05

## Steps

1. Grill session and dry run on ecomm canvas. Done when transcripts are saved.
2. Fixes with tests. Done when the suite passes.
3. Docs and changelog. Done when the reviewer signs off.

## UI

none

## Files/references

- `README.md`, `docs/spec.md`, `docs/concepts.md`, `CHANGELOG.md`

## Review

Josh reviews the transcript and the README section.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

`npm run typecheck`, `npm test`, and `git status` on ecomm canvas unchanged after the dry run.
