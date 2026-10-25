---
title: "Board shell review fixes, blocked links and rollout"
author: Josh
date: 2026-10-25
branch: claude/board-shell-sidebar-1fdb7b
cost: { minutes: 121, tokens: 509235 }
touches:
  - docs/spec.md
  - src/web/components/ui/.omc/state/sessions/ba9e5ee9-2e41-4c93-bb7a-0178243addc4/pre-tool-advisory-throttle.json
  - src/web/lib/markdown.tsx
  - tests/ui.test.tsx
  - src/web/App.tsx
  - src/web/components/shell/AppSidebar.tsx
  - src/web/components/shell/DocDialog.tsx
  - src/web/lib/hash.ts
  - CHANGELOG.md
  - src/web/lib/routes.ts
---

## Decided
- Blocked dependencies on the Roadmap draw as their own link kind, `stop` (src/web/lib/routes.ts KINDS, drawn last), red dots with an arrowhead. Architecture keeps `blk` for its solid call lines, so the map's look did not change.
- The red is the `--stop` token in board.css: oklch(0.79 0.192 19.6) light, oklch(0.71 0.164 18.3) dark. Josh picked and locked it with a colour wheel mock, and kept it after CodeRabbit flagged ~2:1 contrast in light mode. Do not darken it without asking him.
- Sticky column headers (.fwsh) turn more opaque once a board scrolls: App sets `data-scrolled` on the .scroll element in an onScroll handler (no React state, no re-render), and CSS raises --lg-base to 88% of --background.
- A branch row in the second bar opens its lead feature's details (navOf `lead`, most files on the branch) through a `show` prop the Roadmap counts by `n`.
- The second bar reopens on Back between two branches or two filters: App watches `placeKey(route)` (lib/hash.ts), not just which bar a place belongs to; `rowPicked` is set only when a pick changes the place.
- DocDialog numbers each /api/doc request and drops stale replies; Back and Close invalidate pending ones.
- Doc links: http(s) and protocol-relative open in a new tab, mailto: goes to the browser, any other scheme is never followed (Marked does not sanitise links).
- PR #6 merged into main as 6681e5a (merge commit, as earlier PRs). Josh's global `gitboard` is an `npm link` to /Users/home/GitBoardCanvas, so a project like ecomm canvas updates with `git pull --ff-only --autostash && npm install && npm run build` there.

## Tried and ruled out
- Code-splitting to silence Vite's "chunks larger than 500 kB" warning: copy-ui.mjs inlines one page and the server serves no other file, so split chunks would break the board. The warning is harmless; raising build.chunkSizeWarningLimit is the only sane fix if it should go.

## Watch out
- A tool hook writes `.omc/` state into whatever directory the shell is in. `git add src/web` once committed src/web/components/ui/.omc/...json (a session id leaked into the PR). `.omc/` is now in .gitignore and a ui test fails if one appears under src/web; stage explicit paths anyway.
- `gh` can fail with "authorization timeout" when the 1Password approval lapses; the call may still have gone through (the PR was created anyway). Check with `gh pr list --head <branch>` before retrying.
- The main checkout keeps a local `/graft/` line in .gitignore; pulling a change to .gitignore conflicts with it under --autostash. Keep both lines.
