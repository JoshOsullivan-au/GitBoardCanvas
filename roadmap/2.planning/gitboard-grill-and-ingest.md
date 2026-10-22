# GitBoard Grill and GitBoard Ingest

Why: a team that already has ideas, plans, live build notes and finished work scattered across a repo (root files, `docs/`, dot folders such as `.rpe/` or `.archify/`, agent folders such as `.claude/` or `.planning/`, and open worktrees) cannot start on the board without hand-sorting every file. Two skills and two CLI commands find those files, settle with a person which ones belong on the board, and file the accepted ones into the lifecycle folder by status.

Plan: [`gitboard-grill-and-ingest/README.md`](./gitboard-grill-and-ingest/README.md) holds the order, rules and open decisions.

Builds on `v0-1-core`. Ships after `v0-1-release`.

## Build list

- [ ] Phase 01: `gitboard scan`, a read-only inventory of candidate documents with status evidence
- [ ] Phase 02: lifecycle folder default `gitboard-roadmap/`, tool state in `.gitboard/`, old `roadmap/` still read
- [ ] Phase 03: `gitboard ingest`, which applies an approved manifest in one commit
- [ ] Phase 04: Claude Code plugin skeleton and the `gitboard-grill` skill
- [ ] Phase 05: the `gitboard-ingest` skill
- [ ] Phase 06: dry run on a real fragmented repo, then docs and README

## Decisions

- 22/10/2026: two skills, run in order: `gitboard-grill` decides, `gitboard-ingest` files. Grill never moves a file; ingest never decides inclusion.
- 22/10/2026: the deterministic work (finding files, reading status evidence, moving and committing) lives in the CLI so it is tested; the skills hold the judgement and the conversation.
- 22/10/2026: names follow the GitBoard Canvas convention. Display names are "GitBoard Grill" and "GitBoard Ingest"; skill and plugin identifiers are kebab-case (`gitboard-grill`, `gitboard-ingest`) because plugin components must be.
- 22/10/2026: the lifecycle folder default is `gitboard-roadmap/` (visible, titled "GitBoard Roadmap"); tool state lives in `.gitboard/` (Josh).
