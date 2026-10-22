# GitBoard Grill and GitBoard Ingest

GitBoard Grill scans a repo for scattered ideas, plans, open and in-progress build docs, live build notes and finished work, groups them into candidate features, and interviews the person until each candidate is either on the board (with a stage, slug and group) or explicitly left off. GitBoard Ingest then files the accepted candidates into the lifecycle folder in one commit, keeping where each document came from. Done means a person can point both skills at a messy repo and get a board that matches reality without sorting a file by hand.

## How it works

```
gitboard scan --json  ──►  gitboard-grill (rounds of questions)  ──►  .gitboard/ingest/manifest.json
                                                                          │
                                       gitboard ingest --dry-run  ◄───────┘
                                       gitboard ingest            ──►  one commit on main, board shows the features
```

### What scan looks at

| Source | Examples | Notes |
| --- | --- | --- |
| Root and `docs/` markdown | `PLAN.md`, `TODO.md`, `docs/roadmap.md`, `docs/research/` | Skips README, LICENSE, CHANGELOG and similar by name. |
| Tool dot folders | `.rpe/`, `.archify/`, `.planning/`, `.omc/plans/` | Any `.<name>/` not on the deny list. Gitignored files are read too and marked `ignored`. |
| Agent folders | `.claude/`, `.cursor/`, `.codex/`, `.agents/`, `.<agent>/plans/` | Skills, rules and settings are excluded by path pattern; plans, notes and handoffs are kept. |
| Worktrees | `git worktree list`: `.worktrees/*`, `.claude/worktrees/*`, any other path | Read only. Records branch, commits ahead of main, and dirty docs. Never writes into another worktree. |
| Existing lifecycle folder | `gitboard-roadmap/` or the configured `roadmapDir` | Already on the board; used to spot duplicates, never re-ingested. |

Deny list: `.git`, `node_modules`, `.next`, `dist`, `build`, `.venv`, `.cache`, `.turbo`, `.vercel`, `coverage`, plus the `rewriteSkip` entries from `gitboard.config.json`.

### Status evidence (scan reports it, the person decides)

| Suggested stage | Evidence |
| --- | --- |
| 1 Ideas | Prose with no phases, no build list, no checkboxes. |
| 2 Planning | Phases or a build list, nothing ticked, open questions present. |
| 3 Open | Accepted plan (a "Decisions" or "Approved" line), nothing ticked, no branch or worktree. |
| 4 In progress | Some ticks, or a branch or worktree with commits ahead of main that names the slug, or edits in the last 14 days. |
| 5 Complete | Every box ticked, or the branch is merged and the doc says done. |

Each candidate carries a confidence (high, medium, low) and the lines that produced it, so the grill can show its reasoning in one line.

## Order

| Phase | File | Depends on |
| --- | --- | --- |
| 01 | [`phases/01-scan-command.md`](./phases/01-scan-command.md) | none |
| 02 | [`phases/02-folder-name-and-state.md`](./phases/02-folder-name-and-state.md) | none |
| 03 | [`phases/03-ingest-command.md`](./phases/03-ingest-command.md) | 01, 02 |
| 04 | [`phases/04-plugin-and-grill-skill.md`](./phases/04-plugin-and-grill-skill.md) | 01 |
| 05 | [`phases/05-ingest-skill.md`](./phases/05-ingest-skill.md) | 03, 04 |
| 06 | [`phases/06-real-repo-dry-run-and-docs.md`](./phases/06-real-repo-dry-run-and-docs.md) | 05 |

01 and 02 can run at the same time. 04 can start once 01 lands.

## Every phase

- `npm run typecheck` and `npm test` pass before a phase closes; new CLI behaviour has fixture tests.
- Nothing is deleted. Ingest copies or `git mv`s; sources outside the main checkout are only ever copied.
- No phase writes inside another session's worktree.
- Skills are built with the skill-creator loop: draft, 2 to 3 realistic test prompts, run, review with Josh, revise.
- Dates are DD/MM/YYYY. Names follow the GitBoard Canvas convention.

## Folder name: `gitboard-roadmap/`, not a dot folder

The lifecycle folder becomes `gitboard-roadmap/` (shown as "GitBoard Roadmap" in its README title). Tool state goes in a separate dot folder, `.gitboard/`.

