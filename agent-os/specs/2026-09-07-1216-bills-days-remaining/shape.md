# Drop register upcoming strip; add bills days remaining — Shaping Notes

**Status: frozen / complete** (2026-09-07)

## Scope

Remove the Register's "Upcoming (next 14 days)" occurrence strip. Add a Days remaining
column on `/finances/bills` so closeness is visible next to Next charge.

### Out of scope

- Changing Due soon's 14-day window or its filter.
- Counting from Due (contract date) rather than Next charge (posting date).
- Sharing Agenda's `daysLeftOf` / `daysLeftTitle`.
- `schedules.upcomingLength` settings leftover from Actual schedules.
- Dashboard (no upcoming strip there).
- Agent `includeUpcoming` / Insights upcoming (Insights already dropped it).
- Inventing a next date for unscheduled or cancelled bills.

## Decisions

- The strip is redundant because Bills exists, not because the information is useless.
  Closeness moves to a column on the bill row, not to another 14-day list.
- Next charge is the date the user pasted from the strip. Due is a hideable contract
  date from `2026-09-05-1401`; a second countdown off that date would split the glance.
- An integer matches Agenda's Days left column. Prose belongs on hover so the grid
  stays scannable and sortable.
- Negative days are allowed. Next charge in the past is already a fact the Still
  active? review handles; hiding it here would make overdue bills look undated.
- Retire the loader, not only the chrome. A strip that is gone but still queried on
  every Register load and refresh is still clutter in the wrong layer.

## Context

- **Visuals:** None. Designed from the live Register strip (Dante's Meds through Sky
  Tonight) and the Bills grid default columns.
- **References:** See `references.md`.
- **Product alignment:** Envelope workflow put bill management on `/finances/bills` and
  left Register as categorization. This delta finishes that split for the glance list
  that was never moved.

## Standards Applied

See `standards.md`.
