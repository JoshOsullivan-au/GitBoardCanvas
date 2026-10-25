---
title: "Architecture states: Live plus overlay, diffed per base"
author: Josh
date: 2026-10-24
branch: claude/architecture-states-plans
cost: { minutes: 20, tokens: 331614 }
touches:
  - roadmap/2.planning/architecture-states.md
  - roadmap/2.planning/architecture-states/README.md
---

## Decided
- Architecture states other than Live are Live plus an overlay, never a static map: a static import-closure scan finds 98.9% of Tempo calls but at 12% precision.
- Diff each state against its own base (Live commit, merge-base, HEAD, index). Raw branch trees against main show branch age.
- Split shared files (in over 10% of page closures) into one Shared line; otherwise any core change marks about 95% of pages.

## Tried and ruled out
- Generic .rpc/.from patterns alone (16% recall); hosts wrap their client, so scan rules come from config.
- Preview-trace timings for pull requests: the host's previews export no traces.

## Watch out
- Traces carry a deployment id, not a commit. The Live commit comes from GitHub Deployments through gh.
- The research behind this used a private host app; its notes and scripts stay outside this repository.
