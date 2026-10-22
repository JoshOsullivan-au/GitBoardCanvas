# GitBoard Canvas

A local kanban board for product work that keeps all of its state in your git repository. Each feature is a markdown file and a folder. The stage folder it sits in is its status, and moving a card is one git commit.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/board-dark.png">
  <img alt="GitBoard Canvas: five stage columns, features grouped by area, and the dependency lines of a hovered feature" src="docs/board.png">
</picture>

## Why

- **No tracker to drift.** The board reads your files, so an editor, a terminal, a coding agent and the board all see the same state.
- **Moves are safe.** A move runs in a temporary worktree, rewrites links, runs your checks and lands one commit. If any step fails, your main branch is untouched.
- **Local only.** No account, no database, no hosted service.

## Requirements

- Node.js 22.12 or later
- git 2.38 or later
- Optional: the GitHub CLI (`gh`), signed in, to show open pull requests on cards

## Install

GitBoard Canvas is not on npm yet. Build it from source:

```sh
git clone https://github.com/JoshOsullivan-au/GitBoardCanvas.git
cd GitBoardCanvas
npm install        # also builds dist/
npm link           # puts the `gitboard` command on your PATH
```

Without `npm link`, run `node /path/to/GitBoardCanvas/dist/cli.js` wherever this README says `gitboard`.

To try it on sample data first, build a demo repository and open its board:

```sh
node scripts/demo-repo.mjs ../gitboard-demo
cd ../gitboard-demo && gitboard
```

## Quick start

Run these in the git repository you want to track.

1. Create the lifecycle folder, the stage folders, the templates and `gitboard.config.json`:

   ```sh
   gitboard init
   ```

   `init` never overwrites a file that exists. It also adds `.worktrees/` to `.gitignore`.

2. Add your first feature by copying the template into the Ideas stage:

   ```sh
   cp roadmap/templates/feature/FEATURE.md roadmap/1.ideas/checkout-redesign.md
   ```

3. Commit the new files. A move refuses to run on uncommitted work.

   ```sh
   git add roadmap gitboard.config.json .gitignore
   git commit -m "Add the lifecycle folder"
   ```

4. Start the board and open http://localhost:4610:

   ```sh
   gitboard
   ```

5. Drag the card to Planning, or move it from the terminal:

   ```sh
   gitboard move checkout-redesign planning
   ```

## How it works

### The folder is the lifecycle

| Stage | Folder | Gate to leave |
| --- | --- | --- |
| 1 Ideas | `roadmap/1.ideas/` | A person accepts the idea. |
| 2 Planning | `roadmap/2.planning/` | A person accepts the phased plan. |
| 3 Open | `roadmap/3.open/` | A person says build. |
| 4 In progress | `roadmap/4.in-progress/` | Every phase is done and verified. |
| 5 Complete | `roadmap/5.complete/` | None. Finished features stay as history. |

There is no `status:` field to fall out of step with the folder. You can rename the stages or use two to nine of them in `gitboard.config.json`. GitBoard Canvas makes a move cheap. A person still decides when a feature is ready.

### A feature's files

```text
roadmap/3.open/checkout-redesign.md      the build list
roadmap/3.open/checkout-redesign/        the feature folder (optional)
  README.md                              order, rules, status, open decisions
  references.md                          research, designs, prior art
  phases/01-data-model.md                one file per phase
  phases/checklist.md                    one tick list per phase
```

- The slug is the file name without `.md`. Use letters, digits, `-` and `_`.
- Progress comes from `- [ ]` and `- [x]` items in these files.
- A card shows as **blocked** when its text says it depends on another feature that is not complete, and **gated** when it has open decisions or unticked ops actions.

### What a move does

1. Refuses if the feature has uncommitted changes, another worktree has unlanded work for it, the target stage already has that slug, or another move is running.
2. Adds a temporary worktree on a new branch cut from your main branch.
3. Runs `git mv` on the file and folder, then rewrites every link to the old path.
4. Runs your `hooks.onEnter` commands for the new stage, then the lint gate.
5. Commits once, fast-forwards the main branch, and removes the worktree.

GitBoard Canvas never pushes, force-updates, stashes or resets, and never touches another worktree's files.

## Commands

| Command | Does | Exit code |
| --- | --- | --- |
| `gitboard` or `gitboard serve [--port N] [--open]` | Starts the board. Keeps running until stopped. | 1 if the port is taken |
| `gitboard move <slug> <stage> [--from <stage>]` | Moves a feature. `<stage>` is an id (`2`), a folder (`2.planning`) or a name (`planning`). | 0 moved, 1 refused |
| `gitboard move ... --dry-run` | Prints the move plan as JSON and changes nothing. | 0 can move, 1 blocked |
| `gitboard lint` | Checks the lifecycle folder. | 0 clean, 1 problems |
| `gitboard list [--json]` | Prints every feature by stage. | 0 |
| `gitboard init` | Creates the lifecycle folder, templates and config. | 0 |
| `gitboard --version`, `gitboard --help` | Prints the version or usage. | 0 |

## For coding agents

- Move features only with `gitboard move`. Do not `mv` or `git mv` stage folders yourself, or links will break.
- Run `gitboard move <slug> <stage> --dry-run` first. In the JSON, `blocked` is `null` when the move can run; otherwise it holds the reason.
- Commit your work before a move. A move refuses uncommitted changes to the feature.
- Read state with `gitboard list --json`. It returns `cards` (each with `slug`, `stage`, `title`, `done`, `total`, `deps`, `decisions`), plus `stages` and `mainBranch`.
- Mark progress by changing `- [ ]` to `- [x]` in the feature's files and committing.
- Run `gitboard lint` before you commit changes under `roadmap/`.
- `gitboard serve` does not exit. Run it in the background or in a separate terminal.

## Configuration

Every key in `gitboard.config.json` is optional. This example sets the main branch and appends a changelog line when a feature reaches Complete:

```json
{
  "mainBranch": "trunk",
  "hooks": { "onEnter": { "5": ["node scripts/changelog.mjs {slug}"] } }
}
```

All keys, defaults and hook recipes are in [docs/configuration.md](docs/configuration.md).

## Security

The board listens on `127.0.0.1` and `::1` only. It checks the Host header on every request and the Origin header on every write. It makes no network calls except `gh` for pull requests. Hook and lint commands come from your own config and run on your machine. See [SECURITY.md](SECURITY.md).

## Documentation

- [Concepts](docs/concepts.md): the lifecycle, phases, relations, the git pipeline and moves in detail
- [Configuration](docs/configuration.md): every config key and hook recipes
- [Specification](docs/spec.md): the requirements the code is built against
- [Changelog](CHANGELOG.md) and [third-party notices](THIRD_PARTY_NOTICES.md)

## Contributing

```sh
npm install
npm test           # vitest
npm run typecheck
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

MIT. See [LICENSE](LICENSE).

GitBoard Canvas, Josh O'Sullivan.
