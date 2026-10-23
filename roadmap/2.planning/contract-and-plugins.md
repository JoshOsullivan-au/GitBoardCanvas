# Machine contract and plugin seam

Why: coding agents, the board page and the Architecture tab all read GitBoard Canvas through JSON that has no version and no schema, so any change can break a reader silently; and the Architecture tab, which is shaped by one stack (Next.js, Tempo, Supabase), sits inside the core.

Plan: [`contract-and-plugins/README.md`](./contract-and-plugins/README.md) holds the goals, requirements, testing strategy, order and open decisions.

Builds on `v0-1-release` and the Architecture tab (branch `feat/architecture-tab`).

## Build list

- [ ] Phase 01: a `format` version and a published JSON schema for the board, the move plan and the measure file, with contract tests
- [ ] Phase 02: test suite fixes from the anti-pattern audit, and browser tests for the board page
- [ ] Phase 03: the plugin seam, with the Architecture tab as its first plugin
- [ ] Phase 04: spec, docs and release

## Decisions

- 23/10/2026: `npm run check` (typecheck, build, test) passes before every commit; a pre-commit hook in `.githooks/` runs it, and CI runs it on every push and pull request. Landed before phase 01 because every phase depends on it (Josh).
- 23/10/2026: every promise in SECURITY.md and the spec has an invariant test that would fail if the promise broke; a promise without one does not ship (Josh).
