# GitHub pull request checks

Why: a card should show whether the pull request for a feature passes its checks, so a reviewer knows what is ready.

Needs `v0-1-release` to land first, because it reads the pull request data that release ships.

Folded into `git-github-workflow` as its phase 01 (22/10/2026). Tick these items when that phase lands, then move this feature to Complete.

## Build list

- [x] Read check status for each open pull request through `gh pr list --json statusCheckRollup`. **Completed** 24/10/2026: read as GitHub's own rollup state through `gh api graphql` instead, because per-check `statusCheckRollup` on 100 pull requests times out on big repos (git-github-workflow phase 01, `src/pipeline.ts` `PR_STATUS_QUERY`)
- [x] Show passing, failing and pending on the card's PR step. **Completed** 24/10/2026: chip and details panel in `src/ui/board.html`, checked against GitHub on live repos
- [x] Refresh with the existing once-a-minute pull request poll. **Completed** 24/10/2026: same one-minute `prCache` in `src/pipeline.ts`
