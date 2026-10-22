# Phase 01: pull request status on cards

## Overview

Read check results, review state and merge conflicts for each open pull request in the existing `gh pr list` call, and show them on the card's chip, its details panel and the filters.

## Directive

Extend the pull request read in `src/pipeline.ts`, carry the new fields through `PullRequest` and `CardGit.pr`, and render them in `src/ui/board.html`. Add the fake `gh` test kit every later phase uses.

## Objective/Goal

A reviewer sees on the board which features have failing checks, need review, or conflict, without opening GitHub.

## Limitations/Restrictions

- Read only. No new endpoint, no new poll; the once-a-minute pull request cache stays.
- Check names and logs are out of scope; the card shows the rolled-up state and links to the pull request.

## Guardrails

- `github: false` still makes no `gh` call.
- A `gh` failure still means `prs: null` and "Missing GitHub", never "no pull requests".

## Done when

- `gh pr list` asks for `statusCheckRollup,reviewDecision,mergeable` beside the current fields.
- Rollup reduces to `pass`, `fail`, `pending` or `null`: any failure, error, cancel or timeout is `fail`; else any queued or in-progress run is `pending`; else `pass`; no runs is `null`.
- `CardGit.pr` carries `checks`, `review` (`approved`, `changes`, `required` or null) and `conflicts`.
- The card chip shows the worst state first (conflicts, failing, changes requested, pending, review required, passing) and the details panel shows each one.
- Filters "Checks failing" and "Needs review" work.
- A fake `gh` on `PATH` in tests returns fixture JSON; pipeline and server tests cover each state and a `gh` failure.

## Orchestration

Builder; a reviewer who did not write it checks the rollup rules against GitHub's documented states.

## Depends on

none

## Steps

1. Fake `gh` kit: `tests/fixtures/gh.mjs` plus a helper that puts it first on `PATH` and points it at a JSON file. Done when a test reads fixture pull requests through `readPipeline`.
2. Fields, types and rollup reducer, with unit tests. Done when every state maps as above.
3. Chip, details and filters in `board.html`, with a UI test. Done when the test sees each state's text.

## UI

Card chip text and colour follow the existing `gs-pr` chip; failing and conflicts use the attention tone. No new layout.

## Files/references

- `src/pipeline.ts` (pull request read, cache, attribution), `src/types.ts` (`CardGit.pr`), `src/ui/board.html` (gitBadge, filters, details), `tests/pipeline.test.ts`, `tests/server.test.ts`
- Closes `github-pr-checks`.

## Review

A second person runs the board against a real repo with open pull requests and compares with GitHub.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

`npm run typecheck`, `npm test`, and a screenshot of a card in each state.
