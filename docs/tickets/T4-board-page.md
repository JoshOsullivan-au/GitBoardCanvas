# T4 Board page, product agnostic

Spec: R15 to R22. Port `<original build>/scripts/roadmap-board/board.html` (read-only reference) to `src/ui/board.html`, keeping its behaviour and look (dotted canvas, glass columns and cards, blue trace lines routed around cards, confirm dialog, filter and order, details panel, markdown preview, keyboard moves, Undo, live version polling).

Changes:

- Data comes from `GET /api/board` in the `Board` shape of `src/types.ts`: build columns from `board.stages`, groups from `board.groups`/`card.group` (no suite names, no hard-coded stage names or folder names, no `product-roadmap`, use `board.roadmapDir` and `board.mainBranch` where the page names them).
- Remove the Google Fonts links. Use system stacks: sans `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; heading the same stack at weight 600 (no serif web font).
- Icons: the server injects icon paths at `/*__ICONS__*/` (or whatever placeholder the source uses; keep it). Write `src/ui/icons.json` holding the light and regular Phosphor paths for every icon the page uses, extracted once from `<original build>/node_modules/@phosphor-icons/react/dist/defs/<Name>.es.js` (see `phosphor()` in `<original build>/scripts/roadmap-board.mjs`). Group icons: one generic icon for every group (no per-suite icon map).
- Title "GitBoard Canvas". Keep the glass material comment, replacing its notice line with: `Liquid glass material adapted from Glass UI (MIT, Crenspire Technologies). See THIRD_PARTY_NOTICES.md.`
- No product names (grep the result for the original product's names and suite names).

Done when: the page parses (open it with a stub `/api/board` JSON in a headless check or by reading carefully), no external URLs remain except none, and the grep above is clean. T6 wires it to the server.
