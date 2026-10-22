# T2 Read model: board, relations, pipeline

Spec: sections 1.2 to 1.6, R14, R16. Port from the source build (read-only reference: the private project Gitboard Canvas was extracted from):

- `<original build>/scripts/roadmap-board/board.ts` → `src/board.ts`
- `<original build>/scripts/roadmap-board/relations.ts` → `src/relations.ts`
- `<original build>/scripts/roadmap-board/pipeline.ts` → `src/pipeline.ts`
- `<original build>/tests/roadmap/{board,relations,pipeline}.test.ts` → `tests/`

Changes from the source:

- Export `loadBoard(root: string, config: GitBoardConfig, opts?: { pipeline?: Pipeline | null }): Board` returning the `Board` type in `src/types.ts` (stages, groups, roadmapDir, mainBranch included).
- Stages, roadmap folder and main branch come from `config` (`stagesOf`, `groupFor` in `src/config.ts`). No hard-coded `product-roadmap`, `main`, stage folders or suite rules. `suite` becomes `group`; read frontmatter `group:`.
- `codeMentions`: build the code-path regex from `config.codeRoots`; for `"auto"` use the repo's tracked top-level folders (`git ls-tree -d --name-only HEAD`) minus the lifecycle folder and dot folders.
- `readPipeline(root, config, opts)` skips `gitboard-move/` branches and uses `config.mainBranch`; `gh` only when `config.github`.
- Imports use `.js` extensions (NodeNext). Start each source file with `// SPDX-License-Identifier: MIT`.
- Tests use temporary repos with `commit.gpgsign=false` where they need git; no fixture names from the source product.

Done when: `npm run typecheck` and `npx vitest run tests/board.test.ts tests/relations.test.ts tests/pipeline.test.ts` pass.
