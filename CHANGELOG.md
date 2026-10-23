# Changelog

Format follows Keep a Changelog. Dates are DD/MM/YYYY.

## Unreleased

### Added

- Architecture tab beside the Roadmap board, shown when `gitboard.config.json` has an `architecture` block. It lays out every page the app serves (request, pages, database, cache and providers), with each page's warm server time against a budget, its calls and their waves, a hover trace drawn with the board's own link routing, and a read path per page and per endpoint.
- `gitboard measure --from <iso> [--to <iso>]` reads the live pages of a Next.js app router from Grafana Tempo through `gcx` and writes the tab's data file.
- `GET /api/architecture` serves that file.
- Icons `Buildings`, `Door`, `House`, `Plug`, `Stethoscope`, `Storefront`, `SunHorizon`, `Timer` and `UserCircle`.
- Pull request status on cards: checks passing, failing or pending, review approved, changes requested or review required, and merge conflicts, read once a minute beside the pull request list through a read-only `gh api graphql` query of GitHub's own rollup, so it holds up on repos with many checks. If only that query fails, cards still show their pull requests. The chip shows the worst state, with conflicts and failing checks in the attention tone, and the details panel lists each one. New filters: "Checks failing" and "Needs review". A draft is not counted as needing review.
- `architecture.calls`, `architecture.pathFolds` and `architecture.platform`: each repo describes its own database, cache and host. Rules match a call on host, path prefix or span name prefix and give its endpoint name, column, group, label and icon. An example preset for one stack is in `docs/presets/`. Without rules every call with a URL is a provider.
- `architecture.pagesCommand`: a command that lists every page route, for apps that are not on the Next.js app router.
- The measure file carries `format` (2) and `targets`. The board draws an older file with targets described from the current rules.

### Fixed

- The board's background refresh no longer rewrites the git index of the checkouts it reads. Every git call now runs without optional locks, so `git status` cannot take `index.lock` while another session runs `git add` or `git commit`.
- `gitboard init` no longer writes through a symlink it finds where a template, the config or `.gitignore` would go, and creates files only where nothing is.
- `gitboard measure` refuses to overwrite a file at `architecture.data` that is not an earlier measure.
- A config written by `gitboard init` (`"architecture": null`) loads again; `null` means no Architecture tab.
- `gitboard init` skips a template or stage folder that is a symlink, and `gitboard measure` refuses a data path with a link on it; the measure file is written beside the target and renamed over it.
- The measure reads the calls of the configured service's server span, not an upstream service's listed first in the trace.
- A `gcx` failure fails at once instead of retrying when the trace id happens to contain `503`; the cache check's `HEAD` request gives up after 10 seconds.
- On the Architecture tab, a provider or cache call made on every page shows once, in its own column, and a page with no request shows the measured reason instead of always "Served from the host's cache".
- An access-check endpoint shows once, in Access checks, not also in its own database group.

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
