# T3 Move engine, link rewrite, lint, hooks

Spec: section 1.7, 2.5 (lint, hooks), 2.6. Port from the source build (read-only reference):

- `<original build>/scripts/roadmap-board/move.ts` → `src/move.ts`
- `<original build>/scripts/roadmap-board/links.ts` → `src/links.ts`
- `<original build>/scripts/roadmap-lint.mjs` → ideas only for `src/lint.ts` (implement spec 2.6 L1 to L5, not the source's product rules)
- `<original build>/tests/roadmap/{move,links}.test.ts` → `tests/`

Changes from the source:

- `planMove(root, config, input)` and `moveFeature(root, config, input, opts?)` use the `MovePlan`, `MoveResult` and `MoveInput` types in `src/types.ts`.
- Names: lock `<git common dir>/gitboard-move.lock`; worktree `.worktrees/gitboard-move-<slug>-<stamp>`; branch `gitboard-move/<slug>-<stamp>`; subject `gitboard: move <slug> to <Stage name>`; trailers `GitBoard-Move: <slug> <from>-><to>` and `GitBoard-Base: <sha>`.
- Hooks replace the source's fixed scripts: `src/hooks.ts` resolves `config.hooks.onEnter` for the target (keyed by stage id or folder), substitutes {slug} {from} {to} {path} shell-quoted, and runs each with `sh -c` in the move worktree. Then the gate: built-in lint (`runLint(root, config)` from `src/lint.ts`, run against the worktree) when `lint.builtin`, then `lint.command`. List every command in `plan.hooks`.
- `src/lint.ts` exports `runLint(root: string, config: GitBoardConfig): { ok: boolean; problems: string[] }`.
- `config.rewriteSkip` replaces the source's skip regex; the lifecycle folder and main branch come from `config`.
- Never push, stash, reset, or touch another worktree. Keep the source's rebase-once retry, ff-only merge, main-equals-commit check, `archive/<branch>` tag on a commit that did not land.
- Imports use `.js` extensions. `// SPDX-License-Identifier: MIT` header. Tests use temporary repos with `commit.gpgsign=false`; cover success, refused (target exists, dirty, unlanded worktree work, lock held), hook failure, lint failure, rebase retry.

Done when: `npm run typecheck` and `npx vitest run tests/move.test.ts tests/links.test.ts tests/lint.test.ts` pass.
