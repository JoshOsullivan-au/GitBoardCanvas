# T6 Server and CLI

Spec: R2 to R14. Port `<original build>/scripts/roadmap-board.mjs` and `<original build>/scripts/roadmap-move.mjs` (read-only reference) to `src/server.ts` and `src/cli.ts`; add `src/init.ts` (copies `templates/` without overwriting). Bin `dist/cli.js` with a node shebang. Icons from `dist/ui/icons.json`; page from `dist/ui/board.html` (resolve relative to the compiled file). No jiti. Tests: server security (Host, Origin, 413, 400, doc path escape) and init (creates, never overwrites).
