# T5 Docs, templates, community files, own lifecycle folder

Spec: all of section 1 (the concepts), 2.5, 4. Australian English, no em dashes, plain words.

- `README.md`: what GitBoard is (two sentences), a screenshot placeholder line `![GitBoard](docs/board.png)`, quick start (`npx gitboard init`, `npx gitboard`), the folder lifecycle in one table, a feature's files, how a move works (short), config table link, CLI table, licence, and this acknowledgement line: "GitBoard was built with help from Claude (Anthropic). Every change is reviewed by a maintainer." Link docs.
- `docs/concepts.md`: the lifecycle, features, ticks, phase documents, relations, the git pipeline, moves, for someone new to the idea. Worked example with a fictional feature `checkout-redesign`.
- `docs/configuration.md`: every key in `src/config.ts` with an example; hooks recipes (append a changelog line on Complete; run a test command as the gate).
- `templates/`: what `gitboard init` copies. `templates/roadmap/README.md` (how this folder works), one `README.md` per default stage folder (purpose and gate), `templates/feature/FEATURE.md` (build list), `templates/feature/README.md` (Order, Every phase, Source items, Ops actions, Status, Open decisions), `templates/feature/references.md`, `templates/feature/phases/01-first-phase.md` (the fifteen headings in spec 1.4, each with a one-line prompt), `templates/feature/phases/checklist.md`, `templates/feature/docs/.gitkeep`, `templates/feature/mocks/.gitkeep`.
- `roadmap/`: GitBoard's own lifecycle folder using the default five stage folders, with real next features for this project (for example `5.complete/v0-1-core`, `4.in-progress/v0-1-release`, `3.open/github-pr-checks`, `2.planning/custom-themes`, `1.ideas/multi-repo-board`), at least one with a phase folder, one depends-on line and one Open decisions item, so the board shows blocked, gated and linked.
- `LICENSE`: MIT, `Copyright (c) 2026 Josh O'Sullivan and Gitboard Canvas contributors`.
- `THIRD_PARTY_NOTICES.md`: Glass UI (MIT, Copyright (c) Crenspire Technologies, https://github.com/crenspire/glass-ui, liquid glass material in `src/ui/board.html`), Phosphor Icons (MIT, Copyright (c) 2020 Phosphor Icons, icon paths in `src/ui/icons.json`), marked (MIT, runtime dependency), each with the full MIT text.
- `CONTRIBUTING.md` (setup, tests, commit style, DCO sign-off `git commit -s`), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, contact: open a private security advisory), `SECURITY.md` (local-only threat model: loopback bind, Host and Origin checks, hooks are repo-owner code; report via GitHub private advisory), `CHANGELOG.md` (0.1.0 unreleased).
- No product names from the source project anywhere.

Done when: every file exists, links between docs resolve, and a grep for the original product's names over your files is empty.
