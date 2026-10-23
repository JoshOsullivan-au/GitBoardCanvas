# ADR 0001: Architecture tab in the board, fed by an offline measure

**Status:** Accepted
**Date:** 23/10/2026
**Deciders:** Josh O'Sullivan

## Context

A team using GitBoard Canvas wanted to see, for every page its Next.js app serves in production, how long the server takes against a budget, which database, cache and provider calls the page makes, and which of those calls wait on each other. The figures exist in Grafana Tempo traces. The first version ran as a separate local server inside the host app, with its own copy of the board's styles and link routing, and the look was approved in that form.

Forces:

- GitBoard Canvas promises one runtime dependency (`marked`) and no network calls from the board except `gh` (spec R3, SECURITY.md).
- The board already has the parts the map needs: glass columns, groups, cards, a details dialog and link routing that never crosses a card.
- The set of live pages is the host app's rule, not GitBoard's.

## Decision

1. The map is a second tab in the board, beside the Roadmap, shown only when `gitboard.config.json` has an `architecture` block. Roadmap stays first and the default.
2. Data comes from `gitboard measure --from <iso> [--to <iso>]`, which the person runs. It reads Tempo through the `gcx` CLI and writes one JSON file (`architecture.data`). The board serves that file at `GET /api/architecture` and never queries Tempo itself.
3. The host app keeps its own live-route rule through `architecture.routesCommand`, a command that filters the page routes on stdin.
4. The board's link router is one function, `drawRoutes`, used by both tabs.

## Options considered

| Option | Complexity | Fit with GitBoard's rules | Verdict |
| --- | --- | --- | --- |
| A. Tab in the board, offline measure (chosen) | Medium | Keeps R3 and the loopback-only server; reuses the board's parts | Chosen |
| B. Keep a separate server in the host app | Low now, rising | Outside GitBoard; a second copy of styles and routing that drifts | Turned down |
| C. A Grafana dashboard | Low | No tie to the app's live-route rule, no per-page read path split into shell and page calls | Turned down |
| D. The board queries Tempo live | Medium | Breaks R3 (a network call on every load), slow on a 1000-trace window, needs Grafana credentials in the server | Turned down |

## Consequences

Easier:

- One look and one router for both tabs; a fix to link routing reaches both.
- A measure is a file: it can be committed, shared and compared across deploys, and the board stays offline.
- Tests run without Grafana: `measure` is exercised end to end against a fake `gcx` on `PATH`.

Harder:

- Figures are only as fresh as the last `gitboard measure`; the tab shows the window it was measured over.
- `gcx` must be installed and signed in on the machine that measures.
- The data file is a contract between `measure` and the page with no version field. The server checks its shape (`routes` and `areas` arrays) and answers 500 with "run gitboard measure again" when it does not match.

Risks:

- The measure is shaped by one stack: Next.js app router routes, OpenTelemetry server spans, Supabase endpoints named by API, and the database column labelled Supabase whenever a database call is seen. Another stack needs work in `src/architecture/readPath.ts` and `measure.ts`.
- Tempo search returns at most 1000 traces, and metrics windows are capped at 25 hours, so a busy app needs a short window.

## Action items

1. [ ] Add a `format` field to the measure file before its shape next changes, and read old files or say plainly that they need a new measure.
2. [ ] Name the database column from the endpoints seen, not a fixed label, when a second database is supported.
3. [ ] Host app: retire its separate map server once it runs a GitBoard build with this tab.
