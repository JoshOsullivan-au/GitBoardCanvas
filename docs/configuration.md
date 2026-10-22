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

`icon` is optional and names the icon shown on the group heading and its cards. Choose from `AddressBook`, `Bell`, `BookOpen`, `Briefcase`, `BuildingOffice`, `ChartLineUp`, `ChatCircle`, `Cloud`, `Code`, `CreditCard`, `Cube`, `Database`, `DeviceMobile`, `Gear`, `Globe`, `Lightning`, `Package`, `PaintBrush`, `Palette`, `Robot`, `Rocket`, `Sparkle`, `Stack`, `Users`, `Wrench`. A missing or unknown name shows `Stack`. To give the default group an icon, add a rule with the same name.

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
