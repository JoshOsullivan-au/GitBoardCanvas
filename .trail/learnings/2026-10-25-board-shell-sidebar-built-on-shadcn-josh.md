---
title: Board shell sidebar built on shadcn Sidebar
author: Josh
date: 2026-10-25
branch: claude/board-shell-sidebar-1fdb7b
cost: { minutes: 46, tokens: 638722 }
touches:
  - CHANGELOG.md
  - README.md
  - THIRD_PARTY_NOTICES.md
  - docs/spec.md
  - package-lock.json
  - package.json
  - scripts/copy-ui.mjs
  - src/server.ts
  - src/ui/icons.json
  - src/web/App.tsx
---

## Decided
- The board page is one shadcn/ui Sidebar (inset, collapsible icon): repo header; a Board group with Roadmap (Work in flight and Needs you as its sub-items) and Architecture; docs, theme and status in the footer. Work in flight and Needs you open a second bar (a collapsible="none" Sidebar rendered after the main one, inside the provider) and shrink the main bar to icons; App owns `second` beside `open`. Picking a row in the second bar closes it (onRow) and sets `rowPicked` so the "a branch place opens its bar" effect skips that one arrival. A branch row also asks the Roadmap to open its lead feature (navOf `lead`, most files) through a `show` prop counted by `n`. Josh turned down a permanent rail beside a panel, a custom tab row, folding lists in the main bar and stage sub-items. Plus a top bar in src/web/App.tsx; shell parts live in src/web/components/shell/ so Tailwind scans their classes. Places are URL hashes (src/web/lib/hash.ts).
- Roadmap stays the owner of /api/board polling and reports {model, readAt, failed} up through onStatus; sidebar counts come from src/web/lib/nav.ts (navOf). Views portal their tools into the view header and their search into slots in the top bar.
- A "Needs you" place applies one filter only while on that hash; the person's own filters are kept in a ref, restored on leaving, and persist() saves those, never the place's filter.
- Sidebar open state is per view in localStorage (gitboard-sidebar-roadmap / -architecture); shadcn's sidebar_state cookie was removed.
- Picking Roadmap or Architecture in the sidebar folds it and opens the view (Josh): App sets a `picked` ref the view effect reads, so the per-view memory does not re-expand it, and nothing is saved.
- /api/doc opens the lifecycle folder plus a fixed REPO_DOCS allowlist (realpath checked inside the repo); /api/docs lists the ones present. The repo name comes into the page as a __REPO__ token (copy-ui guards it like __ICONS__).
- shadcn icons are swapped for the board's own Icon (injected Phosphor set); new icons are added to src/ui/icons.json from @phosphor-icons/core assets (light + regular, single path).

## Tried and ruled out
- `npx shadcn add` with this components.json imported `cn` from an npm package literally named "cn" and installed it. Removed it; src/web/lib/utils.ts is the real helper and imports point at "@/lib/utils".
- Smooth scrollIntoView looks broken in a hidden browser pane (frames throttled); it works, test with behavior auto.

## Watch out
- The in-app preview browser can stop delivering dialog `close` events after a while (main's build too): a details panel then will not reopen. Probe with a fresh `<dialog>` before calling it a bug.
- vitest.config.ts needs the same "@" alias as vite.config.ts once a test imports a shell component.
- Board markup already uses class names like `.shell` (map endpoint cards). A shell rule `.shell { height: 100svh }` made those cards full-height. Shell classes are app-shell / app-inset; a ui test guards `.shell` selectors.
- board.css is unlayered, so `button { color: inherit }` and `.ph { width: 1em }` beat Tailwind utilities on shadcn parts; size sidebar icons with font-size on .ph, not size-* utilities.
- Base UI NavigationMenu opens on hover; a click right after hover closes it.
- Page grew from 96 KB to 184 KB gzipped with Base UI parts.
