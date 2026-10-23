# Security

## Threat model

GitBoard Canvas is a local tool. It reads and writes one git repository on your machine and serves a page to you.

- The server binds to `127.0.0.1` and `::1` only. It is not reachable from other machines.
- It refuses any request whose Host header is not a loopback name with the board's port, which blocks DNS rebinding.
- It refuses a write whose Origin is not the board's own.
- Writes accept JSON only, up to 16 KB. Errors never carry a stack trace.
- Rendered markdown escapes raw HTML.
- The only network use is `gh`, which reads open pull requests when it is installed and signed in. Set `github` to `false` to stop that.
- `gitboard measure` runs only when you call it. It reads traces through `gcx` and, when `architecture.site` is set, sends a `HEAD` request to that site. The board serves the file it writes, `architecture.data`, only when that path resolves inside the repo.
- It never pushes, never force-updates a branch, never stashes or resets, and never touches another worktree's files.
- Reading the repo changes nothing in it. Every git call runs with `GIT_OPTIONAL_LOCKS=0`, so the background refresh never takes `index.lock` or rewrites a checkout's index. Only a move, `gitboard init` and `gitboard measure` write: `init` adds files where nothing is (it never writes through a symlinked file or folder, and appends one line to a `.gitignore` that is not a symlink), and `measure` writes only `architecture.data`, refusing a file that is not an earlier measure or a path with a link on it, and replacing the file in one rename.

Hooks (`hooks.onEnter`), `lint.command` and `architecture.routesCommand` run shell commands. They are code the repo owner wrote in `gitboard.config.json`, and they run with your permissions. Treat that file like any build script: review changes to it, and do not run GitBoard Canvas in a repo whose config you do not trust.

Out of scope: someone with local access to your machine or your repo, and malicious hook commands that you chose to run.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository (Security tab, then Report a vulnerability). Please do not open a public issue. Include the version, steps to reproduce and what you expect to happen.

We aim to reply within seven days.
