# Assign under Target — Shaping Notes

**Status: frozen / complete** (2026-09-07)

## Scope

Put YNAB's Target-pane Assign callout into our budget inspector Target section: this
month's remaining ask, one Assign click from Ready to Assign, plus Needed / Funded /
To Go from the existing target horizon. Keep Edit target and the snooze we already
have.

### Out of scope

- New target types, cadences, bases, or demand formulas
- A new assign mutation or a second Underfunded planner
- Inventing snooze (already shipped)
- Auto-Assign, Cover, Move Money, cash-vs-credit
- Ready to Assign as a transaction category
- Committing the YNAB screenshot
- Schema / migrations

## Decisions

- **Delta, not a reopen.** Inspector D7 already named a one-envelope Underfunded
  action; it lives below Files here today. Move it under Target and add progress
  details. Frozen specs stay frozen.
- **One ask.** Callout cents = `moreNeededCents` = Assign → Underfunded for this
  row. Needed / Funded / To Go follow D3 (bar horizon; `add` funds from assigned
  this month because leftovers do not count toward a contribution).
- **Installment vs pile.** The callout is this month; Needed can be the full
  target (`monthly-target-installment-copy` D2). We do not have YNAB's "every 6
  months" cadence; `year` / `by` / bill schedule already express that family.
- **Our sentences, not YNAB's "Refill Up to".** `summarize()` stays.
- **No day invented on a month-key deadline.** `by` is `YYYY-MM`.
- **RTA is the source.** Shortfall still previews. Button stays enabled at $0 RTA.
- **Snooze stays the existing button**, including `snoozeUnavailableReason`.
- **Do not ask.** The request named the screenshot, the assign source, "match our
  Target model", and "do not invent snooze".

## Context

- **Visuals:** `.artifacts/ynab-assign-under-target.png` — YNAB web, September
  2026, GEICO selected, Target pane with 0% ring, yellow "Assign $175.01 this
  month to stay on track", gold Assign, Needed/Funded/To Go, Edit Target, snooze
  switch. **Do not commit.** Layout notes in `visuals/approved-wireframe.md`.
- **References:** See `references.md`. The load-bearing existing path is
  `BudgetInspector` → `onAssignUnderfunded` → `planAssign({ option: "underfunded",
categoryIds: [row.id] })` → `startAssign`.
- **Product alignment:** Finances envelope workflow already shipped the YNAB
  target engine and inspector. This is chrome on that pane, not a roadmap Next
  item.

## Standards Applied

See `standards.md`.
