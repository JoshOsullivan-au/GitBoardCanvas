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

## Commits

Use conventional messages: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, with a short subject in the imperative.

Sign off every commit with the Developer Certificate of Origin (https://developercertificate.org/):

```sh
git commit -s -m "fix: keep links inside code fences"
```

The `-s` flag adds a `Signed-off-by:` line and states that you have the right to submit the change under the project's MIT licence.

## Pull requests

Keep one change per pull request. Describe what changed and how you checked it. Maintainers review every change, including ones written with AI help, and ask you to say so in the description.

## Reporting problems

Bugs and ideas go in the issue tracker. Security problems follow [SECURITY.md](SECURITY.md).
