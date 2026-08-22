# Paused bills and assignment visualization

**Status: frozen / complete** (2026-08-21)  
Spec folder: `agent-os/specs/2026-08-21-2038-paused-bills-assignment/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-14-1104-unscheduled-bills/` — `scheduled` still means “dates are knowable”; yearly cost is still stated; nothing infers unscheduled.
- **Extends:** `agent-os/specs/2026-08-16-1338-finances-dashboard-available/` — same available-to-spend formula; savings still excluded; negative still renders.
- **Extends:** `agent-os/specs/2026-08-16-1938-commitments/` — D0 stands: no tier-3 buckets. Cadence still the admission test.
- **Supersedes:** `agent-os/specs/2026-08-18-2058-commitments-clarity/` — **only** “`status === "active"` is the entire hold gate.” Pause is listed, not held. The Hold checkbox stays deleted.
- **Supersedes:** `agent-os/specs/2026-08-16-1338-finances-dashboard-available/` — **only** the dashboard Bills panel printing a due date for every accrual. Unscheduled bills must not show a projected date.

Roadmap envelopes item stays **closed**. This is not every-dollar assignment.

## Context

Taylor Gas (propane) is the case: tank sensor + weather, fills of $150–$540, last fill 2025-10-24. Declared yearly $539.95 **scheduled**, so available dropped $456.94 (22 paychecks × $539.95/26 since the last fill). That catch-up is the YNAB “true expense” the user valued.

Two things it does badly:

1. **It cannot express “I might move and not pay this.”** Active with an amount is held, full stop. Cancelled/dismissed hide or kill the commitment. There is no pause.
2. **The assignment is a five-line arithmetic list.** Rent $2,100 of $3,162 held is why the headline is −$1,100, and nothing on the page says that as a picture.

Amount uncertainty is already measured (`lowCents`/`highCents`). It is not shown on the dashboard bill row. Unscheduled is a column on Commitments; Track-as-bill still hardcodes `scheduled: true`. The dashboard Bills panel was built after the unscheduled spec and prints a due date for every accrual.

## Decisions

**D1 — Catch-up accrual does not change.** `setAsideHeld` still holds `min(expected, perPaycheck × paydays since last charge)`. Declaring a yearly bill ten months in still subtracts what should already be sitting there.

**D2 — New status `paused`.** `COMMITMENT_STATUSES` becomes `active | paused | cancelled | ignored`.

| Status              | On Commitments grid | Held in available | In leftover-after-commitments |
| ------------------- | ------------------- | ----------------- | ----------------------------- |
| active              | yes                 | yes (if amount)   | yes                           |
| **paused**          | **yes**             | **no**            | **no**                        |
| cancelled           | no (history kept)   | no                | no                            |
| ignored (Dismissed) | Review list         | no                | no                            |

UI word is **Paused**. Recurring spend is out of scope for Pause. The Hold checkbox stays gone.

**D3 — Unscheduled stays orthogonal, and the dashboard must honor it.** `scheduled: false` means no forecast date. Accrual still runs. The Bills panel prints “unscheduled” (and the observed range) instead of “due Oct 24”. Track-as-bill gains an Unscheduled control; when set, hide the next-due field. Nothing auto-detects unscheduled.

**D4 — Amount uncertainty is displayed, not declared.** No new column. Bill row shows observed min–max of matched charges when `(high − low) / high > 0.25`, in whole dollars (`$150–$540`). Accrual still uses `expectedCents`.

**D5 — Assignment visualization is the available-to-spend terms, drawn.** Not a pie. Not per-category envelopes. Composition of one pile, so a stacked claims bar against checking.

`assignmentBreakdown(available, setAsides)` returns source (checking), claims (pending, cards, rent-if-large, other bills, recurring spend), remainder (leftover or shortfall). Width scales to `max(checking, sum of |claims|)`. Negative available overflows checking. Rent (or any single bill ≥ 40% of bill hold) splits out of “Bills”. The five-line `dl` stays and still comes from `available.terms`.

CSS/flex bar, existing tokens. No recharts.

**D6 — Do not auto-edit live commitments.** Gas (Taylor) stays as the user left it. After this ships: mark it Unscheduled; Pause it if the move is the plan.

### Out of scope

- YNAB envelopes / every-dollar / tier-3 buckets
- Accrue-forward-only or user-typed “keep $X on hand” buffers
- Pause on recurring spend
- Inferring unscheduled from irregular gaps
- Changing `setAsideHeld` catch-up math
- recharts on the dashboard

## Acceptance criteria

- [x] Status `paused` is on the bills grid, in `upsert_subscription`, and in the Commitments status control. Paused bills hold $0 and drop out of leftover-after-commitments.
- [x] Pausing and resuming is a wash with the accrual: pause a funded bill and available rises by its held amount; unpause restores the same hold.
- [x] A second user cannot pause, resume, or read the first user’s paused row.
- [x] Unscheduled bills never print a due date on Dashboard Bills (or Upcoming). Observed range prints when spread > 25%.
- [x] Track-as-bill can declare unscheduled; next-due is hidden in that state. Default remains scheduled.
- [x] Dashboard shows an assignment bar whose segments sum to the same arithmetic as the headline. Negative available overflows checking; positive leftover fills it. A bill ≥ 40% of bill hold splits out.
- [x] Phone-width (390) still readable: bar + terms, no horizontal scroll of the stack.
- [x] `npm run test:unit` including DB tests (no skip warning). `npm run smoke` with dashboard rendering.
- [x] No Hold checkbox returns. No new envelope table.

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

This folder.

## Task 2: Pause status

Schema, hold gate, grid, agent enum, tests including cross-user.

## Task 3: Unscheduled honesty + observed range

Dashboard caption helper, Track-as-bill Unscheduled control, range on `BillRow`.

## Task 4: Assignment breakdown + dashboard bar

Pure `assignmentBreakdown` + CSS bar above the existing terms.

## Task 5: Verify, freeze spec, update roadmap

Done 2026-08-21. Envelopes item remains closed.

## Follow-ups (new work — not amendments to this frozen spec)

- Typed “keep $X on hand” buffer
- Pause on recurring spend
- Inferring unscheduled from irregular gaps
- Shortfall attribution (already the roadmap Next)

> While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
