---
title: Board page moved to React (ADR 0004)
author: Josh
date: 2026-10-24
branch: claude/board-shell-sidebar-plan-96a8c3
cost: { minutes: 59, tokens: 1107465 }
touches:
  - CHANGELOG.md
  - CONTRIBUTING.md
  - THIRD_PARTY_NOTICES.md
  - docs/adr/README.md
  - docs/spec.md
  - package-lock.json
  - package.json
  - scripts/copy-ui.mjs
  - src/server.ts
  - src/ui/board.html
---

## Decided
- The board page is React 19 in src/web, built by Vite; scripts/copy-ui.mjs inlines the bundle into dist/ui/board.html so the server still sends one page. React, Vite and Tailwind are dev dependencies (spec R3 holds).
- Tailwind 4 scans only src/web/components (`@import "tailwindcss" source(none)` + `@source "../components"`), so board class names like `fixed` never become utilities. board.css stays unlayered and wins over Tailwind layers.
- The server reads the page from dist/ui; run from src (vitest) it falls back to ../dist/ui, so tests need a fresh `npm run build` (dist.test already enforces it).
- FLIP card animation needs DOM positions before React commits: the board surface is a class component using getSnapshotBeforeUpdate.

## Tried and ruled out
- Letting Tailwind scan the whole web source: board classes (`fixed` on timeline rows) would get utility CSS.

## Watch out
- Tailwind preflight zeroes `dialog` margins (modals jump top-left), list bullets and svg display; the restore block at the end of src/web/styles/board.css puts them back. Check new UA-reliant markup against it.
- A synthetic `pointerleave` dispatched in a browser test does not reach React's onPointerLeave (React derives it from pointerout/pointerover); use real pointer moves.
- The server injects `__ICONS__` and `__ARCHITECTURE__` with first-match replace; copy-ui fails the build if the bundle holds either token.
