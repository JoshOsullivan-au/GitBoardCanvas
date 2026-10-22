# Phase 02: a merged pull request counts as Landed

## Overview

Read recently merged pull requests and show a feature's merge on its Landed step, marked not pulled until the local main branch has the merge commit.

## Directive

Add a second, cached `gh pr list --state merged` read and a `merged` source beside the existing `Card.landed`.

## Objective/Goal

A feature merged on GitHub looks landed on the board straight away, and the board says when the local checkout is behind.

## Limitations/Restrictions

- The last 50 merged pull requests only, refreshed at most every five minutes.
- Attribution uses the same rules as open pull requests (branch name, roadmap files, named code paths).

## Guardrails

- No pull, fetch or merge by the tool. "Not pulled" is computed with `git merge-base --is-ancestor <mergeCommit> <mainBranch>`, which reads only.
- A missing merge commit locally counts as not pulled, never as an error.

## Done when

- `Card.landed` can carry `pr: { number, url, mergedAt, pulled }` beside the local commit, and the Landed step shows the newer of the two.
- "Not pulled" shows on the step and the "Not pulled" filter works.
- Tests with the fake `gh` cover merged and pulled, merged and not pulled, and `gh` failure.

## Orchestration

Builder; reviewer checks the five-minute cache and that nothing writes.

## Depends on

01 (fake `gh` kit, pull request types)

## Steps

1. Merged read, cache and type, with tests. Done when fixture merges reach the right cards.
2. Pulled check and Landed step rendering, with tests. Done when both states render.

## UI

The existing Landed step gains the pull request number and a "not pulled" note.

## Files/references

- `src/pipeline.ts`, `src/board.ts` (landed), `src/types.ts`, `src/ui/board.html`

## Review

Reviewer merges a pull request on a test repo and watches the card before and after `git pull`.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

`npm run typecheck`, `npm test`, and the before and after screenshots.
