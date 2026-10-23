# Checklist

One tick list per phase. Tick a task when its step is done, and add the date and evidence.

## Gate

- [x] `npm run check` runs typecheck, build and test. **Completed** 23/10/2026: see Execution in the README's Status.
- [x] `.githooks/pre-commit` runs `npm run check`. **Completed** 23/10/2026
- [x] CI on push and pull request, Node 22.12 and current, Linux and macOS. **Completed** 23/10/2026: `.github/workflows/ci.yml`, not yet run on GitHub
- [x] `tests/dist.test.ts` fails on a stale build. **Completed** 23/10/2026

## Phase 01

- [ ] Schemas written
- [ ] Contract tests red, then green
- [ ] Unknown `format` refused
- [ ] Invariant tests for every SECURITY.md promise
- [ ] Verify run and output recorded

## Phase 02

- [ ] Ports and shared state fixed
- [ ] Large repo built in one test only
- [ ] Browser tests in light and dark
- [ ] `tests/ui.test.ts` trimmed
- [ ] Verify run and output recorded

## Phase 03

- [ ] Manifest and fixture plugin
- [ ] Server routes and tab loader
- [ ] Architecture tab behind the seam
- [ ] Browser check against the mock
- [ ] Verify run and output recorded

## Phase 04

- [ ] Docs and ADR 0002
- [ ] Fresh-clone command run
- [ ] Release and green CI
- [ ] Verify run and output recorded
