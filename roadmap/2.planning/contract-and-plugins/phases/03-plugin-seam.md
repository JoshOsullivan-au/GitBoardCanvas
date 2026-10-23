# Phase 03: plugin seam

## Overview

A tab beside the Roadmap comes from a plugin: a manifest, a data file and a panel script. The Architecture tab moves behind the seam and the core stops importing it.

## Directive

Define `gitboard-plugin.json`, serve `/api/plugins` and `/api/plugins/<name>/data`, add one header tab per plugin, and move `src/architecture/` and its page code into the first plugin.

## Objective/Goal

A fixture plugin adds a tab with no change to `src/` outside the seam, and the core build has no Architecture code.

## Limitations/Restrictions

Plugins read their data and draw; they never write, run hooks or move cards. No remote install.

## Guardrails

The same Host checks, path checks (data must resolve inside the repo) and read-only invariants as the core. The Architecture tab must still match the approved mock at 1440 px in light and dark. `npm run check` passes before every commit.

## Done when

- [ ] A fixture plugin's tab and data appear in a browser test (R-P1).
- [ ] No plugins: no tabs, as today.
- [ ] Nothing in `src/` outside the seam imports the Architecture code (R-P2).
- [ ] `gitboard measure` still writes the measure file, through the plugin's command.
- [ ] Read-only invariant tests pass with the plugin on.

## Orchestration

A builder session in its own worktree runs the Steps in order. Each step starts with a failing test and ends with `npm run check` passing.

## Depends on

Phase 01 (plugins read through the contract). Open decisions: plugin location, packaging.

## Steps

1. Manifest schema and a fixture plugin; tests fail.
2. Server routes and the page's tab loader; tests pass.
3. Move the Architecture code behind the seam; the existing architecture tests move with it and still pass.
4. Browser check against the mock.

## UI

The Architecture tab, unchanged in look; the approved mock is the reference.

## Files/references

`src/server.ts`, `src/config.ts`, `src/cli.ts`, `src/ui/board.html`, `src/architecture/` (moves), `schemas/plugin.schema.json` (new), `tests/plugins.test.ts` (new).

## Review

A reviewer who did not build the phase checks Done when against the Verify output.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Not started.

## Verify

`npm run check`, browser tests, and screenshots at 1440 px in light and dark beside the mock.
