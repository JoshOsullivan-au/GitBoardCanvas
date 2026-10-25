# Architecture states

Why: the Architecture tab shows only what production served in the last measure. A person cannot see what main, a pull request, a branch or the work in a worktree will change on the map before it ships, or which pages a planned feature touches, and the tab does not update when the code does.

Plan: [`architecture-states/README.md`](./architecture-states/README.md) holds the design, the evidence and the open decisions.

Builds on `git-github-workflow` phase 01 (the pull request read).

## Build list

- [ ] Phase 01: state model, blob cache and `GET /api/architecture/states`
- [ ] Phase 02: static scan rules, shared split and the overlay read
- [ ] Phase 03: the switcher as sub-items of Architecture in the sidebar (with the icon-mode menu, the breadcrumb state menu, `#/architecture/<state>` hashes and "Show on map" on a branch, moved here from `board-shell-sidebar`) and the overlay marks on the map
- [ ] Phase 04: Planned from feature cards
- [ ] Phase 05: Live commit in `measure`, spec, ADR 0003, docs and demo

## Open decisions

- Per-layer by default with a "Compare to" picker that reaches Live for the cumulative view, or cumulative by default?
- One branch at a time with a picker, or every branch in one view?
- Which stages feed Planned, and does Planned read card prose or only an `## Architecture` section?
