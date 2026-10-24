---
title: "Board shell phase 02: sidebar, hash routes, width rule"
author: Josh
date: 2026-10-24
branch: claude/sidebar-shell-phase-02-fbcb23
cost: { minutes: 29, tokens: 525700 }
touches:
  - ".omc/project-memory.json"
  - ".omc/state/sessions/f3ffe050-24a5-44d6-9127-e01f696d8c5f/last-tool-error-state.json"
  - ".omc/state/sessions/f3ffe050-24a5-44d6-9127-e01f696d8c5f/pre-tool-advisory-throttle.json"
  - ".omc/state/sessions/f3ffe050-24a5-44d6-9127-e01f696d8c5f/session-started.json"
  - CHANGELOG.md
  - THIRD_PARTY_NOTICES.md
  - docs/adr/0004-board-page-on-react.md
  - docs/spec.md
  - package-lock.json
  - package.json
---

## Decided
- Phase numbering: PR #4 calls the toolchain and React port phases 00 and 01, so "phase 02" is the shell (the plan file in the architecture-switcher branch still calls it phase 01).
- Shell markup with Tailwind classes lives in src/web/components/shell.tsx, because Tailwind scans only src/web/components.
- Views route by hash (#/roadmap, #/architecture). A page opened without a route gets replaceState to its start view, so Back to it works.
- Sidebar opens on Roadmap, icon mode on Architecture, until the viewer toggles; then localStorage gitboard-sidebar holds for both. shadcn's sidebar_state cookie write is removed.
- Beside the sidebar (md+), .arch .fwcols column-gap is 64 px so the map fits at 1440 in icon mode.

## Tried and ruled out
- Leaving the bare URL in history: Back to it kept the old view, since a hash that is not a route is ignored (doc anchors).

## Watch out
- `npx shadcn add` now imports `cn` (not lib/utils) and adds it to dependencies; move every shadcn dependency to devDependencies (spec R3) and add notices (cva is Apache-2.0).
- Link routers redraw only on window resize; the shell's ResizeObserver dispatches one when the inset width changes.
- Demo repo has no architecture data; the fake gcx from tests/cli.test.ts plus app/*/page.tsx folders makes one.
