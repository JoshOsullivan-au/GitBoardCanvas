# GitBoard Canvas specification

Version 0.1, 22/10/2026. Status: building.

GitBoard Canvas is a local kanban for product development that keeps its whole state in the repository. Each feature is a markdown file and a folder. The stage folder a feature sits in is its lifecycle stage. Moving a card on the board moves the folder with `git mv`, rewrites every link to the old path, runs the repo's checks and lands one commit on the main branch. Nothing is stored outside git, so the terminal, an editor, a coding agent and the board all see the same state.

GitBoard Canvas is product agnostic. It knows nothing about the product it tracks beyond what `gitboard.config.json` tells it.

## 1. Concepts

### 1.1 The folder is the lifecycle

A repo keeps one lifecycle folder (`roadmap/` by default). Inside it sit numbered stage folders. The default five:

| Id | Folder | Name | Gate to leave the stage |
| --- | --- | --- | --- |
| 1 | `1.ideas/` | Ideas | A person accepts the idea. |
| 2 | `2.planning/` | Planning | A person accepts the phased plan. |
| 3 | `3.open/` | Open | A person says build. Planned work, not started. |
| 4 | `4.in-progress/` | In progress | Every phase is done and verified, or a person moves it. |
| 5 | `5.complete/` | Complete | None. Finished features stay here as history. |

Rules:

- There is no `status:` field. The folder a feature sits in is its stage, so a stage can never disagree with a field.
- One human gate per move. GitBoard Canvas makes the move cheap and safe. It never decides that a feature is ready.
- Stage names, folders and count (two to nine) are configurable. The number prefix fixes the order.

### 1.2 A feature is a file and a folder

A feature with slug `checkout-redesign` in Open is:

```
roadmap/3.open/checkout-redesign.md        the build list: title, why, the open items
roadmap/3.open/checkout-redesign/          the feature folder
  README.md                                order, rules, source items, ops actions, status, open decisions
  references.md                            research, designs, prior art
  docs/                                    longer notes
  mocks/                                   mock-ups
  phases/01-data-model.md                  one file per phase
  phases/02-api.md
  phases/checklist.md                      one tick list per phase
```

- The file and the folder move together. Either may exist alone; early ideas are often a single file.
- The slug is the file name without `.md`. It is unique within a stage and uses letters, digits, `-` and `_` only.
- The title is the first `# ` heading, else the slug in title case.
- Frontmatter `group: <name>` puts the card in a group. Without it the first matching `config.groups` rule applies, else `config.defaultGroup`.

### 1.3 Ticks are progress

Progress is counted from markdown task lists, never from a separate tracker.

- `- [ ] item` is open, `- [x] item` is done.
- A card's progress is done over total across the build list and its phases.
- The convention for a landed item: `- [x] item. **Completed** DD/MM/YYYY: evidence` (commit, file, test).

### 1.4 Phase documents

A phase is one landable slice of the build: `phases/NN-slug.md`, numbered in build order (`01`, `02`, `11b`). The phase number and title come from the file's first `# ` heading, else the file name.

The default phase template (in `templates/feature/phases/01-first-phase.md`) has fifteen headings in three parts:

- **Directive:** Overview, Directive, Objective/Goal, Limitations/Restrictions, Guardrails, Done when.
- **Orchestration:** Orchestration, Depends on, Steps, UI, Files/references, Review, Loop.
- **Execution:** Execution, Verify.

The template is a starting shape, not a rule. A repo makes it a rule by listing headings in `lint.phaseHeadings`.

The feature README carries the sections a person reads before building: **Order** (phase table with depends-on), **Every phase** (rules all phases obey), **Source items** (each open line of the build list and its owning phase), **Ops actions** (steps only a person can take), **Status** (per phase: Done, In progress, Planned), **Open decisions**.

### 1.5 Relations: blocked, gated, linked

GitBoard Canvas reads three kinds of relation from the text. No extra syntax is needed.

- **Blocked:** a line that names another feature's slug and reads as a dependency (`depends on`, `needs`, `requires`, `after`, `blocked by`, `builds on`, `waits for`, `prerequisite`, `pointer`). The card is blocked while that feature is not in the last stage.
- **Gated:** the feature waits on a person. Open items under an `Open decisions` heading (list items or table rows, skipping ones marked settled, decided, resolved, confirmed, closed, withdrawn or superseded), or unticked items under `Ops actions`.
- **Linked:** any other mention of another feature's slug.

### 1.6 The git pipeline

