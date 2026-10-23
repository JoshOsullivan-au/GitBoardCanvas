# ADR 0002: The Architecture tab's stack comes from config

**Status:** Accepted
**Date:** 24/10/2026
**Deciders:** Josh O'Sullivan
**Amends:** [ADR 0001](0001-architecture-tab.md), its risk on one stack and its action items 1 and 2

## Context

ADR 0001 moved the Architecture tab into the board from one host app and named its main risk: the measure was shaped by that app's stack. The code knew one database vendor's API paths and split its calls by API, counted every other database as a provider, spotted cache calls by one client's span names, read one host platform's cache header and deployment attribute first, folded one ad platform's account ids, labelled the database column with a fixed vendor name, and read pages only from a Next.js app router folder.

Forces:

- Spec Q4: no product-specific names in code or docs.
- The host app the tab came from must keep the same map once its config describes its stack, and its committed measure files must still draw.
- The tab's columns (request, pages, database, cache and providers) suit any server that calls a database, a cache and other services.
- The board still needs no network call and one runtime dependency (spec R3).

## Decision

1. Each call is named by the first rule in `architecture.calls` that it matches on host (exact or `*.` subdomain), path prefix and span name prefix. A rule gives the call's target id, its kind (database, cache or provider), an endpoint template, and the group, label and icon the tab draws. A call with a URL that no rule matches is a provider named `{host} {path}`.
2. UUIDs and long numeric path segments fold to `{id}` in code; any other path rewrite is an `architecture.pathFolds` entry.
3. `architecture.platform` names the server's host and the database column, and lists the deployment attributes and the cache headers to read, first present wins. The defaults read OpenTelemetry attributes and standard cache headers.
4. `architecture.pagesCommand` lists the pages for an app that is not on the Next.js app router. The app router reader stays the default.
5. The data file gains `format: 2` and `targets`, which describe each target for the tab. The server adds `targets` from the current rules to a file without them, so a format 1 file draws as before once the rules match the old behaviour.
6. The old behaviour ships as an example preset in `docs/presets/`, shown in `docs/configuration.md`. Tests read the preset file, check the docs show the same rules, and check it gives the endpoints the old code gave, apart from the folds listed below.

## Options considered

| Option | Complexity | Fit | Verdict |
| --- | --- | --- | --- |
| A. Ordered match rules in config, preset in docs (chosen) | Medium | Any stack; Q4 holds in code; the old map is one copied block away | Chosen |
| B. Named presets built into the code, picked by `"preset": "<name>"` | Low for users | Vendor names in code (breaks Q4); every new stack needs a release | Turned down |
| C. A classifier module or command the repo supplies | High | Most power, but runs repo code per span and makes tests and docs harder | Turned down; rules cover the known stacks |
| D. Classify by OpenTelemetry semantic attributes only (`db.system`, `server.address`) | Low | Neutral, but HTTP-based database APIs carry no `db.system`, so they would stay providers | Turned down as the only means; open below |

## Consequences

Easier:

- A repo on any database, cache or host gets the right columns by writing rules, with no change to GitBoard.
- Endpoint names and the database column's name are the repo's own words.
- A measure file says how to draw itself, so a shared file draws the same on another machine.

Harder:

- A repo that relied on the built-in rules must add the preset before its next measure; without it every call with a URL lands in Providers and cache spans drop out.
- The preset is not a byte-for-byte copy of the old code. Folds now run on database paths as well as provider paths, and a fold replaces every match, so a long number or a second version segment inside a database path now reads `{id}` or drops out. `platform.server` names the host on every trace, where the old code named it only when the platform's deployment attribute was present. An access-check endpoint shows once, in Access checks, where a table or auth endpoint on the access list used to show twice. A measure of the host app's real traces gave the same file as before, and its board drew the same.
- Rules are ordered: a broad path prefix placed before a narrow one hides it.

Risks:

- A format 1 file drawn with rules that differ from those it was measured with shows targets the rules do not describe as providers. Measuring again fixes it.

## Action items

1. [ ] Match rules on span attributes (such as `db.system`), so database clients that make no HTTP call need no span name prefix.
2. [ ] Host app: add the preset to its `architecture` block.
