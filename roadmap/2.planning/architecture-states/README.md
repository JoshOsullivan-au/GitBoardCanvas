# Architecture states

A switcher in the board's sidebar (the states as sub-items of Architecture) picks which state of the code the map shows: Planned, WIP, Staged, Committed, Pull request, Main or Live. Live is the measured map, as now. Every other state draws Live with an overlay of what that state changes: pages added or removed, calls a page can newly reach or no longer reaches, and pages whose own code changed. The board reads the states from its existing once-a-minute pipeline poll and GitHub read, so the overlay follows the worktrees without a click. Done means a person can see, on the map, what main will ship next, what a branch or pull request changes, and what the work in a worktree touches, and the figures never claim a timing that was not measured.

## Evidence

Research on a real host app (an app router with about 110 pages and 1,700 source files, measured through Tempo). The research notes and scripts are kept outside this repository.

| Finding | Number | Note |
| --- | --- | --- |
| Pages at any git ref read from the tree, no checkout | Same set as the fs read; 8 to 13 ms | h1 |
| A branch's raw tree against main shows age, not work | 89 phantom removals on branches 0 ahead | h1, proof |
| Static scan with the host's wrapper names finds the calls Tempo saw | Recall 98.9%, precision 12% | h2 |
| Generic patterns alone | Recall 16% | h2 |
| Any core change marks nearly every page through imports | 95% of pages per code commit | h3 |
| With shared files split out | p90 1.8% of pages | h3 |
| Commits that change any page's reachable calls | 5% | h3.1 |
| Main vs Live on the host (about 170 unreleased commits) | about a quarter of pages marked, shell call changes shown once | proof |
| Tick cost | Pipeline 59 ms, warm snapshot 34 ms | h5 |
| Traces carry the deployed commit | No; GitHub Deployments do | h4 |
| Preview deployments export traces | No (0 in 7 days) | h6 |
| Planned feature docs name pages or calls | 75.6% name a page, 97.6% a call | h7 |

## Design

### States and their bases

| State | Shown when | Drawn as | Base it is diffed against |
| --- | --- | --- | --- |
| Live | an `architecture.data` file exists | the measured map, with timings | none |
| Main | main is ahead of the Live commit | Live + this state's marks | Live commit |
| Pull request | an open pull request (from the existing `gh pr list` read) | Live + this state's marks | merge-base with main |
| Committed | a worktree branch with commits ahead of main and no pull request | Live + this state's marks | merge-base with main |
| Staged | a worktree with staged files | Live + this state's marks | the worktree's HEAD |
| WIP | a worktree with edited or untracked files | Live + this state's marks | the worktree's index |
| Planned | cards in the chosen stages name pages or calls | Live + planned marks | none |

- A state with nothing in it is not listed. A worktree with no dirty files and no commits ahead has no state.
- The Live commit is the latest successful Production deployment from `gh api repos/{repo}/deployments?environment=Production`, read with the pull requests. `gitboard measure` also records it as `commit` beside `deployment`. With no deployment record, Main is diffed against the commit the measure names, and with neither, Main is hidden.
- Each state is a set of blob SHAs (a tree, an index, or files hashed from disk). One cache keyed by blob SHA holds each file's imports and endpoints, so every state shares the work.

### Compare to

- By default a state shows only its own change against the base in the table: WIP against the index, Staged against HEAD, a branch against its merge-base, Main against Live. This is the per-layer view that stacked pull requests, VS Code's Changes and Staged Changes groups, GitHub's three-dot diff and Datadog's version comparison all default to.
- A "Compare to" picker beside the switcher moves the base down the ladder, as Gerrit's base selector and Datadog's version picker do. Compare to Live gives the cumulative view: what the map looks like if this state and everything under it shipped.
- In a cumulative view each mark carries the layer that made it (WIP, Staged, Committed, Main), and marks from lower layers are muted, as Datadog greys versions it is not comparing.
- Why per-layer first: on the host, a worktree with ten edited files marks 1 page against its index; against Live it would carry Main's marks as well, and the one page the person is working on would be lost.
- The picker resets to the state's own base when the state changes. The last choice is remembered per state, per browser.

### The overlay

Patterns taken from Figma's branch review and Datadog's deployment comparison, read from their public documentation.

- **Shared line.** Files in more than 10% of page closures are shared (the shell and core). Changes to them show once, at the top of the Pages column: "Shared: N files", plus calls the shared code adds or drops. They never mark each page.
- **Page marks.** Four kinds, as Figma labels branch changes: `Added`, `Edited` (its own files changed, or the calls it can reach changed), `Updated` (changed only through shared code), `Removed`. Updated marks stay hidden until a "This page / + Shared" toggle is on, as Datadog's "+ Dependencies" scope.
- **Reasons on every mark.** Each Edited mark lists why (files changed, calls `+` or `-`). A "Calls only" filter hides marks with no call change. Figma users stop trusting an Edited badge that shows no visible difference.
- **Call targets.** An endpoint a state adds appears in its column (database, cache, provider) as a dashed card, and one it drops is struck through. Hover traces the page's calls as now.
- **No timings outside Live.** Overlay states show Live's timings for unchanged pages and a "not measured" note on marked ones. The tab never estimates a time.
- **Static wording.** Overlay calls read "can reach", because the scan finds what a page imports, not what a request runs.

### Configuration

