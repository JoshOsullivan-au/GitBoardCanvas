# GitHub pull request checks

Why: a card should show whether the pull request for a feature passes its checks, so a reviewer knows what is ready.

Needs `v0-1-release` to land first, because it reads the pull request data that release ships.

## Build list

- [ ] Read check status for each open pull request through `gh pr list --json statusCheckRollup`
- [ ] Show passing, failing and pending on the card's PR step
- [ ] Refresh with the existing once-a-minute pull request poll
