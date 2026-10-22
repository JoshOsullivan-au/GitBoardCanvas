# Gitboard Canvas 0.1 tickets

Task graph for [spec.md](../spec.md). A ticket starts when every ticket it is blocked by has landed on `main`.

| Ticket | Title | Blocked by | Files it owns |
| --- | --- | --- | --- |
| [T1](T1-scaffold.md) | Scaffold and shared contract | none | `package.json`, `tsconfig*.json`, `src/types.ts`, `src/config.ts`, `src/git.ts` |
| [T2](T2-read-model.md) | Read model: board, relations, pipeline | T1 | `src/board.ts`, `src/relations.ts`, `src/pipeline.ts`, their tests |
| [T3](T3-move-engine.md) | Move engine, link rewrite, lint, hooks | T1 | `src/move.ts`, `src/links.ts`, `src/lint.ts`, `src/hooks.ts`, their tests |
| [T4](T4-board-page.md) | Board page, product agnostic | T1 | `src/ui/board.html`, `src/ui/icons.json` |
| [T5](T5-docs-templates.md) | Docs, templates, community files, own lifecycle folder | T1 | `README.md`, `docs/*.md` (not spec), `templates/`, `roadmap/`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`, `LICENSE` |
| [T6](T6-server-cli.md) | Server and CLI | T2, T3, T4, T5 | `src/server.ts`, `src/cli.ts`, `src/init.ts`, their tests |
| [T7](T7-review.md) | End-to-end check and code review fixes | T6 | any |

Frontier after T1: T2, T3, T4, T5 run in parallel; each owns disjoint files.