```json
{
  "architecture": {
    "scan": [
      { "match": "\\bcallRpc\\(\\s*[\"'`]([a-z_]+)", "endpoint": "rpc {1}" },
      { "match": "\\bselectRows\\(\\s*[\"'`]([a-z_]+)", "endpoint": "table {1}" }
    ],
    "states": { "planned": ["2", "3"], "sharedShare": 0.1 }
  }
}
```

- Every `calls` rule with a `path` is also scanned as a string literal (`/api/rpc/{name}`), so a host gets most calls with no `scan` entries. `scan` adds the host's own wrapper names. GitBoard's code names no stack (ADR 0002).
- `states.planned` lists the stages whose cards feed Planned; an empty list hides Planned.

### Planned (phase 04)

- A card in a `states.planned` stage marks the pages it names (a route in backticks that the app has) and the endpoints it names. The card is the mark's source, and clicking the mark opens it.
- An optional `## Architecture` section in the feature doc makes it exact: one route or endpoint per line, `+` new, `-` removed. New pages appear only through this section.

### The comparison view (phase 03)

- **Header** names both sides, as Datadog does: "WIP my-branch compared to Staged", each side a chip, the base chip opening the Compare to picker. Every non-Live comparison carries "Static scan, not measured".
- **Set filter** above the Pages column with counts: All, Changed, New, Removed. Call target columns filter New, Inactive (no longer reachable) and Common.
- **Muted context.** Unmarked pages and call cards are muted, as Datadog greys versions outside the pair. A "Show overlays" switch returns plain Live without leaving the state.
- **Page details** (click a mark): Before and After call lists side by side, or one list with `+` and `-` (the overlay view), as Figma's Side by side / Overlay toggle. Below it, rows for each changed owned file and the commits that touched them (`git log <base>..<source> -- <file>`). A "3 of 28" pager with arrow keys walks the marked pages.
- **Measured deltas only between measures.** Live can be compared to an earlier measure of the same data file, read from its git history. Then each page shows warm server ms with an arrow and percent, red when slower and green when faster, and `New` when the earlier measure has no figure, as Datadog's endpoint table. No other comparison shows a time delta. A real host already has committed measures in two formats (one without `format`), so this reads files without `format` and treats pages measured on one side only as New or Removed, not as a speed change.

### Reads

- `GET /api/architecture/states`: the listed states, each with its id, kind, label, branch, pull request, default base and counts by mark kind. Built on the existing pipeline cache, so it adds no git call on its own. Earlier measures of the data file are listed as Live states with their measured date.
- `GET /api/architecture/compare?source=<id>&base=<id>`: one comparison. Returns `{ source, base, measured, shared: { files, calls: { added, dropped } }, pages: [{ route, kind, reasons, callsAdded, callsDropped, files, timing? }], targets: [{ endpoint, set, pages }], counts }`. `base` defaults to the source's own base. Cached by the pair of blob sets; a tick recomputes only what changed.

## Order and rules

1. Phase 01 reads states and builds the blob cache with tests on a fixture repo with a worktree in each state. No UI.
2. Phase 02 adds scan rules, closures, the shared split and the overlay read. The fixture asserts the shared line and page marks.
3. Phase 03 adds the switcher and the marks. The board shell (`board-shell-sidebar`, shipped in 0.2.0) is where the switcher goes, with no tabs above the columns first:
   - **Sidebar sub-items** under Architecture, one per state that has something in it, in the order Planned, WIP, Staged, Committed, Pull request, Main, Live; empty states are left out. Each carries its count of changed pages (no badge for zero), and Architecture carries the active state's count. A Live commit that is Missing disables Main, with the reason as its tooltip. With no measure file, Architecture stays and its sub-items are hidden.
   - **Icon mode**: the Architecture icon opens the same list as a `DropdownMenu` with `side="right"`, the same items in the same order, so the map keeps its width.
   - **Breadcrumb**: on Architecture the last crumb names the state ("GitBoard / Architecture / Main") and is a `DropdownMenu` of the states with their counts.
   - **Places**: each state is a URL hash (`#/architecture/main`, added to `src/web/lib/hash.ts`), so back, forward, reload and a shared link work; with no state in the hash the board opens the state last chosen in that browser.
   - **Branch picker**: when a state has more than one branch, the comparison header above the columns gets a picker (see The comparison view).
   - **"Show on map"**: a `SidebarMenuAction` on a Work in flight branch row, shown when that branch has a Committed state, opens the map in that state.
4. Phase 04 adds Planned.
5. Phase 05 adds `commit` to the measure file (format 3, older files still read), the spec lines, ADR 0003 and the demo repo states.

Rules:

- Reading changes nothing in the repo or any worktree: no checkout, no index write (`git ls-files --stage` and `git hash-object` without `-w`).
- The only new network call is one more `gh` read (deployments), made beside the pull request read, once a minute at most, and never when `github` is false. Spec R3 already allows `gh`.
- No new runtime dependency.

## Time

About 6 to 8 days for one person: phases 01 and 02 are 2 to 3 days with tests, phase 03 is 3 to 4 days of UI (the sidebar sub-items, icon menu, breadcrumb menu, hashes and "Show on map", about a day; then the comparison header, set filter, page details and measure-to-measure deltas), phases 04 and 05 are a day together.

## Open decisions

- Per-layer by default with a "Compare to" picker reaching Live for the cumulative view (recommended after prior-art review; see Compare to), or cumulative by default?
- One branch at a time with a picker (recommended, newest change first) or every branch in one view?
- Planned from Planning and Open (recommended) or Planning only; card prose plus `## Architecture` (recommended) or the section only?
- Pull request timings from preview traces: leave for a later opt-in (recommended; the host exports none today)?
- Settled 25/10/2026: the board page moved to React + shadcn/ui on main (`42cca50`) and the shell shipped in 0.2.0 (`8b6104a`), so phase 03 builds in the shell. The React mock and its evidence (licences, bundle size, migration size) are kept with the research notes, outside this repository. React Bits Pro cannot ship in this MIT repo under its licence (§2.4).
