# RedNotebook import + journal year/month/day hierarchy

**Status: active**  
Spec folder: `agent-os/specs/2026-08-03-1518-rednotebook-journal-import/`

## Context

See `shape.md`. Day journals become a tree under **Journal → Year → Month**; RedNotebook
month files import as those same journal days.

## Decisions (summary)

| Topic     | Choice                                                        |
| --------- | ------------------------------------------------------------- |
| Tree      | Root `Journal`, then year, month, day note                    |
| Day note  | `subject=Journal`, `title=YYYY-MM-DD`, `noteDate` = day       |
| Folders   | Empty subject, no date; titles `Journal` / `YYYY` / `YYYY-MM` |
| Input     | Multi-file `YYYY-MM.txt`                                      |
| Re-import | Skip exact body; append if different and not contained        |
| Markup    | Light RN → markdown                                           |
| Schema    | No migration                                                  |

## Acceptance criteria

- [ ] Day journal create/update homes under `Journal / YYYY / YYYY-MM /`.
- [ ] Legacy flat Journal notes reparent on next save or import rehome.
- [ ] Settings multi-file RedNotebook import works.
- [ ] Imported text shows in `/day` Journal pane for that date.
- [ ] Nested Notes shows the tree; subject filter Journal still works on day rows only.
- [ ] Exact re-import skips without duplicating bodies.
- [ ] Light markup conversion + hashtags → contexts.
- [ ] Bad filenames/files warn; batch continues.
- [ ] Cross-user isolation on import writes.
- [ ] typecheck, lint, tests green.

## Changes from original plan

| #   | Change       | Why |
| --- | ------------ | --- |
|     | _(none yet)_ |     |

## Tasks

1. Spec docs (this folder)
2. `src/lib/day/journalPath.ts` + wire `saveJournal`
3. `src/lib/rednotebook/*` parse, markup, map, import + tests
4. `POST /api/rednotebook/import` + Settings panel
5. Verify + commit

## Follow-ups

Zip upload, export, one-click rehome-all button, richer markup.
