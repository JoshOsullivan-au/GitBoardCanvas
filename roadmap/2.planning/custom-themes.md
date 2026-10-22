# Custom themes

Why: teams want the board to match their own colours without editing the page.

## Build list

- [ ] Phase 01: theme tokens in `gitboard.config.json`
- [ ] Phase 02: contrast check for every token pair

## Open decisions

- Where tokens live: a `theme` key in `gitboard.config.json`, or a separate `gitboard.theme.json`.
- Whether a theme may change the font stack, given that the board makes no external requests.
