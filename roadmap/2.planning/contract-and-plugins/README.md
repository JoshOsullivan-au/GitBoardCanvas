# Machine contract and plugin seam

GitBoard Canvas serves four readers: coding agents through the CLI and its JSON, people at the board, teams adopting it on their own repos, and the maintainer's own repos. This feature gives all four one versioned contract and keeps the core small. Done means every JSON GitBoard writes or serves carries a `format` version and validates against a published schema in tests, the board page and every plugin read only through that contract, the Architecture tab runs as a plugin the core does not import, and no commit lands without a passing build and test run.

## Problem

- **No contract.** `gitboard list --json`, the move plan from `--dry-run` and `/api/plan`, and the measure file are read by agents, the page and the Architecture tab, but none has a version or a schema. A renamed field breaks a reader with no warning. The measure file already needed a shape check in the server (ADR 0001) because an old or hand-edited file blanked the tab.
- **One stack in the core.** The Architecture tab assumes Next.js app router routes, OpenTelemetry server spans in Tempo and Supabase endpoints. An adopter on another stack gets a tab that cannot work, and every change to it touches the core.
- **Promises without tests.** 132 tests passed while the board rewrote every checkout's git index every 15 seconds (fixed in `d22b6a7`). The tests checked features; nothing checked SECURITY.md.
- **No gate.** CI runs only when a version tag is pushed, never typechecks, and the CLI tests run against `dist/`, which can be older than `src/`.

## Goals

1. Every JSON output carries `format` and validates against its schema in a test: 3 of 3 outputs (board, move plan, measure).
2. A plugin can add a tab without a change to `src/` outside the plugin seam, shown by a fixture plugin in the tests.
3. Every promise in SECURITY.md and spec R3, R10 to R13 has an invariant test: 100% of listed promises.
4. No commit on `main` fails `npm run check`; CI runs it on Node 22.12 and the current release, on Linux and macOS.
5. `npm run check` stays under 60 seconds on a laptop, so the pre-commit hook is not worth skipping.

## Non-goals

- **A plugin marketplace or remote install.** Plugins are local files the repo owner chose; fetching code would break the no-network promise.
- **Plugins that write.** A plugin reads its data and draws a tab. Moves, git writes and hooks stay in the core.
- **Rewriting the board page in a framework.** No build step for the page; it stays one HTML file plus plain scripts.
- **A second database or stack for the Architecture plugin.** Generalising the measure beyond Next.js, Tempo and Supabase is its own feature.
- **Backward compatibility forever.** A reader refuses an unknown `format` with a plain message; it does not guess.

## User stories

Coding agent:
- As a coding agent, I want `gitboard list --json` to carry `format` and match a published schema, so that I can check I understand the output before I act on it.
- As a coding agent, I want a refused move plan to keep the same shape as an allowed one, so that I read `blocked` without special cases.

Person at the board:
- As a person at the board, I want a tab that cannot read its data to say why, so that I am never looking at a blank page.

Adopter:
- As an adopter on another stack, I want the core without the Architecture tab unless I turn it on, so that nothing in my board assumes a stack I do not use.
- As an adopter, I want to write a tab for my own data with one manifest and one script, so that I do not fork GitBoard.

Maintainer:
- As the maintainer, I want every commit built and tested before it lands, so that a stale `dist/` or a broken typecheck never reaches `main`.

## Requirements

### Must have (P0)

**R-C1. `format` on every output.** `list --json`, the move plan and the measure file carry `"format": 1`.
- Given a board, when `gitboard list --json` runs, then the JSON has `format: 1`.
- Given a measure file without `format` or with `format` above what this build reads, when the tab loads, then `/api/architecture` answers 500 with "written by another version: run gitboard measure again" and the tab shows that line.

**R-C2. Published schemas.** `schemas/board.schema.json`, `schemas/move-plan.schema.json`, `schemas/measure.schema.json` ship in the package.
- Given each fixture repo in the tests, when its outputs are produced, then each validates against its schema.
- Given a change that renames a field, when the tests run, then the contract test fails before any reader does.

**R-C3. Invariant tests for every promise.** One test per promise: reads change nothing (exists, `tests/readonly.test.ts`), no network except named calls, never touches another worktree, loopback only, Host and Origin checks, no stack in errors.
- Given the promise list in SECURITY.md, when a promise is added there, then the review checks a test names it.

**R-P1. Plugin seam.** A plugin is a folder with `gitboard-plugin.json` (`name`, `title`, `data`, `panel`, optional `command`). The server serves `/api/plugins` and `/api/plugins/<name>/data`; the page adds one tab per plugin.
- Given a fixture plugin in the tests, when the board serves, then its tab and data appear with no change to `src/` outside the seam.
- Given no plugins, when the board serves, then the page has no tabs, as today.

**R-P2. Architecture tab as the first plugin.** `src/architecture/` and its tab move behind the seam; the core imports none of it.
- Given the core build, when `grep -r architecture src/` runs outside the plugin folder, then it finds nothing but the seam.

**R-G1. Build and test before commit.** Landed before phase 01; see Testing strategy.

### Nice to have (P1)

- **R-C4.** `gitboard schema <name>` prints a schema, so an agent can fetch it without the package path.
- **R-P3.** A plugin's `command` runs as `gitboard <plugin> <args>` (the Architecture plugin's `measure`).
- **R-T1.** Browser tests at 1440 px in light and dark, replacing the source-text checks in `tests/ui.test.ts`.

### Future (P2)

