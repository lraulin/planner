# Drop register upcoming strip; add bills days remaining

**Status: frozen / complete** (2026-09-07)  
Spec folder: `agent-os/specs/2026-09-07-1216-bills-days-remaining/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/` — Bills is the bill list; default columns, Due soon, and Active/All presets stay.
- **Extends:** `agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/` — Next charge is the posting date; Due stays the optional contract date. Days remaining counts from Next charge.
- **Supersedes:** `agent-os/specs/2026-08-22-2124-actual-schedules/` — **only Task 8**, Upcoming in the Register. Preview rows above the ledger go away.
- **Does not supersede:** agent `includeUpcoming` / `analytics.upcomingBills`. Insights already dropped upcoming (`2026-09-05-1200`).

## Context

`/finances/bills` is back. The Register still prints an "Upcoming (next 14 days)" strip of the same occurrences (name, date, amount). That strip was the glance surface when bills lived elsewhere (`2026-08-22-2124` Task 8, after `2026-08-14-1012`'s Upcoming panel). On the Register it is now clutter: the job of that page is categorizing transactions.

Closeness still needs a home. Bills already has Next charge and a Due soon (14-day) preset, but a calendar date does not say "how soon" as fast as a day count.

## Decisions

- **D1 — Remove the Register strip**, not hide it. Chrome, `initialUpcoming`, the client refresh via `upcomingBillsAction`, `loadUpcomingBills`, and `UPCOMING_HORIZON_DAYS` all go. `loadRecurringBills` stays on the Register for `claimedPayeesOf`.
- **D2 — Days remaining counts from Next charge**, the posting date the strip listed. Not from Due (contract date). Unscheduled, cancelled, or `nextDueKey` null render "—" — same honesty as `2026-08-14-1104-unscheduled-bills`.
- **D3 — Integer cell, Agenda-style.** `0` today, `1` tomorrow, negative if the next charge already passed. Hover: "Today" / "Tomorrow" / "In 3 days" / "2 days ago". The cell itself is the number, right-aligned tabular.
- **D4 — Default visible after Next charge.** Compact (phone) shows it as meta. Default sort stays Next charge, then name — days remaining is a monotone of that date for scheduled bills. `withNewColumns` inserts a column a saved layout never saw.
- **D5 — `billDaysRemaining` lives next to `billDueSoon`**, in `src/lib/finances/budget/dueCue.ts`, via `daysBetweenKeys`. Do **not** lift Agenda's `daysLeftOf` / `daysLeftTitle` (`2026-08-13-2006-life-history`). Hover copy may sit in the column file.
- **D6 — Delete `upcomingBillOccurrences` if nothing else calls it.** `billOccurrences` and `projectForwardMonths` stay. Agent upcoming is a different function (`analytics.upcomingBills`).
- **D7 — Out of scope.** `schedules.upcomingLength` (never wired to this strip). Dashboard (no strip there). Insights upcoming (already gone). Changing Due soon's 14-day window.

Use `data.todayKey` already on BillsView (same clock as Due soon). Do not add `useToday`.

## Acceptance criteria

- [x] Register has no Upcoming strip. Categorizing a transaction no longer refreshes one.
- [x] Bills shows Days remaining after Next charge on Active, Due soon, and All. Phone compact list includes it.
- [x] A bill whose next charge is today reads `0`; six days out reads `6`; a charge already past is negative; unscheduled / cancelled read "—".
- [x] Unit tests cover `billDaysRemaining`. Lint, typecheck, `test:unit`. Touching `src/app/**` → start the app and `npm run smoke`.
- [x] Browser: Register (strip gone, grid unchanged) and Bills (column, sort, Due soon, compact).

## As built

- `billDaysRemaining` in `src/lib/finances/budget/dueCue.ts`; tests in `dueCue.test.ts`.
- Column `daysRemaining` in `billColumns.tsx`. Default order in `BillsView.defaultsFor` inserts it after Next charge. `withNewColumns` shows it on saved layouts.
- Integer is computed onto the grid row from `data.todayKey` so sort/filter can read it (`ColumnDef.sortValue` has no ctx). Hover titles live in the column file.
- Register strip, `upcomingBillsAction`, `loadUpcomingBills`, `UPCOMING_HORIZON_DAYS`, and `upcomingBillOccurrences` are gone. `billOccurrences` / `projectForwardMonths` stay. `loadRecurringBills` still feeds `claimedPayeesOf`.

Live file on 2026-09-07: Rent next charge 9/24 → 17, SMECO 9/30 → 23, Geico 12/26 → 110, Taylor Gas unscheduled → —, 1Password with no next date → —. Due soon is empty because the nearest posting is 17 days out (the 14-day window is unchanged, D7).

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                                             | Why                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | Days remaining is closed over onto the grid row from `data.todayKey`, not read from `BillColumnCtx` in the column. | Sort and filter do not receive column context. The plan already allowed closing over the clock. |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-09-07-1216-bills-days-remaining/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes (scope, decisions, context)
- **standards.md** — which standards apply, why, and any deviations (references, not copies)
- **references.md** — governing specs and reference implementations
- **visuals/** — none

## Task 2: Days remaining on Bills

- Add `billDaysRemaining(row, todayKey): number | null` in `src/lib/finances/budget/dueCue.ts`. Null for unscheduled / cancelled / missing `nextDueKey`; otherwise `daysBetweenKeys(todayKey, nextDueKey)`.
- Tests in `dueCue.test.ts`: today → 0, tomorrow → 1, yesterday → −1, unscheduled / cancelled / null → null.
- New column `daysRemaining` ("Days remaining") in `billColumns.tsx`: compact meta, right-aligned tabular, sort/filter on the integer. Hover titles as D3.
- Default order in `BillsView.defaultsFor`: `["name", "budgetGroup", "next", "daysRemaining", "amount", "cadence", "status"]`.
- Column context already has no today; pass `data.todayKey` through `BillColumnCtx` (or close over it). Same clock as Due soon.

## Task 3: Retire the Register strip

- `FinancesView.tsx`: drop the strip, `upcoming` state, `upcomingBillsAction` refresh, `initialUpcoming` prop.
- `register/page.tsx`: stop calling `loadUpcomingBills`. Keep `loadRecurringBills`.
- Delete `upcomingBillsAction`, `loadUpcomingBills`, `UPCOMING_HORIZON_DAYS`.
- Delete `upcomingBillOccurrences` and its tests if no remaining callers.

## Task 4: Verify, freeze spec, update roadmap

- Confirm acceptance criteria in the browser (desktop and compact).
- `npm run lint`, `typecheck`, `test:unit`. After `src/app/**` changes, start the app and `npm run smoke`.
- Update plan/shape for any material as-built drift; complete **Changes from original plan**.
- Mark files **Status: frozen / complete** (date). Follow-ups as new work.
- Update `agent-os/product/roadmap.md` if it still lists Register upcoming preview rows (`2026-08-22-2124` area).

## Follow-ups (new work — not amendments to this frozen spec)

None. Future closeness work is a new delta-spec.
