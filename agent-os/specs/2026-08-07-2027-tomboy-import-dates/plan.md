# Tomboy import creation dates

**Status: frozen / complete** (2026-08-07)

Spec folder: `agent-os/specs/2026-08-07-2027-tomboy-import-dates/`

Delta to: `agent-os/specs/2026-08-07-1946-tomboy-note-import/`

## Context

The first importer retained Tomboy's creation and change instants in `createdAt` and
`updatedAt`, but left Planner's visible Note Date empty. Feedback after importing the real
archive showed that this technically precise mapping made the source chronology invisible
in the Notes grid.

## Decisions (as built)

| Topic            | Choice                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Visible date     | Map the calendar-day prefix of Tomboy `create-date` to `noteDate`                                 |
| Date encoding    | Store the day with `fromDateKey` (UTC noon), independently of machine timezone                    |
| Instants         | Continue preserving the complete Tomboy timestamps in `createdAt` / `updatedAt`                   |
| Existing imports | Re-selecting the folder fills a missing date when the source row is not older than a Planner edit |
| Local edits      | A newer Planner `updatedAt` still wins, including a deliberately cleared Date                     |

## Acceptance criteria

- [x] Newly imported notes show Tomboy's creation day in the Notes Date column
- [x] The full creation/change timestamps remain preserved as instants
- [x] Re-import backfills notes created by the first importer without creating duplicates
- [x] Re-import does not overwrite a newer Planner edit
- [x] Unit, database integration, lint, typecheck, smoke and build gates pass

## Changes from original plan

| #   | Change                     | Why                                                  |
| --- | -------------------------- | ---------------------------------------------------- |
| 1   | None during implementation | The feedback supplied the complete behavior decision |

## Follow-ups (new work — not amendments to this frozen spec)

- None.
