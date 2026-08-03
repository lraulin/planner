# RedNotebook import (flat notes)

**Status: active**  
Spec folder: `agent-os/specs/2026-08-03-1518-rednotebook-journal-import/`

## Context

Import RedNotebook `YYYY-MM.txt` month files as ordinary Notes rows — **flat**, subject
**Rednotebook**, titled and dated by calendar day. Day-view journals stay separate
(`subject = "Journal"`, also flat).

## Decisions (current)

| Topic        | Choice                                                  |
| ------------ | ------------------------------------------------------- |
| Shape        | **Flat** root notes — no Journal/year/month folder tree |
| Subject      | `Rednotebook` (not Day journal)                         |
| Title / date | `title = YYYY-MM-DD`, `noteDate` = that day             |
| Input        | Multi-file `YYYY-MM.txt`                                |
| Re-import    | Skip exact body; append if different and not contained  |
| Markup       | Light RN → markdown                                     |
| Day journals | Unchanged flat `subject=Journal` notes                  |

## Changes from original plan

| #   | Change                                                       | Why                                                                |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1   | Dropped year → month → day note tree for journals and import | Empty year/month folder notes clutter Nested Notes                 |
| 2   | Import subject `Rednotebook`, not `Journal`                  | Separate diary archive from Day-view journals; filterable on Notes |
| 3   | Deferred calendar tree _view_ over notes                     | Optional later UX; not storage hierarchy                           |

## Acceptance criteria

- [x] Multi-file RedNotebook import in Settings
- [x] Flat notes, subject Rednotebook, noteDate set
- [x] Exact re-import skips; light markup + hashtags → contexts
- [x] Day journals remain flat Journal notes (no path scaffolding)
- [x] Cross-user isolation
- [ ] Optional later: Notes tree _view_ grouped by year/month/day (no empty folders)

## Follow-ups

- Calendar / Y-M-D tree **view** over dated notes (display only)
- Zip upload, export, richer markup
