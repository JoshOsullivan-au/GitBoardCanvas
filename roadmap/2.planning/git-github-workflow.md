# Git and GitHub workflow

Why: a team whose main branch only takes changes through pull requests cannot land a board move today, a card shows a pull request but not whether its checks pass or it is approved, a pull request merged on GitHub does not count as landed, and starting a build means making the branch and worktree by hand.

Plan: [`git-github-workflow/README.md`](./git-github-workflow/README.md) holds the order, rules and open decisions.

Builds on `v0-1-release`. Ships as 0.2.0.

Phase 01 replaces `github-pr-checks`.

## Build list

- [ ] Phase 01: pull request checks, review, draft and conflicts on cards
- [ ] Phase 02: a merged pull request counts as Landed
- [ ] Phase 03: a feature branch and worktree when a card enters a chosen stage
- [ ] Phase 04: moves land through a pull request when `landing` is `"pr"`
- [ ] Phase 05: spec, docs, fake GitHub test kit and demo, then release 0.2.0

## Decisions

- 22/10/2026: `landing` is `"local"` (default, today's fast-forward of the main branch) or `"pr"` (push the move branch and open a pull request) (Josh).
- 22/10/2026: GitBoard Canvas never merges a pull request. A person or GitHub auto-merge does, so branch protection and required reviews stay in charge (Josh).
- 22/10/2026: the only writes to GitHub are pushing `gitboard-move/*` branches and opening their pull requests, and only when `landing` is `"pr"`. No comments, labels, merges, issues or project boards. With `landing: "local"` the tool still makes no network call except reading pull requests (Josh).
- 22/10/2026: feature branches and worktrees are built in, opt-in per stage, local only, never pushed, skipped when they exist, and never run installs or tests (Josh).
- 22/10/2026: cards show check results, review state, draft and merge conflicts from the same once-a-minute `gh pr list` read (Josh).
- 22/10/2026: a pull request merged on GitHub shows as Landed, marked not pulled until the local main branch has the merge (Josh).
- 22/10/2026: worktrees of finished features are listed with a "merged, safe to remove" note and never removed by the tool (Josh).
- 22/10/2026: one feature, five phases, released together as 0.2.0 (Josh).
