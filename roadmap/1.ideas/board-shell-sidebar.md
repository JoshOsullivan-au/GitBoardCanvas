# Board shell with a sidebar

Why: the board has two views, seven architecture states, worktrees, pull requests and docs, and today they all compete for one header row. A dashboard shell (a collapsible sidebar for where you are, a slim top bar for what you can do here) gives each its place and makes the board read like an admin dashboard instead of a page with a toolbar.

Plan: [`board-shell-sidebar/README.md`](./board-shell-sidebar/README.md) holds what shipped, where it moved from the plan, and what is left. Built on main in `8b6104a` (PR #6, 25/10/2026), released in 0.2.0; spec R23 to R25.

The architecture states in the sidebar are not built here: they moved to `architecture-states` phase 03, which needs that feature's state read first. See also `multi-repo-board` (the repo switcher in the sidebar header is its natural home).

## Build list

- [x] Phase 01: shell (SidebarProvider, inset Sidebar, top bar, routes) around the current views
- [x] Phase 02: sidebar content (views, work in flight, attention, docs) with live counts; architecture states moved to `architecture-states` phase 03
- [x] Phase 03: top bar Navigation Menu (Lifecycle, Help) and the view controls
- [x] Phase 04: states (loading, Missing, read status), keyboard, persistence, width rules
- [ ] Phase 05: spec, docs and tests done; README screenshots (`docs/board.png`, `docs/board-dark.png`, 22/10/2026) still show the board before the shell

## Decisions

- 24/10/2026: architecture states are sub-items of Architecture in the sidebar; the state tabs above the map go when this shell ships, and stay until then (Josh). 25/10/2026: the shell shipped before the states, so there are no state tabs to remove; the states go straight into the sidebar in `architecture-states` phase 03.
- 24/10/2026: the sidebar opens expanded on Roadmap and as icons on Architecture; after that each view remembers the person's own toggle (Josh).
- 24/10/2026: no command palette (⌘K) in the first build; the top bar's search filters the current view, as today (Josh).
- 24/10/2026: the sidebar header shows the repo name and main branch with no menu until `multi-repo-board` lands (Josh).
- 25/10/2026: Work in flight and Needs you sit under Roadmap and open a second bar beside the main one, which shrinks to icons. Turned down: a permanent rail beside a panel, a custom tab row, folding lists in the main bar, and stage sub-items under Roadmap (the stages are in the Lifecycle menu) (Josh).
- 25/10/2026: picking Roadmap or Architecture in the sidebar folds it to icons and opens the view, without changing what each view remembers (Josh).