Each card shows the work in flight for its feature, per branch:

| Step | Source |
| --- | --- |
| WIP | Unstaged or untracked files in any worktree (`git status --porcelain -z`). |
| Staged | Files in a worktree's index. |
| Committed | Files on a branch and not on the main branch (`git log main..branch`). |
| PR | Open pull requests through `gh pr list`, and their checks, review and conflicts through a read-only `gh api graphql` query, when `gh` is installed and signed in. |
| Landed | The last commit on the main branch that touched the feature. |

A change counts for a feature when it is under the feature's lifecycle path, when the branch name contains the feature's slug, or when the file is a code path the feature's markdown names (exact path, or a folder ending in `/`). A code path named by more than four features is too generic and is ignored.

### 1.7 A move is one commit

Moving a feature from stage A to stage B:

1. Refuse when the slug is not valid (letters, digits, `-` and `_`), when `<from>/<slug>/` or `<from>/<slug>.md` in the main checkout has untracked, modified or ignored content (a stray `.DS_Store` does not count), when another worktree has unlanded roadmap work for it, when the target holds `<to>/<slug>/` or `<to>/<slug>.md`, or when another move holds the lock.
2. Take a lock: write the process id to a temp file and hard-link it to `<git common dir>/gitboard-move.lock`, so the lock never exists without its pid and `EEXIST` means it is held. A lock whose process is not alive is taken over (`EPERM` means alive); age plays no part. The lock is removed at the end only if it still holds this process id.
3. `git worktree prune`, then add a temporary locked worktree at `.worktrees/gitboard-move-<slug>-<stamp>` on branch `gitboard-move/<slug>-<stamp>`, cut from the main branch.
4. `git mv` the file and the folder.
5. Rewrite links: every markdown link in tracked text files that resolved into the old paths is recomputed relative to its file, and plain `stage/slug` mentions are replaced. Paths in `config.rewriteSkip` are never rewritten.
6. Run the `hooks.onEnter` commands for stage B, then the lint gate (built-in checks and `lint.command`). Any failure refuses the move and leaves the main branch untouched.
7. Commit once, subject `gitboard: move <slug> to <Stage name>`, with `GitBoard-Move: <slug> <from>-><to>` and `GitBoard-Base: <sha>` trailers.
8. From the main checkout, `git merge --ff-only` the move branch. If the main branch moved meanwhile, the commit was checked against an old tree, so it is discarded and the whole move is redone once from the new tip (steps 3 to 8: fresh `git mv`, rewrite, hooks, gate, and a commit that records the new base). If the main branch moves again, the move is refused.
9. Confirm the main branch now equals the move commit, delete the move branch, remove the worktree, release the lock. A commit that did not land is kept as a tag `archive/<branch>`. Then remove empty leftover folders of the old place in the main checkout (folders that are empty or hold only `.DS_Store`).

GitBoard Canvas never pushes, never force-updates a branch, never stashes, never resets, and never touches another worktree's files.

## 2. Requirements

### 2.1 Install and run

- R1. Runs on Node 22.12 or later on macOS, Linux and Windows (WSL), with git 2.38 or later.
- R2. `npx gitboard-canvas` in any git repo starts the board; `npm i -D gitboard-canvas` installs the `gitboard` command for a `"board": "gitboard"` script.
- R3 (ADR 0004). One runtime dependency (`marked`). The board page is built from React and Tailwind at build time and ships inlined in `dist/ui/board.html`; neither is a runtime dependency. No database, no account, no network call except `gh` for pull requests, and `gcx` and an optional `HEAD` to `architecture.site` when the person runs `gitboard measure`.
- R4. `gitboard init` creates the lifecycle folder, its five stage folders, a README per stage, the feature templates and a `gitboard.config.json`, and adds `.worktrees/` to `.gitignore` when it is missing. It never overwrites an existing file or removes a line.

### 2.2 CLI

