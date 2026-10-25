# v0.1 release

Get GitBoard Canvas 0.1.0 out: documents and templates in place, a clean-repo run that works, and a tagged npm package.

## Order

| Phase | File | Depends on |
| --- | --- | --- |
| 01 | [`phases/01-docs-and-templates.md`](./phases/01-docs-and-templates.md) | none |
| 02 | [`phases/02-end-to-end-check.md`](./phases/02-end-to-end-check.md) | 01 |
| 03 | publish and tag | 02 |

## Every phase

- Tests and the type check pass before a phase closes.
- A tick carries the date and the evidence.
- No phase adds a runtime dependency beyond `marked`.

## Source items

| Item | Phase |
| --- | --- |
| Docs and templates | 01 |
| End-to-end check and review fixes | 02 |
| Publish and tag 0.1.0 | 03 |

## Ops actions

- [x] Create the npm account token for publishing and store it in the maintainer's password manager. **Completed** 22/10/2026: granular token with 2FA bypass, 1Password item `npm`.

## Status

| Phase | State |
| --- | --- |
| 01 | Done |
| 02 | Done |
| 03 | Done |

## Open decisions

- Package name on npm: settled 22/10/2026, `gitboard-canvas` (command `gitboard`).
- Test CI on Node 22.12 only, or on the current release too?
