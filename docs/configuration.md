# Configuration

GitBoard Canvas reads `gitboard.config.json` at the repo root. The file is optional, and so is every key in it. Anything you leave out takes the default. `gitboard init` writes a file with the defaults.

A bad config fails once with the whole list of problems, for example `gitboard.config.json: port must be 1 to 65535`.

## Keys

| Key | Default | What it does |
| --- | --- | --- |
| `roadmapDir` | `"roadmap"` | Repo-relative folder that holds the stage folders. Must not be absolute or contain `..`. A leading `./` and a trailing `/` are removed. |
| `mainBranch` | `"main"` | The branch moves land on. |
| `port` | `4610` | Board port, 1 to 65535. |
| `stages` | five stages | Stages in lifecycle order, two to nine. |
| `groups` | `[]` | Rules that put a feature in a group by slug, each with an optional icon. |
| `defaultGroup` | `"General"` | Group for a slug no rule matches. |
| `codeRoots` | `"auto"` | Top-level folders whose paths in feature docs tie code to a feature. |
| `rewriteSkip` | build folders | Path prefixes a move never rewrites. |
| `lint` | built-in on | Checks that gate a move. |
| `hooks.onEnter` | `{}` | Commands run when a feature enters a stage. |
| `github` | `true` | Read open pull requests through `gh`. |
| `architecture` | none | Turns on the Architecture tab and sets what `gitboard measure` reads. |

### roadmapDir

```json
{ "roadmapDir": "docs/roadmap" }
```

### mainBranch

```json
{ "mainBranch": "trunk" }
```

### port

```json
{ "port": 5000 }
```

`gitboard serve --port 5000` overrides it for one run.

### stages

Each stage has a `folder` and a `name`. The folder must look like `N.name` with `N` matching its position, starting at 1, so the number fixes the order.

```json
{
  "stages": [
    { "folder": "1.backlog", "name": "Backlog" },
    { "folder": "2.building", "name": "Building" },
    { "folder": "3.shipped", "name": "Shipped" }
  ]
}
```

Hook keys and `gitboard move` accept the stage id, the folder or the name.

### groups and defaultGroup

A group is a heading cards sit under inside a column. `match` is a JavaScript regular expression, tested against the slug without regard to case. The first match wins. A `group:` line in a feature's frontmatter overrides the rules.

`icon` is optional and names the icon shown on the group heading and its cards. Choose from `AddressBook`, `Bell`, `BookOpen`, `Briefcase`, `BuildingOffice`, `Buildings`, `CalendarBlank`, `ChartLineUp`, `ChatCircle`, `Cloud`, `Code`, `CreditCard`, `Cube`, `Database`, `DeviceMobile`, `Door`, `Gear`, `Globe`, `House`, `Lightning`, `Package`, `PaintBrush`, `Palette`, `Plug`, `Robot`, `Rocket`, `Sparkle`, `Stack`, `Stethoscope`, `Storefront`, `SunHorizon`, `UserCircle`, `Users`, `Wrench`. A missing or unknown name shows `Stack`. To give the default group an icon, add a rule with the same name.

```json
{
  "groups": [
    { "name": "Payments", "match": "^pay-|checkout", "icon": "CreditCard" },
    { "name": "Platform", "match": "^infra-|^ci-", "icon": "Cube" }
  ],
  "defaultGroup": "Product"
}
```

### codeRoots

GitBoard Canvas ties code changes to a feature when the feature's markdown names a path. `"auto"` considers every tracked top-level folder. List folders to narrow it.

```json
{ "codeRoots": ["src", "packages", "scripts"] }
```

### rewriteSkip

A move rewrites links in tracked text files. Paths that start with any prefix here are never rewritten. Add generated indexes and append-only logs.

```json
{ "rewriteSkip": ["node_modules/", "dist/", "build/", ".next/", "CHANGELOG.md"] }
```

### lint

```json
{
  "lint": {
    "builtin": true,
    "command": "npm test",
    "phaseHeadings": ["Overview", "Done when", "Verify"],
    "readmeSections": ["Order", "Status", "Open decisions"]
  }
}
```

- `builtin`: run GitBoard Canvas's own checks (stage folders exist, no slug in two stages, relative links resolve, phase file names are valid, and the two heading lists below).
- `command`: an extra command run in the move worktree. A non-zero exit refuses the move. `null` means none.
- `phaseHeadings`: when set, every phase file must have these `## ` headings.
- `readmeSections`: when set, every feature README must have these `## ` sections.

### hooks.onEnter

Commands run in the move worktree when a feature enters a stage. The key is a stage id or folder. The value is a list of commands, run in order. These placeholders are replaced, with shell quoting:

| Placeholder | Value |
| --- | --- |
| `{slug}` | The feature slug. |
| `{from}` | The stage it left. |
| `{to}` | The stage it entered. |
| `{path}` | Its new repo-relative path. |

