# Phase 01: docs and templates

## Overview

Write the README, the concept and configuration docs and the templates that `gitboard init` copies. GitBoard Canvas's own roadmap folder is part of this phase.

## Directive

Write plain, product-neutral documents. Every doc follows the spec.

## Objective/Goal

A new user can read the README, run `npx gitboard-canvas init` and understand what they got.

## Limitations/Restrictions

No source code changes. No product names from any other project.

## Guardrails

Australian English, dates as DD/MM/YYYY, no marketing language.

## Done when

- Every file in the ticket exists.
- Links between documents resolve.
- A search for other products' names over these files is empty.

## Orchestration

One builder writes the files, then a separate reviewer reads them against the spec.

## Depends on

none

## Steps

1. Write the templates.
2. Write the docs.
3. Write the community files.
4. Fill in GitBoard Canvas's own roadmap.

## UI

none

## Files/references

`README.md`, `docs/concepts.md`, `docs/configuration.md`, `templates/`, `roadmap/`.

## Review

A reviewer checks every document against `docs/spec.md`.

## Loop

A failed review returns to Steps. Three failures on one point go to a person.

## Execution

Landed 22/10/2026 on branch `ticket/t5`.

## Verify

Link check and the product-name search, both clean.
