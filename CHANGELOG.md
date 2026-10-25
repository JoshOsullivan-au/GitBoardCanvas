# Changelog

Format follows Keep a Changelog. Dates are DD/MM/YYYY.

## Unreleased

### Changed

- A feature's details show its stage and group as pills beside the title. The stage pill takes its colour from the stage's place on the board: the first stage grey, the last green, and the stages between purple, blue and amber towards done, so the default lifecycle reads Ideas grey, Planning purple, Open blue, In progress amber, Complete green.

## 0.2.0 (25/10/2026)

### Changed

- The board is a dashboard shell. A shadcn sidebar says where you are: Roadmap, with Work in flight and Needs you under it, and Architecture, each with its count; the docs, the theme and the read status sit at its foot. Work in flight and Needs you open a second bar beside the main one, which shrinks to icons, listing each branch with work or what needs you (blocked, gated, checks failing, needs review); picking one opens it on the board and closes the bar, and a branch also opens its feature's details. A slim top bar holds the breadcrumb, the Lifecycle and Help menus and the view's search. Every place is a link (`#/roadmap?stage=2`, `#/roadmap?branch=…`, `#/architecture`), so back, forward and reload work. Picking Roadmap or Architecture folds the sidebar to icons and opens the view. Reached another way, the sidebar opens expanded on the Roadmap and folded on Architecture, then remembers each view's toggle; ⌘B or Ctrl+B toggles it. The view tabs in the header are gone, and the map's link corridors are 64px beside the sidebar. Once a board scrolls, its sticky column headers turn more opaque so cards passing under them do not show through.

- The board page is built in React from `src/web` and ships as one inlined page, with the same look and behaviour. shadcn/ui parts can be added on the board's tokens (ADR 0004). React, Vite and Tailwind are build-time only; the one runtime dependency is still `marked`.

### Added

- `gitboard --version` names the build: `0.2.0 (6681e5a, built 25/10/2026)` when built from a git checkout. `gitboard serve` prints the same at start. Run from a linked clone that was pulled or switched without `npm run build`, both warn that the build is behind the checkout.
- `gitboard update [--check]` updates the install it runs from. A global npm install moves to the latest published version. A linked clone fast-forwards to its upstream, runs `npm ci` when the lockfile changed, rebuilds and lists the new commits, and refuses uncommitted or conflicted changes or local commits. A copy inside a project prints the `npm install -D` command, so the project's lockfile stays the one place its version changes.
- Releases: `npm version <patch|minor|major>` runs the checks, files Unreleased under the new version and tags it; pushing the tag publishes to npmjs.com with provenance and opens a GitHub release from that changelog section.

- Hovering or focusing a card draws each dependency that still blocks as a red dotted line with an arrowhead, to or from the blocked features, above the other links. Dependencies that no longer block keep their soft blue line.

- `GET /api/docs` lists the docs the sidebar offers: the lifecycle folder's README and, when the repo has them, `docs/spec.md`, `docs/configuration.md`, `docs/adr/README.md` and `CHANGELOG.md`. `GET /api/doc` opens those paths too, and still no other file outside the lifecycle folder.
- Icons `ArrowSquareOut`, `DotsThree`, `FileText`, `Kanban`, `Sidebar` and `TreeStructure`.

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