- MCP and WebMCP tools as a thin wrapper over the contract.
- Plugins from npm packages, still local and chosen by the repo owner.
- Multi-repo boards reading several contracts.

## Testing strategy

### The gate (R-G1, landed before phase 01)

- `npm run check` runs `typecheck`, `build`, then `test`, and stops at the first failure.
- `.githooks/pre-commit` runs `npm run check`. Turn it on once per clone with `git config core.hooksPath .githooks`; `git commit --no-verify` skips it for an emergency, and CI still runs.
- CI (`.github/workflows/ci.yml`) runs `npm ci`, `typecheck` and `test` on every push and pull request, on Node 22.12 and the current release, on Linux and macOS.
- `tests/dist.test.ts` fails when any file in `src/` is newer than the built CLI, so a test run never passes against a stale build.
- Git exports `GIT_DIR`, `GIT_INDEX_FILE` and its other repo variables to hooks. The hook unsets them (`git rev-parse --local-env-vars`) and `tests/setup.ts` clears them again before every test file; `tests/env.test.ts` fails if any survive. On 23/10/2026 the first hook run lacked this, and the suite's temporary repos committed, set config and made a branch in the real repo.

### Layers

| Layer | What | Tool | Share |
| --- | --- | --- | --- |
| Unit | Parsing (ticks, titles, relations, read path, waves), config validation, route reading | Vitest, plain inputs | Most tests |
| Integration | Moves in temporary repos, the server's routes over HTTP, the CLI as installed users run it, `measure` against a fake `gcx` | Vitest, temp git repos, `dist/cli.js` | Some |
| Contract | Every output against its schema (phase 01) | Vitest, a JSON schema validator as a dev dependency | One per output |
| Invariant | Every SECURITY.md promise (reads change nothing, no network, loopback only) | Vitest, before-and-after snapshots | One per promise |
| Browser | The board and each tab at 1440 px, light and dark, links drawn, dialogs open (phase 02) | Playwright as a dev dependency | Few |

### Test-driven development

Every change starts with a test that fails for the reason the change fixes, then the smallest code that passes it. Expected values come from the spec, a worked example or a before-snapshot, never from the code under test. A test that passes before the change is reported as coverage, not as a red step.

### Anti-pattern audit of the current suite (fixed in phase 02)

| Finding | Anti-pattern | Fix |
| --- | --- | --- |
| `tests/ui.test.ts` checks the page's source text (`not.toContain("${group}")`, `drawRoutes(` count) | Testing implementation details | Browser tests that check what a person sees; keep one source check only where no browser test can reach |
| `tests/server.test.ts` picks `40000 + random` as a port | Flaky test | Listen on port 0 and build the server with the port it got |
| `tests/server.test.ts` shares one repo and server across tests, and "plans a move" depends on the file set up for "serves the board" | Shared test state | One fixture per `describe`, built in `beforeEach` where a test changes it |
| CLI tests run `dist/cli.js` with no check that it is current | False confidence | `tests/dist.test.ts` (landed with the gate) |
| Tests inherited git's repo variables from the hook and wrote to the real repo | Hidden dependency on the environment | Fixed with the gate: `tests/setup.ts`, `tests/env.test.ts`, and the hook's `unset` |
| `tests/cli.test.ts` builds 300 features in `beforeEach` for every CLI test, though only one test needs them | Slow test | Build the large repo only in the test that needs it |

## Order

| Phase | File | Depends on |
| --- | --- | --- |
| 01 | [`phases/01-machine-contract.md`](./phases/01-machine-contract.md) | the gate |
| 02 | [`phases/02-test-suite.md`](./phases/02-test-suite.md) | the gate |
| 03 | [`phases/03-plugin-seam.md`](./phases/03-plugin-seam.md) | 01 |
| 04 | [`phases/04-docs-and-release.md`](./phases/04-docs-and-release.md) | 01, 02, 03 |

01 and 02 touch different files and can run at the same time.

## Every phase

- `npm run check` passes before every commit; the pre-commit hook runs it.
- Test first: the failing run and the passing run are both recorded under Verify.
- A tick carries the date and the evidence (commit, test name, output).
- No new runtime dependency. Dev dependencies need a line under Decisions.
- No product-specific names in code, docs or templates (spec Q4).

## Source items

| Item | Phase |
| --- | --- |
| `format` and schemas for board, move plan, measure | 01 |
| Contract tests | 01 |
| Invariant tests for every SECURITY.md promise | 01 |
| Anti-pattern fixes and browser tests | 02 |
| Plugin manifest, `/api/plugins`, tabs from plugins | 03 |
| Architecture tab as a plugin | 03 |
| Spec, configuration, README, CHANGELOG, release | 04 |

## Ops actions

- [ ] Turn on the hook in each clone: `git config core.hooksPath .githooks`
- [ ] Push `.github/workflows/ci.yml` and confirm the first run is green on all four jobs

## Status

| Phase | State |
| --- | --- |
| Gate | Done |
| 01 | Planned |
| 02 | Planned |
| 03 | Planned |
| 04 | Planned |

States: Done, In progress, Planned.

## Success measures

- Leading: every phase's Verify shows a red run before its green run; CI green on all four jobs from the first push.
- Lagging: no fix commit for a broken JSON reader after release; the first plugin written outside this repo needs no core change.

## Open decisions

- Ship as 0.3.0 after `git-github-workflow`, or as 0.2.0 before it?
- Test the contract with `ajv`, or with a small validator in `tests/`?
- Keep plugins in `.gitboard/plugins/`, or list them in the config?
- Ship the Architecture plugin in the main package, or on its own?
