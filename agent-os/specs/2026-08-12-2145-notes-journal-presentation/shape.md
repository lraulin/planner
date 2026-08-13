# Notes journal presentation — Shaping Notes

**Status: frozen / complete** (2026-08-12)

## Scope

A second **presentation** of the Notes module: a diary layout (The Journal) over the
existing Journal and Rednotebook notes. Calendar + real date tree + write pane. Typing
in an empty day creates one Journal note; an empty box creates nothing.

### Out of scope

- App-wide terminology or chrome for subdivisions inside a module
- The Journal’s categories (Notebook, Templates), doodles, attachments, RTF
- Auto-creating a blank entry every day
- Multiple Journal entries per day
- Replacing or reviving the Day module (the Day **surface** is shelved; the Journal row is not)
- Faking the date tree with DataGrid grouping
- Year/month folder notes in storage
- A new table, subject, or agent tool
- Month / year calendar views

## Decisions

- **Same rows as Day’s Daily Notes.** `subject = "Journal"`, one per calendar day,
  `saveJournal` / `loadJournal`. Type in one surface, see it in the other.
- **Rednotebook archive is browsable here** but calendar-click always focuses the Journal
  slot. Tree-click opens that specific note; Rednotebook edits go through `updateNote`.
- **Real tree, not grouping.** Lee was explicit: Year → Month → entry leaves, no root
  above year, no category roots. The four-in-one screenshot is theme variants of one
  layout, not different category trees.
- **Create-on-type.** `saveJournal` must not insert whitespace. Empty existing rows may
  update in place; the tree and calendar treat them as absent.
- **Presentation, not a View and not a module.** Grid | Journal, like Schedule
  Calendar | Agenda. Default remains Grid. Stored on the Notes settings scope.
- **Terminology for this spec only:** module = Notes; view = saved filters; presentation =
  Grid vs Journal. A later spec can name intra-module layouts app-wide.

## Context

- **Visuals:** `visuals/the-journal-reference.png` — The Journal 8, four theme variants
  of calendar + date tree + write pane. No category tree above the year.
- **References:** Day journal-as-note, RedNotebook import (deferred calendar tree view),
  Notes list-first performance, Schedule presentation switch. See `references.md`.
- **Product alignment:** Not a named roadmap item. It is the RedNotebook follow-up
  (calendar tree without folder notes) plus a Notes presentation. Phase 2 polish, not a
  new module. Day remains shelved as a surface.

## Standards Applied

- development/dates — `noteDate` is a calendar day (UTC noon)
- development/testing — tree math in lib; mutations/queries get cross-user cases
- development/clean-code — logic in `src/lib/notes`, thin actions
- development/security — every query/mutation takes `userId`
- components/ux-principles — autosave, no extra modal, keyboard + tap paths
- components/navigation — View menu commands, not palette-only
- components/responsive — compact is list → editor sheet