A hook that exits non-zero refuses the move.

### github

Set `false` to stop GitBoard Canvas from calling `gh`. The PR step is then empty.

### architecture

The Architecture tab sits beside the Roadmap board. It shows every page your app serves on the path request, pages, database, cache and providers, with each page's server time against a budget, the calls it makes and the waves they run in. Hover a page to trace its calls; click a card for its read path. Without an `architecture` block the tab is hidden.

`gitboard measure` reads the pages from a Next.js app router folder and their requests from Grafana Tempo through the `gcx` CLI, then writes the `data` file the tab reads. `gcx` must be installed and signed in to your Grafana stack.

| Key | Default | What it does |
| --- | --- | --- |
| `site` | `""` | The production origin, such as `https://example.com`. When set, a page Tempo has no request for gets one `HEAD` request to see whether the host served it from its cache. |
| `budgetMs` | `500` | Server time a page should come in under. A card over it turns amber, over twice it red. |
| `appDir` | `"app"` | The app router folder the pages are read from. Route groups and parallel slots are dropped from the route; `_` folders and intercepting routes (`(.)x`, `(..)x`, `(...)x`) are skipped. |
| `exclude` | `[]` | Regular expressions for routes production does not serve. |
| `routesCommand` | `null` | A command run at the repo root that reads every page route as a JSON array on stdin and prints the live ones. When set it replaces `exclude`, so your app's own rule decides what is live. |
| `areas` | `[]` | Groups on the Pages column, `{ "name", "match", "icon" }`. `match` is tested against the route without regard to case; the first match wins. `icon` takes the group icon names above. |
| `defaultArea` | `"Pages"` | Area for a route no rule matches. |
| `tempo` | see below | `datasource` (the Tempo datasource UID) and `service` (the server's `service.name`) are required by `gitboard measure`. `region` narrows to one `cloud.region`, or `null` for all. |
| `shellShare` | `0.9` | Share of requests an endpoint must appear on to count as the shell's: the layout every page runs. |
| `access` | `[]` | Endpoints shown as access checks, such as `"rpc permit"`. |
| `providers` | `{}` | Display names for provider hosts, such as `{ "api.example.com": "Example" }`. |
| `cache` | `null` | `{ "name", "reader", "dirs" }`: a cache read helper. When no request reached the cache, the tab lists the files under `dirs` that call `reader`. |
| `data` | `".gitboard/architecture.json"` | Repo-relative file `gitboard measure` writes and the tab reads. Commit it to share a measure, or ignore it. `measure` refuses to overwrite a file there that is not an earlier measure. |

```json
{
  "architecture": {
    "site": "https://example.com",
    "budgetMs": 500,
    "exclude": ["^/admin(/|$)"],
    "areas": [
      { "name": "Home", "match": "^/$|^/home", "icon": "House" },
      { "name": "Checkout", "match": "^/checkout", "icon": "CreditCard" }
    ],
    "defaultArea": "Public",
    "tempo": { "datasource": "grafanacloud-traces", "service": "web", "region": null },
    "access": ["rpc permit"],
    "providers": { "api.stripe.com": "Stripe" }
  }
}
```

To measure, load each live page twice inside a window, then run:

```sh
gitboard measure --from 2026-10-23T08:00:00Z --to 2026-10-23T09:00:00Z
```

`--to` defaults to now. The tab shows the second request of each page (warm) and keeps the first as the cold figure. The window must be 25 hours or less, and Tempo returns at most 1000 traces. Calls are named from the server's client spans: Supabase calls by API (`rpc`, `table`, `auth`, `storage`), Redis spans as cache calls, and any other host as a provider.

## Hook recipes

Hooks and lint commands are code you wrote. GitBoard Canvas runs them as you, so review them like any script in your repo.

### Append a changelog line when a feature completes

`gitboard.config.json`:

```json
{
  "hooks": {
    "onEnter": {
      "5": ["node scripts/changelog.mjs {slug}"]
    }
  }
}
```

`scripts/changelog.mjs`:

```js
import fs from "node:fs";

const slug = process.argv[2];
const date = new Date().toLocaleDateString("en-AU"); // DD/MM/YYYY
fs.appendFileSync("CHANGELOG.md", `- ${date}: ${slug} complete\n`);
```

Add `"CHANGELOG.md"` to `rewriteSkip` so a move never rewrites the log.

### Run a test command as the gate

```json
{
  "lint": {
    "builtin": true,
    "command": "npm test"
  }
}
```

If `npm test` fails in the move worktree, the move is refused and your main branch is untouched. To gate only one stage, put the command in a hook instead:

```json
{
  "hooks": {
    "onEnter": {
      "5.complete": ["npm run test:e2e"]
    }
  }
}
```
