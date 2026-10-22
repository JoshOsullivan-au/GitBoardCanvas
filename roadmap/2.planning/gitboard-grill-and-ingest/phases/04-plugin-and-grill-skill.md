# Phase 04: plugin skeleton and `gitboard-grill`

## Overview

Add a Claude Code plugin to the repo and write the GitBoard Grill skill: it runs `gitboard scan`, then interviews the person in rounds until every candidate is on or off the board, and writes the approved manifest.

## Directive

Create `.claude-plugin/marketplace.json` and `plugin/` per the plan's Plugin layout. Write `plugin/skills/gitboard-grill/SKILL.md` and its references with the skill-creator loop.

## Objective/Goal

A person with a fragmented repo types "get my plans onto the board" (or `/gitboard-grill`) and ends with `.gitboard/ingest/manifest.json` approved, plus a decision log they can read.

## Limitations/Restrictions

- The skill never moves, copies or commits a document. It writes only under `.gitboard/ingest/`.
- `grill-with-docs` and `ask-matt` are user-invoked only; the skill may suggest them, not call them.

## Guardrails

- Rounds follow the `grilling` pattern: the frontier only, numbered questions, a recommended answer on each, facts found by the agent (never asked of the person).
- Round 1 is per source family ("`.rpe/`: 14 docs, mostly research. Include as references to features, include as features, or leave off?"). Later rounds are per candidate: include, stage, slug and title, group, merge or split, depends on.
- At most 10 questions a round. Every round offers "accept all recommendations" for the rest.
- Evidence is quoted in one line per recommendation, from scan's `evidence[]`.
- Worktrees owned by other sessions are described, never touched.

## Done when

- `SKILL.md` is under 500 lines, with a description that names the trigger phrases (scattered plans, messy roadmap, onboard an existing repo, "what should go on the board").
- References: `question-bank.md` (round templates), `stage-evidence.md` (the stage table and how to explain it), both with OKF front matter.
- Three test prompts run with the skill-creator loop on fixture repos: a small repo with root plan files, a repo with dot and agent folders, a repo with two live worktrees. Josh reviews the transcripts.
- The manifest it writes validates against phase 03's schema (or the draft schema if 03 has not landed).

## Orchestration

Builder drafts with `skill-creator`; executor and grader sub-agents run the evals; Josh reviews outputs; builder revises.

## Depends on

01

## Steps

1. Plugin skeleton and marketplace file per `plugin-dev:plugin-structure`. Done when `/plugin marketplace add` on a local path lists the plugin.
2. Draft `SKILL.md` and references. Done when the draft passes a read-through against the guardrails.
3. Evals in `plugin/skills/gitboard-grill/evals/evals.json`, three prompts with assertions. Done when the first run is graded.
4. Revise until Josh accepts the transcripts.

## UI

none

## Files/references

- `skill-creator`, `plugin-dev:plugin-structure`, `grilling` skills
- `roadmap/README.md` (stage gates), `docs/concepts.md`

## Review

Josh reviews the three transcripts. The builder does not close the phase.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

Eval grading output for the three prompts, and the manifest validation result.
