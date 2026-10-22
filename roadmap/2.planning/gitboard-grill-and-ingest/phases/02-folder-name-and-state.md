# Phase 02: `gitboard-roadmap/` and `.gitboard/`

## Overview

Change the default lifecycle folder from `roadmap/` to `gitboard-roadmap/` and add a `.gitboard/` folder for tool state. Repos that already use `roadmap/` keep working.

## Directive

Update the default `roadmapDir`, `gitboard init`, the templates' README title ("GitBoard Roadmap") and the `.gitignore` lines init writes. Add the compatibility rule below.

## Objective/Goal

New installs get `gitboard-roadmap/` and `.gitboard/`; existing installs see no change.

## Limitations/Restrictions

- No automatic rename of an existing `roadmap/` in a user's repo. Moving it is that person's call. This repo's own folder is renamed by hand in step 3.

## Guardrails

- Compatibility: when `gitboard.config.json` is missing and `roadmap/` exists with stage folders, use `roadmap/` and print a one-line note. A config's explicit `roadmapDir` always wins.
- Init never overwrites a file (unchanged rule).

## Done when

- `gitboard init` in an empty repo creates `gitboard-roadmap/` and `.gitboard/`, and `.gitignore` gets `.worktrees/` and `.gitboard/*` with `!.gitboard/ingest/` kept.
- A repo with only `roadmap/` and no config still loads its board.
- README, `docs/configuration.md` and `docs/concepts.md` use `gitboard-roadmap/`.

## Orchestration

Builder changes config and init; reviewer checks both repo shapes.

## Depends on

none

## Steps

1. Default and compatibility rule in `src/config.ts`, with tests. Done when both repo shapes load.
2. Init and template title changes, with tests; the template `README.md` gets OKF front matter (`type`, `title`, `description`, `tags`, `timestamp`). Done when the init test lists the new paths.
3. Rename this repo's own `roadmap/` to `gitboard-roadmap/` with `git mv` and update links. Done when `gitboard lint` and `gitboard list` pass on this repo.
4. Docs update. Done when `git grep "roadmap/"` in docs only shows compatibility notes.

## UI

none

## Files/references

- `src/config.ts`, `src/init.ts`, `templates/roadmap/README.md`, `docs/configuration.md`, `docs/concepts.md`, `README.md`

## Review

Reviewer runs init in a temp repo and loads this repo's own board, which still uses `roadmap/`.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

`npm run typecheck`, `npm test`, `gitboard init` in a temp repo, `gitboard list` in this repo.