- The roadmap is content people read and review in pull requests. Dot folders are hidden in Finder, `ls` and some editors, and the board's own readers skip dot entries (`src/board.ts` lines 19 and 94).
- Scan treats dot folders as places where loose docs hide. If the board itself lived in one, the line between "already on the board" and "found by scan" would blur.
- No space in the name. The ecomm-canvas install showed that a folder name with spaces breaks lint and shell quoting.
- The `gitboard-` prefix makes it obvious which tool owns the folder in a busy repo root.
- `.gitboard/` holds machine state (the ingest manifest, grill logs). It is gitignored by default except `.gitboard/ingest/*.md` decision logs, which teams can choose to commit.

## Skills and sources used to build it

| Source | Use |
| --- | --- |
| `skill-creator` | Draft, test prompts, eval loop for both skills; pushy descriptions so they trigger. |
| `plugin-dev:plugin-structure` | Plugin layout: `.claude-plugin/plugin.json`, `skills/<name>/SKILL.md`, `${CLAUDE_PLUGIN_ROOT}` paths. |
| `github:repo-architect` | Where the plugin lives in `JoshOsullivan-au/GitBoardCanvas` and how it is installed. |
| `file-organizer` | Analyse, propose, confirm, then act; log every move; archive, never delete. |
| `file-system` | `find` patterns with prune lists, metadata via `stat` and git, safe batch moves. |
| `grilling` | Design-tree rounds, the frontier, a recommended answer on every question, facts found by sub-agents. |
| `grill-with-docs` (`grilling` + `domain-modeling`) | Pattern GitBoard Grill copies: write each answer down the moment it settles, challenge fuzzy names against the words already in use, test stage claims against concrete evidence, check claims against the code, and record only hard-to-reverse choices as decisions. See phase 04. |
| `ask-matt` | Router to the Matt Pocock skill set; the skills it routes to (`grilling`, `domain-modeling`, `writing-for-agents`) are the ones referenced here. |
| OKF (`01-Obsidian Vault/OKF-INDEX.md`) | Front matter (`type`, `title`, `description`, `timestamp`, `tags`) on the roadmap index and the skills' reference files, so agents can route without reading every file. |

## Plugin layout

```
GitBoardCanvas/
├── .claude-plugin/marketplace.json     lists one plugin at ./plugin
└── plugin/
    ├── .claude-plugin/plugin.json      name: gitboard-canvas
    └── skills/
        ├── gitboard-grill/
        │   ├── SKILL.md
        │   └── references/question-bank.md, stage-evidence.md
        └── gitboard-ingest/
            ├── SKILL.md
            └── references/manifest-schema.md
```

Install: `/plugin marketplace add JoshOsullivan-au/GitBoardCanvas`, then `/plugin install gitboard-canvas`. The npm package `files` list stays as it is, so the plugin is not shipped in the npm tarball. Both skills call the CLI with `npx gitboard-canvas`, so they work without a global install.

## Source items

| Item | Phase |
| --- | --- |
| `gitboard scan`, a read-only inventory | 01 |
| Folder default `gitboard-roadmap/`, `.gitboard/` state | 02 |
| `gitboard ingest` applies a manifest | 03 |
| Plugin skeleton and `gitboard-grill` | 04 |
| `gitboard-ingest` skill | 05 |
| Real repo dry run, docs | 06 |

## Ops actions

None.

## Status

| Phase | State |
| --- | --- |
| 01 | Planned |
| 02 | Planned |
| 03 | Planned |
| 04 | Planned |
| 05 | Planned |
| 06 | Planned |

States: Done, In progress, Planned.

## Open decisions

- Folder name: settled 22/10/2026, `gitboard-roadmap/` (visible, titled "GitBoard Roadmap"), tool state in `.gitboard/`.
- This repo's own `roadmap/`: settled 22/10/2026, renamed to `gitboard-roadmap/` with `git mv` in phase 02; fixtures cover the `roadmap/` compatibility rule.
- Tracked files in the main checkout: settled 22/10/2026, `git mv` into the feature folder; untracked, gitignored and other-worktree files are copied.
- Plugin home: settled 22/10/2026, this repo, through `.claude-plugin/marketplace.json` and `plugin/`.
- Completed work: settled 22/10/2026, offered as one grouped question per source; recommended for `5.complete` only when an open feature links to or depends on it, or it changed in the last 90 days. The rest defaults to leave off and is listed in the decision log.
- OKF front matter: settled 22/10/2026, on the roadmap index (`gitboard-roadmap/README.md`) and the skills' reference files only; filed docs stay byte for byte.
