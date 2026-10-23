# Phase 01: machine contract

## Overview

Every JSON GitBoard Canvas writes or serves gets a `format` version and a published JSON schema, checked by contract tests. Readers refuse a format they do not know, with a plain message.

## Directive

Add `format: 1` to the board (`list --json`, `/api/board`), the move plan (`--dry-run`, `/api/plan`) and the measure file. Write `schemas/board.schema.json`, `schemas/move-plan.schema.json` and `schemas/measure.schema.json`, ship them in the package, and validate real outputs against them in tests. Add the missing invariant tests for SECURITY.md.

## Objective/Goal

A renamed or removed field fails a contract test before any reader sees it; an old measure file shows "written by another version" instead of a blank tab.

## Limitations/Restrictions

No new runtime dependency: schemas are data, validation runs in tests only. No change to field names in this phase; `format` is added beside the existing fields.

## Guardrails

Test first for every requirement. Expected shapes come from the schema files, written before the code that has to match them. `npm run check` passes before every commit.

## Done when

- [ ] `list --json`, `--dry-run` and `/api/plan` output `format: 1` (R-C1).
- [ ] Each of the three schemas validates the outputs of every fixture repo in the tests (R-C2).
- [ ] A measure file with no `format`, or a higher one, answers 500 with "written by another version: run gitboard measure again" (R-C1).
- [ ] Each SECURITY.md promise names its test, and each test fails when the promise is broken on purpose (R-C3).
- [ ] `npm run check` passes.

## Orchestration

A builder session in its own worktree runs the Steps in order. Each step starts with a failing test and ends with `npm run check` passing.

## Depends on

The gate (landed). Open decision: the JSON schema validator.

## Steps

1. Write the three schemas from today's outputs and the types in `src/types.ts` and `src/architecture/measure.ts`.
2. Contract tests: validate the outputs of the existing fixtures; watch them fail on the missing `format`.
3. Add `format`; watch them pass.
4. Reader checks for an unknown `format` in the server and the page.
5. Invariant tests: no network except named calls, never touches another worktree, loopback only. Break each promise on purpose once to see the test fail.

## UI

none

## Files/references

`src/types.ts`, `src/board.ts`, `src/move.ts`, `src/server.ts`, `src/architecture/measure.ts`, `schemas/` (new), `package.json` `files`, `tests/contract.test.ts` (new), `tests/readonly.test.ts`, SECURITY.md.

## Review

A reviewer who did not build the phase checks Done when against the Verify output.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Not started.

## Verify

`npm run check`, with the red run of each contract test and each invariant test recorded.
