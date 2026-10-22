# Git and GitHub workflow

GitBoard Canvas learns the way teams already work on GitHub. Cards show whether a feature's pull request passes its checks and is approved. A pull request merged on GitHub counts as Landed. A card entering a chosen stage gets its own branch and worktree to build in. A move can land through a pull request, so a protected main branch works with the board. Done means a team with branch protection can run its whole lifecycle from the board, and a solo user who keeps `landing: "local"` sees no change in behaviour.

## Design

### Configuration (all optional, all off or unchanged by default)

```json
{
  "landing": "local",
  "remote": "origin",
  "branches": {
    "onEnter": { "4": true },
    "name": "feature/{slug}",
    "path": ".worktrees/{slug}"
  }
}
```

- `github` stays a boolean (false stops every `gh` call, as now). New keys sit beside it rather than turning it into an object, so 0.1 configs keep loading.
- `landing: "pr"` needs `github: true`, a remote named by `remote`, and `gh` signed in; `validateConfig` and `planMove` say which one is missing.
- `branches.onEnter` is keyed by stage id or folder, like `hooks.onEnter`. `name` and `path` take `{slug}`.

### What a card shows (phases 01 and 02)

| Pull request state | Chip and detail |
| --- | --- |
| Checks | Passing, failing or pending, from `statusCheckRollup`; no checks shows nothing. |
| Review | Approved, changes requested, or review required, from `reviewDecision`. |
| Draft | "Draft", as now. |
| Conflicts | "Conflicts" when `mergeable` is `CONFLICTING`. |
| Merged | "Merged #n" on the Landed step; "not pulled" until the merge commit is on the local main branch. |
| Move in flight | "Moving to <Stage>, PR #n" while a `gitboard-move/<slug>-*` pull request is open; the card stays in its old stage until the merge is pulled. |

New filters: "Checks failing", "Needs review", "Not pulled".

### A move with `landing: "pr"` (phase 04)

1. Plan as now, plus three blocks: no remote, `gh` not signed in, or an open move pull request for the same slug.
2. Lock, worktree on `gitboard-move/<slug>-<stamp>` from the main branch, `git mv`, link rewrite, hooks, lint gate, one commit. Unchanged.
3. `git push <remote> <branch>` with no force flag. A rejected push keeps the commit as `archive/<branch>`, as a failed move does today.
4. `gh pr create --base <mainBranch> --head <branch> --title <subject> --body <plan summary and trailers>`. If this fails after the push, the branch stays on the remote and the error prints the `gh pr create` command to run by hand. The tool never deletes a remote branch.
5. Remove the worktree and the local branch; the remote branch carries the move. No fast-forward, no redo: if the main branch moves, the pull request shows it and GitHub's merge settles it.
6. Result carries `pr: { number, url }`. The board shows the move in flight until the merge is pulled.

### A feature branch on stage entry (phase 03)

After a move lands (or its pull request opens), when `branches.onEnter` names the target stage:

1. Check the worktree folder is ignored by git (`git check-ignore`). If not, refuse with the line to add to `.gitignore`. The tool does not edit `.gitignore` here.
2. Branch `feature/<slug>` exists with a worktree: report it, change nothing. Exists without one: add a worktree on it. Neither: `git worktree add -b feature/<slug> .worktrees/<slug> <mainBranch>`.
3. Never push, install, run tests or switch the main checkout. The result names the branch and path so a person or agent can start there.

A failure here never undoes the move; it is reported as a warning beside the landed move.

### Finished features (phase 03)

A Complete card's details list any branch and worktree that still carry its slug, with "merged, safe to remove" when the branch has no commits ahead of the main branch, and the `git worktree remove` and `git branch -d` commands. The tool never runs them.

## Order

| Phase | File | Depends on |
| --- | --- | --- |
| 01 | [`phases/01-pr-status-on-cards.md`](./phases/01-pr-status-on-cards.md) | none |
| 02 | [`phases/02-merged-pr-as-landed.md`](./phases/02-merged-pr-as-landed.md) | 01 |
| 03 | [`phases/03-feature-branch-on-enter.md`](./phases/03-feature-branch-on-enter.md) | none |
| 04 | [`phases/04-moves-through-pull-requests.md`](./phases/04-moves-through-pull-requests.md) | 01, 03 |
| 05 | [`phases/05-spec-docs-and-release.md`](./phases/05-spec-docs-and-release.md) | 02, 04 |

01 and 03 can run at the same time.

## Every phase

- `npm run typecheck` and `npm test` pass on Node 22.12 before a phase closes.
- New `gh` behaviour is tested against a fake `gh` on `PATH` (phase 01 adds it); new push behaviour against a bare repo used as `origin`. No test reaches github.com.
- Every move promise still holds except the ones phase 05 rewrites on purpose: never force-push, never reset, never stash, never touch another worktree's files, one commit per move, a failed step leaves the main branch as it was.
- No new runtime dependency.
- Dates are DD/MM/YYYY.

## Skills and practice used

| Source | Shapes |
| --- | --- |
| `feature-dev` | Explore, ask, design, then build; reviewers in phase 05. |
| `using-git-worktrees` | Check the worktree folder is ignored before adding one; skip when one exists; `.worktrees/` as the default place; never nest worktrees. |
| `github:pr-manager` | Pull request lifecycle: create from a branch, read status and reviews, merge left to people or GitHub settings. |
| `github:workflow-automation` | Read check runs as passing, failing or pending; least privilege for writes. |

## Source items

| Item | Phase |
| --- | --- |
| Check status, review, draft, conflicts on cards (was `github-pr-checks`) | 01 |
| Merged pull request as Landed | 02 |
| Feature branch and worktree on stage entry; finished-feature cleanup list | 03 |
| Moves through pull requests | 04 |
| Spec, docs, demo, 0.2.0 | 05 |

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

States: Done, In progress, Planned.

## Open decisions

None. All eight were settled on 22/10/2026; see the build list file.
