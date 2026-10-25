---
title: Link lines route around stage headers and column frames
author: Josh
date: 2026-10-25
branch: claude/words-to-pills-stage-colors-323221
cost: { minutes: 18, tokens: 279099 }
touches:
  - CHANGELOG.md
  - src/web/lib/routes.ts
  - src/web/styles/board.css
  - roadmap/2.planning/contract-and-plugins/README.md
  - roadmap/2.planning/custom-themes.md
  - roadmap/5.complete/v0-1-release/README.md
  - src/web/roadmap/Details.tsx
  - src/web/roadmap/model.ts
---

## Decided
- `drawRoutes` (src/web/lib/routes.ts) crosses a column only through a gap strictly between two rows (`.gh`, `.card`, `.card .chips`). The strip above the first row (the stage header) and the space below the last row (the column frame) are not channels.
- A column with no inner gap (every group collapsed, or no cards) is passed in a lane 6px above or below all the columns. `.fwcols` has `margin: -12px; padding: 12px` so the lanes sit inside its clip box without moving the layout.
- Gutter 0 and gutter n sit 6px outside the first and last columns, not 4px inside them.

## Tried and ruled out
- Keeping the leading and trailing gaps as channels: with collapsed groups they are the only free space, so lines hugged the stage header and ran along the panel bottom.

## Watch out
- `gitboard serve` keeps the built page in memory. After `npm run build`, restart the server before checking the board.
- The board reads the main checkout, not the worktree it runs from, so roadmap edits on a branch don't show until they merge.
- Collapsed groups have 10px between rows, about 4px once each row is padded by 3px, so they never give a channel.
