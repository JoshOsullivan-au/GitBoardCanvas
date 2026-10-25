# Contributing to GitBoard Canvas

Thanks for helping. This page covers setup, tests, commit style and sign-off.

## Setup

You need Node 22.12 or later and git 2.38 or later.

```sh
git clone https://github.com/JoshOsullivan-au/GitBoardCanvas.git
cd GitBoardCanvas
npm install
npm run build
```

Run the board from your clone with `npm run dev`, which builds and starts `serve`.

Turn on the hooks once per clone with `git config core.hooksPath .githooks`. They build and test before each commit, and refuse a commit or push whose added lines or messages name another project you work on: list those names, one per line, in `$(git rev-parse --git-common-dir)/info/private-terms` (in a plain clone, `.git/info/private-terms`; in a linked worktree, the main clone's), which stays on your machine and is never committed.

## Tests

```sh
npm run typecheck
npm test
```

Both must pass before you open a pull request. Move tests run in temporary git repos and set `commit.gpgsign=false` there. New behaviour needs a test: unit tests for parsing, an integration test for anything that changes how a move runs.

## Style

- Each source file starts with `// SPDX-License-Identifier: MIT`.
- No product-specific names in code, docs or templates.
- Docs use Australian English, dates as DD/MM/YYYY, and plain words.
- One runtime dependency (`marked`). Talk to us before adding another.
- The board page is React in `src/web` (ADR 0004). Keep the board's look in `src/web/styles/board.css`; shadcn/ui parts go in `src/web/components/ui` with `npx shadcn@latest add`.

## Commits

Use conventional messages: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, with a short subject in the imperative.

Sign off every commit with the Developer Certificate of Origin (https://developercertificate.org/):

```sh
git commit -s -m "fix: keep links inside code fences"
```

The `-s` flag adds a `Signed-off-by:` line and states that you have the right to submit the change under the project's MIT licence.

## Pull requests

Keep one change per pull request. Describe what changed and how you checked it. Maintainers review every change, including ones written with AI help, and ask you to say so in the description.

## Releasing

Maintainers release from an up-to-date `main` with a clean tree. Say what changed under `## Unreleased` in `CHANGELOG.md` first; the release refuses an empty section.

```sh
npm version minor   # or patch, major: runs npm run check, files Unreleased under the version, commits and tags
git push --follow-tags
```

The tag starts the Release workflow, which publishes to npmjs.com with provenance and opens a GitHub release from that version's changelog section, and the GitHub Packages mirror. Use patch for fixes, minor for new features or changed behaviour, and major when a config key, command or API response stops working as before.

## Reporting problems

Bugs and ideas go in the issue tracker. Security problems follow [SECURITY.md](SECURITY.md).
