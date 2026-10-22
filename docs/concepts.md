# Concepts

Gitboard Canvas treats a repository folder as a product lifecycle. This page explains the ideas for someone who has not used the approach before. The exact rules are in [spec.md](spec.md).

## The lifecycle

A repo keeps one lifecycle folder, `roadmap/` by default. Inside it are numbered stage folders. The default five are Ideas, Planning, Open, In progress and Complete.

The stage folder a feature sits in is its stage. There is no status field to edit, so the board, the terminal and your editor can never disagree.

Each stage has one gate: a person decides. Gitboard Canvas makes the move cheap and safe. It does not decide when a feature is ready.

## Features

A feature is a markdown file and, when it needs one, a folder with the same name. The slug is the file name without `.md` and is unique within a stage.

```
roadmap/3.open/checkout-redesign.md
roadmap/3.open/checkout-redesign/
  README.md
  references.md
  docs/
  mocks/
  phases/01-cart-summary.md
  phases/02-payment-step.md
  phases/checklist.md
```

- The title is the first `# ` heading, else the slug in title case.
- Add `group: Payments` in frontmatter to put the card in a group. Without it, the first matching `groups` rule in the config applies, else `defaultGroup`.
- Early ideas are often a single file. The file and the folder always move together.

Copy `templates/feature/` to start one. `gitboard init` puts those templates in your repo.

## Ticks

Progress comes from markdown task lists.

- `- [ ] item` is open.
- `- [x] item` is done.
- A card's progress is done over total across the build list and its phases.

The convention for a landed item is `- [x] item. **Completed** DD/MM/YYYY: evidence`, where evidence is a commit, a file or a test.

## Phase documents

A phase is one slice of the build that can land on its own. Phase files live in `phases/` and are named `NN-slug.md`, numbered in build order (`01`, `02`, `11b`). The number and title come from the file name and its first `# ` heading.

The default phase template has fifteen headings in three parts:

- Directive: Overview, Directive, Objective/Goal, Limitations/Restrictions, Guardrails, Done when.
- Orchestration: Orchestration, Depends on, Steps, UI, Files/references, Review, Loop.
- Execution: Execution, Verify.

The template is a starting shape. To make it a rule, list the headings in `lint.phaseHeadings` and `gitboard lint` checks every phase file.

The feature README carries what a person reads before building:

| Section | Holds |
| --- | --- |
| Order | The phase table, with what each phase depends on. |
| Every phase | Rules all phases follow. |
| Source items | Each open line of the build list and the phase that owns it. |
| Ops actions | Steps only a person can take. |
| Status | Done, In progress or Planned for each phase. |
| Open decisions | Questions a person must answer. |

## Relations

Gitboard Canvas reads three kinds of relation from the text. No special syntax is needed.

- Blocked: a line that names another feature's slug and reads as a dependency (`depends on`, `needs`, `requires`, `after`, `blocked by`, `builds on`, `waits for`, `prerequisite`, `pointer`). The card is blocked until that feature reaches the last stage.
- Gated: the feature waits on a person. That means open items under an `Open decisions` heading, or unticked items under `Ops actions`. An item marked settled, decided, resolved, confirmed, closed, withdrawn or superseded does not count.
- Linked: any other mention of another feature's slug.

Hovering a card on the board traces lines to the cards it relates to.

## The git pipeline

Each card shows the work in flight for its feature, per branch.

| Step | Source |
| --- | --- |
| WIP | Unstaged or untracked files in any worktree. |
| Staged | Files in a worktree's index. |
| Committed | Files on a branch that are not on the main branch. |
| PR | Open pull requests, read with `gh pr list` when `gh` is installed and signed in. |
| Landed | The last commit on the main branch that touched the feature. |

A change counts for a feature when it is under the feature's folder, when the branch name contains the feature's slug, or when the file is a code path the feature's markdown names. A path named by more than four features is too generic and is ignored. `codeRoots` in the config limits which top-level folders are searched.

## How a move works

A move changes a feature from one stage to another. Every move, from the board or from `gitboard move`, follows the same steps.

1. Refuse if the slug is not letters, digits, `-` and `_`, the feature's folder or list has untracked, modified or ignored files in the main checkout, another worktree has unlanded roadmap work for it, the target stage already holds the folder or the list, or another move holds the lock.
2. Take a lock in the git directory. A lock whose process is not alive is taken over.
3. Prune worktrees, then add a temporary locked worktree on a branch `gitboard-move/<slug>-<stamp>` cut from the main branch.
4. `git mv` the file and the folder.
5. Rewrite links. Every markdown link in tracked text files that pointed into the old paths is recomputed relative to its file, and plain `stage/slug` mentions are replaced. Paths in `rewriteSkip` are left alone.
6. Run the `hooks.onEnter` commands for the new stage, then the lint gate. A failure refuses the move and leaves the main branch untouched.
7. Commit once. The subject is `gitboard: move <slug> to <Stage name>`, with `GitBoard-Move` and `GitBoard-Base` trailers.
8. Fast-forward the main branch to the commit. If the main branch moved meanwhile, discard the commit and redo the whole move once from the new tip, so the rewrite, hooks and lint gate see the current tree. If it moves again, the move is refused.
9. Confirm the main branch equals the move commit, delete the branch, remove the worktree and release the lock. A commit that did not land is kept as a tag `archive/<branch>`. Empty leftover folders of the old place are then removed.

Gitboard Canvas never pushes, never force-updates a branch, never stashes, never resets and never touches another worktree's files.

## Worked example

You are building a feature called `checkout-redesign`.

1. You write `roadmap/1.ideas/checkout-redesign.md` with the problem and a rough fix. The card appears in Ideas.
2. You accept the idea and drag the card to Planning. Gitboard Canvas shows the steps, you confirm, and one commit lands: `gitboard: move checkout-redesign to Planning`.
3. In Planning you copy the feature template into `roadmap/2.planning/checkout-redesign/` and write two phases, `01-cart-summary.md` and `02-payment-step.md`. In the README you add `Depends on the card-vault feature` under Order. While `card-vault` is not complete, the card shows as blocked.
4. You list a question under Open decisions: "Guest checkout or account required?" The card shows as gated until you answer it and mark it settled.
5. You accept the plan and move the card to Open, then to In progress when work starts. Each move rewrites links, so a link in `docs/` that pointed at `2.planning/checkout-redesign` now points at `3.open/checkout-redesign`.
6. A branch `checkout-redesign-cart` adds code. The card's pipeline shows WIP, then Committed, then PR when a pull request opens.
7. Each phase lands and ticks its checklist with `**Completed** DD/MM/YYYY: evidence`. Progress on the card rises.
8. When every phase is verified, you move the card to Complete. The `hooks.onEnter` hook for stage 5 can append a line to your changelog in the same commit.

At every point the state is in git. A teammate who pulls sees the same board.
