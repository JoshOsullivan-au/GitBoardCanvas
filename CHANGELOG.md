# Changelog

Format follows Keep a Changelog. Dates are DD/MM/YYYY.

## 0.1.0 (unreleased)

First version.

- Board page with one column per stage, groups, filters and a details panel.
- Moves by drag, keyboard or `gitboard move`: `git mv`, link rewrite, hooks, lint gate and one commit.
- Relations (blocked, gated, linked) and a git pipeline (WIP, staged, committed, PR, landed) read from the repo.
- `gitboard init`, `serve`, `move`, `lint` and `list`.
- Configuration in `gitboard.config.json`, including an optional icon per group.
- `scripts/demo-repo.mjs` builds a demo repository to try the board on.

### Fixed

- Lint and link rewrite read a whole link path that holds parentheses, such as `app/(shell)/page.tsx`, instead of stopping at the first `)`.
