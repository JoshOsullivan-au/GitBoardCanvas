# Phase 05: `gitboard-ingest` skill

## Overview

The GitBoard Ingest skill takes the approved manifest from GitBoard Grill, shows the dry run, gets a yes, runs `gitboard ingest`, then checks the board.

## Directive

Write `plugin/skills/gitboard-ingest/SKILL.md` and `references/manifest-schema.md` with the skill-creator loop.

## Objective/Goal

After a grill, "ingest it" puts the accepted features on the board in one commit and reports what moved, what was copied and what was left alone.

## Limitations/Restrictions

- No manifest, or an unapproved one: the skill sends the person to GitBoard Grill instead of guessing.
- The skill does not edit the manifest's decisions. A change of mind goes back through the grill.

## Guardrails

- Always `--dry-run` first and show the plan grouped by stage; run the real ingest only on an explicit yes.
- After the commit: `gitboard lint` (report only), `gitboard list`, and open the board when a server is running.
- Report copied sources so the person can delete originals themselves; the skill never deletes.

## Done when

- `SKILL.md` under 300 lines, description names the trigger phrases (ingest, file these, put them on the board, after the grill).
- Three evals: approved manifest, unapproved manifest, manifest with a slug clash. Josh reviews the transcripts.

## Orchestration

Builder drafts with `skill-creator`; executor and grader sub-agents run evals; Josh reviews.

## Depends on

03, 04

## Steps

1. Draft `SKILL.md` and `manifest-schema.md` (OKF front matter). Done when the draft passes a read-through.
2. Evals and grading. Done when all three are graded.
3. Revise until Josh accepts.

## UI

none

## Files/references

- `src/ingest.ts` (phase 03), `plugin/skills/gitboard-grill/` (phase 04)

## Review

Josh reviews the transcripts.

## Loop

A failed Verify or Review returns to Orchestration. After three failures on the same criterion, hand it to a person.

## Execution

Log of what was done, with file and commit references.

## Verify

Eval grading output for the three prompts.
