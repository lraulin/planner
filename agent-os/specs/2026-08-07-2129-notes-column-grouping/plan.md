# Notes column grouping

**Status: frozen / complete** (2026-08-07)
Spec folder: `agent-os/specs/2026-08-07-2129-notes-column-grouping/`

## Context

The first Notes grouping increment added Year, Month, and Day for a calendar outline. Notes
should also support Achieve's more general intent: grouping by a useful column value. This
is a delta from the frozen RedNotebook/calendar grouping spec, not an amendment to it.

## Decisions

| Topic                | Choice                                                              |
| -------------------- | ------------------------------------------------------------------- |
| Groupable columns    | Subject, Contexts, Flag, Date, Year, Month, Day, Linked to          |
| Deliberate omissions | Title and Preview; they tend toward one bucket per note             |
| Context semantics    | One bucket per exact normalized context set; never duplicate a note |
| Categorical ordering | Alphabetical, with empty buckets last                               |
| Calendar ordering    | Newest first, with undated buckets last                             |
| Stored hierarchy     | Unchanged; grouping uses Flat and Nested clears grouping            |
| Group identity       | Encode free-text keys so punctuation cannot collide in nested paths |

## Changes from original plan

| #   | Change | Why |
| --- | ------ | --- |
| —   | None   | —   |

## Acceptance criteria

- [x] Group by offers Subject, Contexts, Flag, Date, Year, Month, Day, and Linked to
- [x] Up to three different fields can form a counted, collapsible outline
- [x] Context order does not split the same context set into separate buckets
- [x] Empty values have explicit labels and sort last
- [x] Dates preserve the app's UTC-noon calendar-day invariant
- [x] Grouping remains display-only and mutually exclusive with the stored Notes tree
- [x] Unit, lint, typecheck, smoke, and browser checks pass

## Follow-ups (new work — not amendments once frozen)

- Consider one-bucket-per-context grouping only if Notes gains an explicit fan-out mode;
  duplicating a note under several headers would otherwise break counts and selection.
