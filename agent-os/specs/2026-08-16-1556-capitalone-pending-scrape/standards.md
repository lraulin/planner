# Standards for Capital One pending scrape

**Status: frozen / complete** (2026-08-25)

Full text lives in `agent-os/standards/`. What this work is bound by:

## development/testing

Pure parser beside the module. Mutations and the sync cleanup get `*.integration.test.ts` with a second user. No React component tests.

## development/security

Every write takes `userId` and scopes on it. The userscript never holds a Planner token. The paste uses the existing session.

## development/dates

Purchased dates are parsed from weekday + month + day + year parts into `YYYY-MM-DD`. Never `new Date("Sun, Aug 16, 2026")`. Scrape day and fallback today are parameters, not the server's `TZ`.

## development/clean-code

Logic in `src/lib/finances/`. The userscript extracts DOM text into the TSV the parser already accepts. `src/lib` does not import `src/app`.

## development/commits

One logical change per commit if they split naturally; otherwise one ship. `Spec: agent-os/specs/2026-08-16-1556-capitalone-pending-scrape`.
