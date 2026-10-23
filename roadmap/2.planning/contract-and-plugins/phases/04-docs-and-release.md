# Phase 04: docs and release

## Overview

The spec, configuration guide, README, SECURITY.md and CHANGELOG describe the contract, the plugin seam and the gate, and the version is released.

## Directive

Update the docs, add an ADR for the plugin seam, tag the release, and confirm CI is green on every job.

## Objective/Goal

A reader of the docs can write a plugin and read the JSON contract without opening the source.

## Limitations/Restrictions

No feature work in this phase.

## Guardrails

Australian English, DD/MM/YYYY, no product-specific names. Every command in the docs is run once before release. `npm run check` passes before every commit.

## Done when

- [ ] `docs/spec.md` lists the contract, the seam and the gate as requirements.
- [ ] `docs/adr/0002` records the plugin seam.
- [ ] CHANGELOG has the release.
- [ ] CI green on all jobs for the release commit.

## Orchestration

A builder session in its own worktree runs the Steps in order. Each step starts with a failing test and ends with `npm run check` passing.

## Depends on

Phases 01, 02 and 03. Open decision: the release number.

## Steps

1. Docs.
2. ADR 0002.
3. Run every documented command on a fresh clone.
4. Tag and release.

## UI

none

## Files/references

`docs/`, `README.md`, `SECURITY.md`, `CHANGELOG.md`, `package.json`.

## Review

A reviewer who did not build the phase checks Done when against the Verify output.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Not started.

## Verify

CI run link and the fresh-clone command log.
