# Phase 05: spec, docs and release 0.2.0

## Overview

Rewrite the promises the earlier phases change on purpose, document the new settings, review the whole feature, and release 0.2.0.

## Directive

Update `docs/spec.md`, `docs/concepts.md`, `docs/configuration.md`, `README.md` and `CHANGELOG.md`; run three reviewers; publish.

## Objective/Goal

The docs match the tool, and 0.2.0 is on npm and GitHub Packages.

## Limitations/Restrictions

- No behaviour changes in this phase except review fixes.

## Guardrails

- Spec wording to change, and only this: the "never pushes" promise becomes "never force-pushes, and pushes only `gitboard-move/*` branches when `landing` is `"pr"`"; R3 network calls add pushing and opening pull requests in that mode; the section 3 out-of-scope line keeps issues, project boards, comments, labels and merges out.
- Every other promise in spec section 1.7 stays word for word.

## Done when

- Spec, concepts and configuration describe `landing`, `remote` and `branches`, and the new card states.
- README has "Working with pull requests" and "A worktree per feature" sections and the `For coding agents` list mentions the feature worktree.
- `scripts/demo-repo.mjs` shows check states on demo pull request data where it can without a network.
- Three reviewers (simplicity, correctness, conventions) report; fixes land with tests.
- 0.2.0 published to npm and, through the tag, to GitHub Packages; `npx gitboard-canvas@0.2.0` checked on Node 22.12 and the current release.

## Orchestration

Builder writes docs; three reviewers in parallel; builder fixes; release.

## Depends on

02, 04

## Steps

1. Spec and docs. Done when a reader can set up `landing: "pr"` from the docs alone.
2. Reviews and fixes. Done when no reviewer finding is open.
3. Release. Done when both registries show 0.2.0.

## UI

none

## Files/references

- `docs/spec.md` (1.7, the never-pushes line, R3, section 3), `docs/concepts.md`, `docs/configuration.md`, `README.md`, `CHANGELOG.md`, `scripts/demo-repo.mjs`, `.github/workflows/github-packages.yml`

## Review

A second person sets up `landing: "pr"` on a fresh repo from the README alone.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

`npm run typecheck`, `npm test`, `npm view gitboard-canvas version`, and the GitHub Packages run link.
