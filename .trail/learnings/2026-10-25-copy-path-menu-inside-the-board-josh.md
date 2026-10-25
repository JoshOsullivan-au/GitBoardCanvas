---
title: "Copy path menu inside the board's modal dialogs"
author: Josh
date: 2026-10-25
branch: claude/file-path-copy-dropdown-fdb66b
cost: { minutes: 12, tokens: 245398 }
touches:
  - scripts/copy-ui.mjs
  - src/server.ts
  - src/ui/icons.json
  - src/web/components/shell/DocDialog.tsx
  - src/web/components/ui/dropdown-menu.tsx
  - src/web/index.html
  - src/web/lib/boot.ts
  - src/web/roadmap/Details.tsx
  - src/web/styles/board.css
  - tests/server.test.ts
---

## Decided
- Copy path (Absolute / Relative / Filename) is one shared component, src/web/components/shell/CopyPath.tsx, placed beside Close in the card details, phase view and sidebar doc dialog.
- The server injects the repo's absolute root as __ROOT__ (server.ts, index.html, copy-ui.mjs token guard, boot.ts repoRoot()).
- DropdownMenuContent takes a `container` prop; CopyPath points it at the nearest <dialog>. A modal dialog sits in the top layer, so a menu portalled to <body> renders underneath it.
- Copy falls back to a textarea plus execCommand("copy") when navigator.clipboard is refused. The textarea goes inside the dialog because the modal makes everything outside it inert.

## Tried and ruled out
- DropdownMenuLabel directly under DropdownMenuContent: Base UI throws error #31 (MenuGroupContext missing) and the whole page goes blank. Wrap the label and items in DropdownMenuGroup. AppSidebar's collapsed Docs menu still has this shape.

## Watch out
- The in-app preview browser denies clipboard write (NotAllowedError) even on localhost, so only the fallback path can be tested there.
- With the preview pane hidden, its coordinate clicks map to an 800x600 frame on a 1024x768 page and land on the dialog backdrop, which closes it. Dispatch pointer events at the element instead.
- Unit tests don't render the menu, so a Base UI runtime error only shows in the browser. Open the menu once after changing it.
