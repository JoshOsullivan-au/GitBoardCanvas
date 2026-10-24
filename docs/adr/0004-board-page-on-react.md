# ADR 0004: The board page is built in React, with shadcn/ui parts on Tailwind

**Status:** Accepted
**Date:** 24/10/2026
**Deciders:** Josh O'Sullivan

## Context

The board page was one hand-written HTML file, `src/ui/board.html`: 1,853 lines and 94 functions that rebuilt the board with template strings and wired events by hand. The next interface work, a dashboard shell with a collapsible sidebar and a top bar of destinations, wants shadcn/ui's Sidebar and Navigation Menu, which are React components on Base UI. Research on the architecture states branch (`research/architecture-states/mock-react/`) built the same controls both ways and recommended moving the page whole rather than one tab at a time, since two interface stacks in one page cost more than either.

Forces:

- Spec R3: one runtime dependency (`marked`). The page must ship inside `dist/` with no new runtime install.
- The server sends one page and serves no other file; the page must stay one document.
- The board's look (its tokens, liquid glass, cards and columns) must not change. Its tokens already use shadcn's neutral theme names and values.
- Tests must still check the page's rules: escaping, pull request states, icons, one link router, the approved column widths.

## Decision

1. The page is a React 19 app in `src/web`, built by Vite. `scripts/copy-ui.mjs` inlines the built script and styles into `dist/ui/board.html`, so the server code and its routes do not change.
2. React, Vite and Tailwind are dev dependencies, bundled at build time. `dependencies` stays `marked`.
3. The board's own styles move unchanged to `src/web/styles/board.css` and stay unlayered, so they win over Tailwind's layers. A short block puts back what Tailwind's preflight resets and the page relied on (dialog centring, list bullets in markdown, icon display).
4. Tailwind 4 serves shadcn/ui parts only. It scans `src/web/components` and nothing else (`source(none)`), so board class names such as `fixed` never become utilities. `components.json` uses the `base-nova` style (Base UI) with Phosphor icons and the board's tokens.
5. The whole page moved at once, Roadmap and Architecture tabs together, with the link router ported as one shared module.
6. Pure logic (relations, filters, orders, pull request states) lives in plain modules the tests import directly.

## Options considered

| Option | Complexity | Fit | Verdict |
| --- | --- | --- | --- |
| A. React + shadcn (base-nova), Tailwind for shadcn parts, board CSS unlayered (chosen) | Medium | shadcn parts drop in with `shadcn add`; board look kept exactly | Chosen |
| B. React with shadcn-shaped parts hand-styled by board classes, no Tailwind | Medium | Smaller CSS, but every shadcn part is a hand port with no `add --diff` upgrades | Turned down |
| C. Stay on the plain page, build the shell by hand | Low now | No new build step, but the shell's sidebar, sheets and menus are a large hand build | Turned down |
| D. Move one tab at a time | Medium | Two interface stacks in one page during the move | Turned down |

## Consequences

Easier:

- shadcn parts (`npx shadcn@latest add sidebar`) work against the board's tokens.
- Components and typed modules replace template strings; React escapes text by default, so the only HTML set directly is the server-rendered markdown, whose raw HTML the server escapes.
- Tests import the page's logic instead of slicing it out of an HTML file.

Harder:

- The build has a Vite step next to `tsc`, and `typecheck` checks two configs (server and page).
- The page grows from 32 KB to 96 KB gzipped, served from loopback.
- Contributors need React to change the page.

Risks:

- Tailwind's preflight can change a part of the page that leaned on browser defaults. The restore block covers what a side-by-side layout check found; a part the check did not reach may still differ.

## Action items

1. [x] Board shell: SidebarProvider, inset Sidebar, top bar and hash routes around the two views.
2. [x] Measure the bundle again once the shell's shadcn parts are added: 153 KB gzipped (156,291 bytes at gzip -9), up from 96 KB, with Base UI, Floating UI and the shadcn Sidebar, Sheet, Tooltip, Button, Input, Separator and Skeleton parts.
