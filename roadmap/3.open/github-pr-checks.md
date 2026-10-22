# GitHub pull request checks

Why: a card should show whether the pull request for a feature passes its checks, so a reviewer knows what is ready.

Needs `v0-1-release` to land first, because it reads the pull request data that release ships.

Folded into `git-github-workflow` as its phase 01 (22/10/2026). Tick these items when that phase lands, then move this feature to Complete.

## Build list

- [ ] Read check status for each open pull request through `gh pr list --json statusCheckRollup`
- [ ] Show passing, failing and pending on the card's PR step
- [ ] Refresh with the existing once-a-minute pull request poll
