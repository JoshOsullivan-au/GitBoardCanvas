# Board shell with a sidebar: what shipped

A dashboard shell for GitBoard Canvas built from shadcn/ui's Base UI components: [Sidebar](https://ui.shadcn.com/docs/components/base/sidebar) for primary navigation and [Navigation Menu](https://ui.shadcn.com/docs/components/base/navigation-menu) for the top bar's secondary destinations. Planned 24/10/2026; built on main in `8b6104a` (PR #6, 25/10/2026) after the board page moved to React (`42cca50`), with fixes in `324d0f3` and `7f724cb`; released in 0.2.0. Spec R23 to R25 in `docs/spec.md` describe the shipped behaviour; this file records the design, where the build moved from the plan, and what is left.

Done means a person can reach every view, worktree, pull request and doc from the sidebar in two clicks or fewer, the map keeps its full width when it needs it, and the board's look (tokens, cards, columns) is unchanged inside the shell. The architecture states are the one destination not built: they moved to `architecture-states` phase 03.

## Principles

1. **The sidebar says where you are; the top bar says what you can do here.** Navigation never sits beside view controls.
2. **Counts, not chrome.** Every sidebar item that can carry a number does (features, branches, attention). A zero shows no badge, as on the board.
3. **The map wins width.** Architecture needs its columns; the shell gives way, never the map.
4. **Quiet by default.** Neutral palette on the board's existing tokens; colour only for meaning (checks failing, Missing, not read).
5. **Read only, as the board is.** Nothing in the shell writes to git or GitHub; items open views, filters and docs.

## What shipped

| Part | Shipped | Code |
| --- | --- | --- |
| Shell | `SidebarProvider`, `Sidebar variant="inset" collapsible="icon"`, `SidebarInset` with a sticky top bar; shell class names are `app-shell` / `app-inset`, kept apart from the board's own `.shell` | `src/web/App.tsx` |
| Sidebar header | repo name (from the `__REPO__` token) and main branch, no menu | `src/web/components/shell/AppSidebar.tsx` |
| Board group | Roadmap, with Work in flight and Needs you under it; Architecture when configured | same |
| Second bar | Work in flight or Needs you opens a second `Sidebar collapsible="none"` beside the main one, which shrinks to icons. Work in flight lists each branch with work and its file count; Needs you lists Blocked, Gated, Checks failing and Needs review. Picking a row opens it on the board and closes the bar; a branch also opens the details of its feature with the most files | same |
| Footer | Docs menu (`DropdownMenu`, `side="right"`) of the lifecycle README, `docs/spec.md`, `docs/configuration.md`, `docs/adr/README.md` and `CHANGELOG.md` the repo has, opened in the doc dialog; theme toggle; read status ("Not read since" in the attention tone when the server stops answering); "GitHub Missing" when pull requests cannot be read | same, `DocDialog.tsx` |
| Top bar | `SidebarTrigger`, breadcrumb, Navigation Menu with Lifecycle (the stages and their gates) and Help (Commands, For coding agents, Configuration, Security), and the view's search slot | `src/web/components/shell/TopBar.tsx` |
| Places | every place is a URL hash: `#/roadmap`, `#/roadmap?stage=2`, `#/roadmap?branch=<name>`, `#/roadmap?need=blocked`, `#/architecture` | `src/web/lib/hash.ts` |
| Counts | `navOf` over the Roadmap's `/api/board` model; the Roadmap owns polling and reports status up | `src/web/lib/nav.ts` |
| Server | `GET /api/docs` lists the repo docs; `/api/doc` serves them, checked by real path inside the repo | `src/server.ts` |
| Tests | sidebar structure, hashes, Needs you filters, counts, per-view toggle, fold on pick, class-name guard | `tests/ui.test.tsx` |

### Width rules (measured 24/10/2026, shipped)

| Sidebar | Room for the map at 1440 | Map with 88 px corridors | Map with 64 px corridors |
| --- | --- | --- | --- |
| Expanded 240 px | about 1,120 px | short 236 px | short 188 px |
| Icon 48 px | about 1,313 px | short 43 px | fits |

Inside the shell the map's link corridors are 64 px (`.app-shell .arch .fwcols` in `board.css`). The sidebar opens expanded on Roadmap and as icons on Architecture; after that each view keeps the person's own toggle in localStorage (`gitboard-sidebar-roadmap`, `gitboard-sidebar-architecture`). shadcn's `sidebar_state` cookie was removed, since the board has no server session. Picking Roadmap or Architecture in the sidebar folds it to icons and opens the view without changing what either view remembers.

### Interaction and accessibility (shipped)

- Back, forward, reload and a shared link work for every place. A Needs you place turns on its one filter while you are there and gives the person's own filters back on leaving.
- ⌘B or Ctrl+B toggles the sidebar; a skip link goes straight to the board; the active item carries `aria-current="page"`.
- Folded to icons, every item has a tooltip with its label and count; Work in flight and Needs you stand as icons under Roadmap.
- Until the first read of the pipeline, the second bar shows `SidebarMenuSkeleton` rows; the views are usable at once.

## Where the build moved from the plan

| Plan (24/10/2026) | Shipped (25/10/2026) | Why |
| --- | --- | --- |
| Groups "Work in flight" and "Needs you" in the main sidebar | sub-items of Roadmap that open a second bar | Josh turned down a permanent rail beside a panel, a custom tab row and folding lists in the main bar |
| A sub-item per stage under Roadmap | none; stages are in the Lifecycle menu and `#/roadmap?stage=` | Josh turned down stage sub-items |
| Collapsible "Docs" group | Docs menu in the footer | build choice, 25/10/2026 |
| Overflow menu in the top bar (Collapse all, Order) | each view portals its tools into the view header | build choice, 25/10/2026 |
| `SidebarMenuAction` "Show on map" on a branch | not built | needs the Committed state; moved to `architecture-states` phase 03 |
| Architecture state sub-items, state crumb menu, state menu on the icon | not built | needs `GET /api/architecture/states`; moved to `architecture-states` phase 03 |
| Remove the state tabs above the map when the shell ships | nothing to remove | the shell shipped before the states, so the tabs were never built |

## What is left

1. README screenshots: `docs/board.png` and `docs/board-dark.png` date from 22/10/2026 and show the board before the shell. About 30 minutes.
2. The architecture states in the sidebar, the breadcrumb and the icon menu, and "Show on map": tracked in `architecture-states` phase 03, not here.

## Constraints

- **Bundle**: the page grew from 96 KB to 184 KB gzipped with the Base UI parts (measured at build, 25/10/2026).
- **Spec R3**: React and Base UI stay a build-time bundle; `dependencies` stays `marked`.
- **Licences**: shadcn/ui, Base UI and Phosphor are MIT. React Bits Pro blocks cannot ship in this repository (licence §2.4) and are not used.
- **Styles**: `board.css` is unlayered, so its element rules beat Tailwind utilities on shadcn parts; sidebar icons are sized with `font-size` on `.ph`.

## Decisions

- 24/10/2026: architecture states are sub-items of Architecture in the sidebar; the state tabs above the map go when this shell ships, and stay until then. In icon mode the Architecture icon and the last breadcrumb crumb each open the states as a menu (Josh). 25/10/2026: the shell shipped first, so the states go straight into the sidebar in `architecture-states` phase 03 with no tabs in between.
- 24/10/2026: the sidebar opens expanded on Roadmap and as icons on Architecture; after that each view remembers the person's own toggle (Josh).
- 24/10/2026: no command palette (⌘K) in the first build; search filters the current view, as today (Josh).
- 24/10/2026: the sidebar header shows the repo name and main branch with no menu until `multi-repo-board` lands (Josh).
- 25/10/2026: Work in flight and Needs you open a second bar beside the main one, which shrinks to icons; no permanent rail, custom tab row, folding lists or stage sub-items (Josh).
- 25/10/2026: picking Roadmap or Architecture folds the sidebar to icons and opens the view (Josh).
