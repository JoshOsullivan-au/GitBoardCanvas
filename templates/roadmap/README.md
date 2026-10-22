# Roadmap

This folder is the lifecycle of the product. Each numbered folder is a stage. A feature sits in exactly one stage, and the stage it sits in is its status. There is no status field to keep up to date.

| Stage | Folder | Gate to leave it |
| --- | --- | --- |
| 1 Ideas | [`1.ideas/`](./1.ideas/README.md) | A person accepts the idea. |
| 2 Planning | [`2.planning/`](./2.planning/README.md) | A person accepts the phased plan. |
| 3 Open | [`3.open/`](./3.open/README.md) | A person says build. |
| 4 In progress | [`4.in-progress/`](./4.in-progress/README.md) | Every phase is done and verified, or a person moves it. |
| 5 Complete | [`5.complete/`](./5.complete/README.md) | None. Finished features stay as history. |

## A feature

A feature called `checkout-redesign` is a file and a folder with the same name:

```
3.open/checkout-redesign.md       the build list
3.open/checkout-redesign/         order, phases, references, docs, mocks
```

Copy the shape from `templates/feature/` when you start one. The build list holds one `- [ ]` line per piece of work. Tick it with `- [x] item. **Completed** DD/MM/YYYY: evidence`.

## Moving a feature

Drag the card on the board, or run `npx gitboard-canvas move <slug> <stage>`. Either one moves the file and the folder with `git mv`, rewrites links to the old path, runs the checks and lands one commit on the main branch. Do not move folders by hand while a branch has work on the same feature.

## Relations

- Write `depends on <slug>` (or `needs`, `requires`, `after`, `blocked by`) and the card shows as blocked until that feature is complete.
- List a question under `Open decisions`, or an unticked step under `Ops actions`, and the card shows as gated on a person.
- Any other mention of another feature's slug is a link.

Dates are DD/MM/YYYY.
