# Phase 02: test suite

## Overview

The anti-pattern audit in the README becomes fixes, and the board page gets browser tests that check what a person sees instead of the page's source text.

## Directive

Fix each audit finding. Add Playwright as a dev dependency and test the Roadmap board and the Architecture tab at 1440 px in light and dark: columns render, a hover draws links, a card opens its dialog, a tab change is remembered.

## Objective/Goal

No test depends on another's state, no test picks a random port, no test checks source text where a browser test can check behaviour, and the suite still runs under 60 seconds.

## Limitations/Restrictions

No visual snapshot diffs in this phase: they are brittle across operating systems. Browser tests check structure and computed values.

## Guardrails

Each fix keeps or raises what the test catches: break the code on purpose once and confirm the new test fails. `npm run check` passes before every commit.

## Done when

- [ ] `tests/server.test.ts` listens on port 0 and builds a fixture per `describe`.
- [ ] The 300-feature repo is built only for the pipe test.
- [ ] Browser tests cover the board and the tab in light and dark, and fail when `drawRoutes` returns early.
- [ ] `tests/ui.test.ts` keeps only checks no browser test can reach.
- [ ] `npm run check` runs under 60 seconds.

## Orchestration

A builder session in its own worktree runs the Steps in order. Each step starts with a failing test and ends with `npm run check` passing.

## Depends on

The gate (landed).

## Steps

1. Ports and shared state in `tests/server.test.ts`.
2. Move the 300-feature setup into its one test.
3. Playwright config and a fixture repo served by `createBoardServer`.
4. Browser tests; break `drawRoutes` once to see them fail.
5. Trim `tests/ui.test.ts`.

## UI

The board page and its tabs, unchanged in look.

## Files/references

`tests/server.test.ts`, `tests/cli.test.ts`, `tests/ui.test.ts`, `tests/browser/` (new), `playwright.config.ts` (new), `package.json`.

## Review

A reviewer who did not build the phase checks Done when against the Verify output.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Not started.

## Verify

`npm run check` and `npx playwright test`, with timings.
