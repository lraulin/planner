# Overassigned Available (scan layer + Fix This)

**Status: active**  
Spec folder: `agent-os/specs/2026-08-29-2129-overassigned-available/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` — D3 still binds: one `envelopeIndicator`, ask is `neededAssigned`. This adds a state to D4.
- **Supersedes:** that spec's **D4 Funded / On Track rows only when `assigned > neededAssigned`**. Exact-ask Funded and On Track (at the installment, pile remaining) stay.
- **Extends:** `agent-os/specs/2026-08-28-2223-target-snooze/` — snooze still sits immediately after overspent. Overassigned is after underfunded / fully-spent.
- **Extends:** `agent-os/specs/2026-08-29-2033-budget-fix-this/` D3 — the Un-assign list shows Available with the same pill/icon as the Budget tables. Picker month is the source month for the indicator, not the viewed month.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — `neededAssigned` remains the ask. No Assign-tab change.
- Does **not** change envelope math, default Fix This amount (`min(Available, hole)`), sort order of the Un-assign list, inspector, or schema.

## Context

Fix This currently prints a plain Available number. The Budget tables already have the scan layer (bar, name copy, colored Available pill + icon), but Funded and On Track are the same green check/pie whether you assigned exactly the ask or well above it. Raiding an on-target bill unfunds it; raiding extra above the ask does not. That difference is invisible today.

Assigned stays a plain number (funding-indicators D7). The chrome lives on Available.

## Decisions

**D1 — One new indicator state, used in both places.** `overassigned` in `envelopeIndicator`. The Budget Available pill and Fix This list read the same function. No second Fix This heuristic.

**D2 — Overassigned means assigned above this month's ask.** `asked && assignedCents > neededAssigned && available > 0`. Extra = `assigned − needed`. A $140 bill with $140 assigned is **Funded** (or On Track if sinking-at-installment), even if Available is still $140 because the charge has not posted. No-target leftover stays **safe** (green check, no copy).

**D3 — Sinking extra is overassigned, not On Track.** On Track is exactly at this month's installment with pile remaining. Assigned above the installment is raidable without missing this month.

**D4 — Priority.** Insert after fully-spent, before On Track:

overspent → snoozed → underfunded → fully-spent → **overassigned** → on-track → funded → safe → idle

Fully-spent still wins when Available is $0 (you overassigned and spent it).

**D5 — Look.** Same green pill as Funded (`--chart-income`). New icon `extra` (distinct from check / pie / clock / snooze). Name-column copy: `$X extra` (X = assigned − needed), parallel to `$X more needed this month`. Bar: full green, same spent overlay as Funded.

**D6 — Fix This reuses the pill, display-only.** Right-hand amount is Available pill chrome without the cover/move menu. Row click still selects. Indicators are computed for the **picker** month. Do not sort overassigned to the top. Do not change default unassign amount.

**D7 — Split presentational pill from the menu button.** `AvailablePill` today is a `<button>` that opens cover/move. Extract a non-button visual (icon + tabular amount + pill classes) and use it from both the grid button and the Fix This row.

## Acceptance criteria

- [ ] Assigned > this month's ask, Available > 0 → state `overassigned`, green pill, `extra` icon, copy `$X extra`. Grid name column and Available pill agree.
- [ ] Assigned equal to the ask → still Funded or On Track, not overassigned, even if Available > 0 (unspent).
- [ ] Sinking: assigned > installment and pile not full → overassigned, not On Track. Assigned == installment, pile remaining → On Track.
- [ ] No-target leftover → still `safe`. Overspent / snoozed / underfunded / fully-spent unchanged and still win.
- [ ] Fix This list uses that pill (not a plain number). Future picker month uses that month's indicator. Selecting a row still works; the pill does not open cover/move.
- [ ] Tools ▸ Assign, default unassign amount, list order, inspector unchanged.
- [ ] Lint, typecheck, unit tests (`indicator.test.ts`, picker if it now carries indicator facts). Browser: a funded bill vs an overassigned envelope vs no-target leftover on the grid and in Fix This; desktop and ~390-wide.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-29-2129-overassigned-available/` with `plan.md`, `shape.md`, `standards.md` (references only, pin `8f9b8adc8388a62e4269b6a204ced15cde59a301`), `references.md`. No visuals. Then stop — implementation is a fresh session.

## Task 2: `overassigned` in `envelopeIndicator`

Add `IndicatorState` / `IndicatorIcon`. Tests in `indicator.test.ts`: extra above ask; equal-ask leftover stays Funded; sinking extra vs On Track; fully-spent still wins at $0 Available; no-target stays safe. `moreNeededCents` stays 0.

## Task 3: Grid chrome

Wire `extra` in `FundingChrome`. Name-column copy comes from `indicator.copy`. Available pill picks up the icon via existing `FundingIcon`.

## Task 4: Fix This list

Display-only pill on each envelope row. Build picker-month envelopes the same way `indicatorsFromAssign` already does for the viewed month (`assignEnvelopeFromRow` + that month's fold). Pass `data.months` (already in the dialog).

## Task 5: Verify, freeze spec, update roadmap

Drive `/finances/budget`: over-assign a targeted bill, leave another at the ask, confirm no-target leftover still looks like safe. Open Fix This; pills match. Switch to a later month; the pill follows that month. Freeze the spec; short shipped note next to funding-indicators / Fix This on `agent-os/product/roadmap.md`.

---

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
