# Changelog

Format follows Keep a Changelog. Dates are DD/MM/YYYY.

## Unreleased

### Added

- Architecture tab beside the Roadmap board, shown when `gitboard.config.json` has an `architecture` block. It lays out every page the app serves (request, pages, database, cache and providers), with each page's warm server time against a budget, its calls and their waves, a hover trace drawn with the board's own link routing, and a read path per page and per endpoint.
- `gitboard measure --from <iso> [--to <iso>]` reads the live pages of a Next.js app router from Grafana Tempo through `gcx` and writes the tab's data file.
- `GET /api/architecture` serves that file.
- Icons `Buildings`, `Door`, `House`, `Plug`, `Stethoscope`, `Storefront`, `SunHorizon`, `Timer` and `UserCircle`.

### Fixed

- The board's background refresh no longer rewrites the git index of the checkouts it reads. Every git call now runs without optional locks, so `git status` cannot take `index.lock` while another session runs `git add` or `git commit`.
- `gitboard init` no longer writes through a symlink it finds where a template, the config or `.gitignore` would go, and creates files only where nothing is.
- `gitboard measure` refuses to overwrite a file at `architecture.data` that is not an earlier measure.

## 0.1.2 (22/10/2026)

### Fixed

- `gitboard list --json` piped into another command (`| jq`, `| node`, `| wc -c`) no longer stops at 64 KiB. The CLI now waits for stdout and stderr to finish writing before it exits, so large boards come through whole.

## 0.1.1 (22/10/2026)

### Fixed

- Moving the last feature out of a stage no longer removes the stage folder from git. The move commit adds a `.gitkeep`, as `gitboard init` does, so `gitboard lint` stays clean in the checkout and in fresh clones.
- The README's `npx` note: flags pass through as they are (`npx gitboard-canvas --version`); the `--` it suggested started the board instead.

## 0.1.0 (22/10/2026)

First version.

- Board page with one column per stage, groups, filters and a details panel.
- Moves by drag, keyboard or `gitboard move`: `git mv`, link rewrite, hooks, lint gate and one commit.
- Relations (blocked, gated, linked) and a git pipeline (WIP, staged, committed, PR, landed) read from the repo.
- `gitboard init`, `serve`, `move`, `lint` and `list`.
- Configuration in `gitboard.config.json`, including an optional icon per group.
- `scripts/demo-repo.mjs` builds a demo repository to try the board on.

### Fixed

- Lint and link rewrite read a whole link path that holds parentheses, such as `app/(shell)/page.tsx`, instead of stopping at the first `)`.
- Dark mode text is readable: the glass rim no longer washes columns and cards in white, and blocked card titles use the muted colour instead of reduced opacity.

### Changed

- The display name is GitBoard Canvas. The package name, the `gitboard` command and `gitboard.config.json` are unchanged.
