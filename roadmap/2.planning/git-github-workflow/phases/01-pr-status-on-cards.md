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

- 24/10/2026: fake `gh` kit in `tests/fixtures/gh.mjs` and `tests/fake-gh.ts`. It logs each call and answers `gh pr list` from a fixture file, or exits 1.
- 24/10/2026: `src/pipeline.ts` asks `gh pr list` for `statusCheckRollup,reviewDecision,mergeable`. `rollupChecks` buckets checks the way `gh pr checks` does. A completed check run is read by its conclusion, a running one by its status, and a commit status by its state. FAILURE, ERROR, CANCELLED, TIMED_OUT, ACTION_REQUIRED and STARTUP_FAILURE count as `fail`. SUCCESS, NEUTRAL and SKIPPED count as passed. Anything else (queued, in progress, waiting, expected, stale) is `pending`. `reviewState` maps the review decision, and `mergeable: CONFLICTING` sets `conflicts`. `PullRequest` and `CardGit.pr` (`src/types.ts`) carry the three fields.
- 24/10/2026: `src/ui/board.html` puts the worst state on the chip as "PR #n · Failing" and similar. Conflicts and Failing use the attention tone and the Warning icon. The details panel lists each state, plus Approved and Draft. New filters: "Checks failing" and "Needs review". A draft never counts as needing review, on the chip or in the filter.
- 24/10/2026: tests in `tests/pipeline.test.ts` (rollup, review, a fixture read through `readPipeline`, a `gh` failure, `github: false`), `tests/server.test.ts` (board JSON carries the states; a `gh` failure gives Missing GitHub) and `tests/ui.test.ts` (the chip order and each state's text, run from the page's own code). `npm run check`: 168 tests pass.
- 24/10/2026: visual check on the demo repo with the fake `gh`, in light and dark. Each chip state, the details panel and both filters work. Waiting on Review: a person compares against a real repo with open pull requests.
- 24/10/2026: a reviewer checked the rollup against the gh CLI source (`pkg/cmd/pr/checks/aggregate.go`). Fixed: a re-run now replaces the earlier run of the same check, as in `gh pr checks`, so a check that failed and then passed shows as passing. Malformed rollup entries are skipped instead of failing the whole read. `reviewState` ignores prototype keys. The server test covers every state on a random free port. Different from gh on purpose, as this plan sets it: CANCELLED and STARTUP_FAILURE count as `fail`. 169 tests pass.
- 24/10/2026: checked against real GitHub data (Review). Found and fixed:
  - Asking `gh pr list` for `statusCheckRollup` makes GitHub answer HTTP 502 or 504 on big repos (BoundaryML/baml: 100 PRs with up to 155 checks each). The whole read then failed, so cards lost every pull request. Now the list call is unchanged. A second, read-only `gh api graphql` call (`PR_STATUS_QUERY`) asks for GitHub's own rollup state, review decision and mergeable. If only the status call fails, the pull requests still show, without status. This replaces `rollupChecks` with `checksState` and `parsePrStatus`. The status call has a 30 s timeout: on baml it took 7 to 11 s alone and went past 20 s beside the list.
  - GitHub answers `statusCheckRollup { state }` alone with SUCCESS on commits with over about 100 checks, even when checks failed (baml #5354, #5352, #5351, #5123). Asking for `contexts(first: 1) { totalCount }` beside it gives the right state at the same speed.
  - On narrow cards, the longer PR chip pushed the date chip off the card's left edge. Now the git chip always shows and the date chip drops out when both do not fit (`.chips.fit`).
- 24/10/2026: Review result. The board's checks, review, conflicts and draft match `gh pr checks` and `gh pr view` on 296 of 296 open PRs across 11 repos (ag2ai/ag2, cli/cli, WXYC/Backend-Service, and 8 of Josh's repos). On BoundaryML/baml, all 100 PRs read, and every case where the board differs from `gh pr checks` was checked against the REST API: `gh pr checks` cuts its list off at about 100 checks and misses failures, and failing runs that are not part of the pull request (for example "Cleanup artifacts" on cli/cli #13155, #12682) are not counted by GitHub either. On a scratch repo with features named after 24 live ag2ai/ag2 PR branches, the served board's chips matched GitHub on 24 of 24 (#3473's last check finished 30 s before the comparison; the board's next read showed it). 171 tests pass.
- 24/10/2026: `github-pr-checks` items ticked. The card stays in 2 Planning: `gitboard move git-github-workflow 4 --dry-run` from the main checkout answers "claude/gitboard-outstanding-345d93 has roadmap work for it that is not on main. Land it first." It moves once this branch lands.

Known limits, for Review:

- `reviewDecision` is only set when branch protection requires reviews. On other repos, Changes requested and Review required never show.
- GitHub works out `mergeable` lazily, so the first read after a push is often UNKNOWN (no conflicts shown). With the one-minute cache, a conflict can show up to a minute late. Seen live: ecommerce-simple-dashboard-v0 #84 read MERGEABLE, then CONFLICTING on the next call.
- Status covers the newest 100 open pull requests, the same 100 `gh pr list` returns.
- A draft is never counted as needing review. The chip and the "Needs review" filter both follow this rule, and the details panel shows Draft.

## Verify

`npm run typecheck`, `npm test`, and a screenshot of a card in each state.