- R5. `gitboard` or `gitboard serve [--port N] [--open]`: start the board.
- R6. `gitboard move <slug> <stage> [--from <stage>] [--dry-run]`: the same move as the board. `<stage>` is an id, a folder or a name. `--dry-run` prints the plan.
- R7. `gitboard lint`: run the built-in checks; exit 1 on a problem.
- R8. `gitboard list [--json]`: print the board.
- R9. `gitboard init`, `gitboard --version`, `gitboard --help`.
- R9a. `gitboard measure --from <iso> [--to <iso>]`: read the live pages from Tempo through `gcx` and write `architecture.data`; exit 1 without an `architecture` block or `--from`.
- R9b (ADR 0002). The measure names no vendor. The page list comes from `architecture.appDir` (Next.js app router) or `architecture.pagesCommand`. Each call's endpoint, target and column (database, cache, provider) come from the first matching rule in `architecture.calls`, with `architecture.pathFolds` applied; a call with a URL that no rule matches is a provider. The host's name, the database column's name, the deployment attributes and the cache headers come from `architecture.platform`. The data file carries `format` and a `targets` description; for a file without them the server describes the targets from the current rules.

### 2.3 Server

- R10. Listens on 127.0.0.1 and ::1 only. Refuses a request whose Host is not a loopback name with the port (DNS rebinding), and a write whose Origin is not the board's own.
- R11. Routes: `GET /` (the page), `GET /api/board`, `GET /api/version`, `GET /api/doc?path=` (one markdown file under the lifecycle folder, or one of the repo docs below, rendered with raw HTML escaped), `GET /api/docs` (the docs the sidebar offers: the lifecycle folder's README and, when the repo has them, `docs/spec.md`, `docs/configuration.md`, `docs/adr/README.md` and `CHANGELOG.md`; each checked by real path inside the repo), `GET /api/architecture` (the measure file, 404 with a plain message when there is none or no `architecture` block), `POST /api/plan`, `POST /api/move`.
- R12. Writes take JSON only, at most 16 KB; an oversized body answers 413, bad JSON 400. Errors never carry a stack trace.
- R13. Reads the main checkout, whichever worktree starts the server.
- R14. Refreshes the git pipeline in the background every 15 seconds and pull requests at most once a minute. The board version combines the roadmap version and the pipeline hash, so the page refetches only on change.

### 2.4 Board page

- R15. One column per stage, headed by its number, name and count. Cards grouped by group inside a column; a group collapses inline.
- R16. A card shows title, group, progress, phase count, created date (DD/MM/YYYY), blocked, gated and linked counts, and its furthest git pipeline step with work. The last landed date and commit show in the details panel.
- R17. Drag a card to another column, or focus it and use the keyboard (arrow keys pick a column, Enter confirms, Escape cancels). A confirm dialog states every step the move will take (worktree, `git mv`, link rewrites with a count, hooks, lint gate, commit subject, fast-forward) before anything runs. Undo moves it back the same way.
- R18. A details panel shows relations, the git track per branch, the phase list with progress, and a markdown preview of the build list or any phase.
- R19. Hovering or focusing a card traces its dependency lines to related cards; lines route around cards, and shared segments draw once. A dependency where one side still blocks the other draws as a red dotted line with an arrowhead, on top of the others.
- R20. Filter by group, relation (blocked, gated, linked), git step and text; order by stage order, progress, last landed, created or title.
- R21. Light and dark themes from the system setting. System fonts; no web font or external request.
- R22. Live: moves made in a terminal, an editor or another worktree appear within about two seconds of landing.
- R23 (ADR 0001, 0002). With an `architecture` block, the sidebar lists Architecture after the Roadmap (the Roadmap is the default; with no place in the URL the board opens on the view last chosen in that browser). The Architecture view shows request, pages, database, cache and providers columns at fixed widths, each page's warm server time against the budget, hover to trace its calls with the board's link routing, click for a read path with resizable name and time columns. Database and provider groups, card icons and labels come from the data file's `targets`. Beside the sidebar its link corridors are 64px wide, so at 1440px wide the map fits beside the sidebar in icon mode.
- R24. The page is a dashboard shell (shadcn/ui Sidebar and Navigation Menu). The sidebar says where you are, in shadcn's sidebar layout. Under the repo name and main branch, the Board group lists Roadmap, with Work in flight and Needs you under it, then Architecture (when configured). Picking Work in flight or Needs you shrinks the main bar to icons and opens a second bar beside it listing each branch with work, or Blocked, Gated, Checks failing and Needs review; picking a branch or filter there opens it on the board and closes the second bar, with the main bar staying shrunk, and a branch also opens the details panel of its feature with the most files on it; picking Work in flight or Needs you again, the close button, expanding the main bar or picking Roadmap or Architecture also closes it. Reached by a link (reload, back or forward, a shared URL), a branch or "Needs you" place opens its second bar. Each item carries its count and a zero shows no count; Needs you counts each feature once. The stages are in the top bar's Lifecycle menu. The foot holds the docs menu (the lifecycle folder's README, `docs/spec.md`, `docs/configuration.md`, `docs/adr/README.md` and `CHANGELOG.md`, those the repo has), the theme toggle and the read status: when git was last read ("Not read since" in the attention tone when the server stops answering), and "GitHub Missing" when pull requests cannot be read. The top bar holds the sidebar toggle, a breadcrumb, the Lifecycle and Help menus and the view's search.
- R25. Every sidebar place is a URL hash (`#/roadmap`, `#/roadmap?stage=2`, `#/roadmap?branch=<name>`, `#/roadmap?need=blocked`, `#/architecture`), so back, forward, reload and a shared link work. A "Needs you" place turns on its one filter while you are there and puts the person's own filters back when you leave. ⌘B or Ctrl+B folds the sidebar to icons; folded, Work in flight and Needs you stand as icons under Roadmap. Picking Roadmap or Architecture folds the sidebar to icons and opens that view. Reached any other way (a reload, back or forward, the breadcrumb), a view opens the sidebar expanded on the Roadmap and folded on Architecture, then keeps the person's own toggle in that browser. Folded, every item has a tooltip with its label and count.

### 2.5 Configuration

`gitboard.config.json` at the repo root. Every key is optional, and a key of the wrong type fails with a message that names it:

| Key | Default | Meaning |
| --- | --- | --- |
| `roadmapDir` | `"roadmap"` | Folder that holds the stage folders. |
| `mainBranch` | `"main"` | Branch moves land on. |
| `port` | `4610` | Board port. |
| `stages` | the five above | `[{ "folder": "1.ideas", "name": "Ideas" }, ...]` |
| `groups` | `[]` | `[{ "name": "Payments", "match": "^pay-\|checkout", "icon": "CreditCard" }]`, first match on the slug wins; `icon` is optional. |
| `defaultGroup` | `"General"` | Group for a slug no rule matches. |
| `codeRoots` | `"auto"` | Top-level folders whose paths in feature docs tie code to a feature. |
| `rewriteSkip` | build folders | Path prefixes a move never rewrites. |
| `lint` | built-in on | `{ "builtin": true, "command": null, "phaseHeadings": [], "readmeSections": [] }` |
| `hooks.onEnter` | `{}` | `{ "5": ["node scripts/changelog.mjs {slug}"] }`, keyed by stage id or folder. |
| `github` | `true` | Read open pull requests with `gh`. |
| `architecture` | none | The Architecture view and `gitboard measure`; see docs/configuration.md. |

Hook and lint commands are code the repo owner wrote; GitBoard Canvas runs them in the move worktree with the placeholders shell-quoted.

### 2.6 Built-in lint

- L1. Every configured stage folder exists.
- L2. No slug sits in two stages.
- L3. Every relative markdown link inside the lifecycle folder resolves.
- L4. Phase files are named `NN-slug.md` or `NNx-slug.md`.
- L5. When `lint.phaseHeadings` is set, each phase file has those headings; when `lint.readmeSections` is set, each feature README has those sections.
- L6. Every feature slug (folder name, or file name without `.md`) uses letters, digits, `-` and `_` only.

`<roadmapDir>/templates/` holds copy-me templates and is skipped by every check. At stage level, `README.md`, `CONTEXT.md`, `AGENTS.md` and `CLAUDE.md` (any case) are not features, for the board and for lint alike.

### 2.7 Quality

- Q1. Unit tests for parsing (ticks, titles, phases, relations, status, attribution, link rewriting) and integration tests for moves in temporary repos (success, refused, dirty, conflict retry, hook failure, lint failure, lock).
- Q2. Tests set `commit.gpgsign=false` in their temporary repos.
- Q3. `npm run typecheck` and `npm test` pass on Node 22.12 and the current Node release.
- Q4. No product-specific names in code, docs or templates. A vendor preset under `docs/presets/`, and the docs section that shows it, may name its vendors.

## 3. Out of scope for 0.1

- Writing to GitHub (issues, project boards). Read-only pull requests only.
- Multi-repo boards.
- Editing markdown from the board. Edit in your editor; the board follows.
- Hosting. GitBoard Canvas is a local tool.

## 4. Licence

MIT, an OSI-approved licence (listed by the OSI licence API at `https://opensource.org/api/license/mit`, SPDX `MIT`). Each source file starts with `// SPDX-License-Identifier: MIT`. Third-party code keeps its own notice in `THIRD_PARTY_NOTICES.md`.
