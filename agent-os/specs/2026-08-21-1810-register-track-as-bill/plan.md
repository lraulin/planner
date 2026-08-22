# Register — Track as bill

**Status: frozen / complete** (2026-08-21)
Spec folder: `agent-os/specs/2026-08-21-1810-register-track-as-bill/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-16-1938-commitments/` — two-tier model, name/matcher split, matcher exclusivity, propose-never-apply.
- **Extends:** `agent-os/specs/2026-08-18-2058-commitments-clarity/` — D3: you name it before it commits. Bank strings are matchers, not names.
- **Extends:** `agent-os/specs/2026-08-21-1122-commitments-curation/` — cadence as `{ month | day, n }`, `detectCadence` / `suggestCommitmentName`, Review's Track as bill draft as the field set to copy.
- **Extends:** `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/` — declaration is always a confirmation; a second entry point besides the review list (that spec already added "Declare a bill" when detection could not see Taylor Gas).
- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` — one command declaration feeds the Item menu, row menu, Commands panel, `⋯`, and palette. No hand-written `MenuItem[]`.
- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — the Register itself. This only adds a row command.

## Context

You see the charge in the Register. Declaring it a bill currently means leaving for Commitments Review (if the detector found it) or Insights one-off review (if it is large), or filling New bill by hand. Semi-annual Geico and Taylor Gas never reach Review; a one-off Amazon does. The person looking at the row is the one who knows.

This is a third entry point for the same write: `setRecurringBillAction` / `upsertRecurringBill`. No new table, no new mutation.

Achieve has no finance module; there is no AP fidelity obligation.

## Decisions

**D1 — Name-first dialog, not a write on click.** Right-click → **Track as bill…** opens a `ModalShell` prefilled from this merchant's history. Commit writes. Matches Commitments Review's BillDraft fields: name, cadence, amount, next charge. Matcher is the row's `effectiveMerchant()`, not editable here.

The ellipsis is load-bearing: it opens a dialog. Copy is **Track as bill…**, the same verb Commitments already uses, not "Make it a bill" / "It's a bill".

**D2 — Bills only.** No Track as spend on Register. Recurring spend stays a Commitments Review decision.

**D3 — Create only, not join.** If this merchant is already claimed (bill or spend, including dismissed/cancelled — they still hold matchers), the command is **disabled with the reason**, not a join-as-alias path. Alias folding stays on Commitments Review.

**D4 — Only `spend` can be a bill.** Income, transfers, refunds, and interest/fees disable with `"{Flow label} cannot be a bill"`. Pending spend is allowed: the merchant is known.

**D5 — Prefill from the whole merchant, not the one row.** Register already holds every transaction. Sibling **spend** charges with the same `effectiveMerchant` supply:

| Field       | Source                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------ |
| Matcher     | `effectiveMerchant(row)`                                                                   |
| Name        | `suggestCommitmentName(merchant)`                                                          |
| Cadence     | `detectCadence(dates)` else `cadenceFromGapDays(median gap)` else `{ month: 1 }`           |
| Amount      | median of those charges' `spendCentsOf`, or this row if it is the only one                 |
| Next charge | `nextDueFrom(lastChargeOn, cadence, todayKey)` — follows the cadence dropdown until edited |

One charge (the Taylor Gas case the review list still misses) opens monthly with this amount; the user changes cadence. That is the point of the dialog.

**D6 — One command, every surface.** `record.track-as-bill` as a Finances `pageCommand`: Item menu, row menu, Commands panel, palette, phone `⋯`. Not on the icon toolbar. Not on swipe (swipe stays delete). Long-press is the phone path. Blank-area menu shows it disabled ("Select a row first"), same as Open / Delete.

**D7 — Reuse the existing write.** Dialog calls `setRecurringBillAction`. Failed submit keeps the dialog open with the error. Success closes it (closing is the signal — no toast) and adds the matcher to local claimed state so the next right-click greys immediately. Stay on Register.

**D8 — Modal, not expand-in-place.** Clarity D3 used in-place expansion because Review is a list of proposals. Register is a grid of bank rows; a modal is the capture surface `ux-principles` allows. Unmount on close so the next open starts clean. Below `md`, `ModalShell` is already a bottom sheet.

### Out of scope

- Track as spend
- Add-to-existing / alias join
- Category, URL, unscheduled, due-day in this dialog (Commitments grid already edits them)
- New mutation, schema, or agent tool (`upsert_subscription` already exists)
- Jumping to Commitments after save
- Swipe or toolbar placement

## Acceptance criteria

Verified 2026-08-21 in the running app (1280×800 and 390×844) and unit tests.

- [x] Right-click (and Item menu / Commands panel / phone `⋯`) on a spend row offers **Track as bill…**
- [x] Dialog prefills a cleaned name, detected cadence, typical amount, and next charge from that merchant's spend history on file. Live: Amazon → name Amazon, monthly, $22.26, next 9/14/2026, "1888 charges on file"
- [x] A single charge still opens (monthly, this amount); cadence is editable. Pinned in `registerBillDraft.test.ts`
- [x] Commit payload is the same `setRecurringBillAction` shape Review's BillDraft uses (`name`, `matchers: [merchant]`, cadence, amount, next charge, `scheduled: true`). The write itself is the existing `upsertRecurringBill` (cross-user already covered). Did not declare a live Amazon bill during verification
- [x] Refund row: disabled, **"Refund cannot be a bill"**. Other non-spend flows pinned in unit tests
- [x] Already-tracked merchant: disabled, **"Already tracked as Geico"** on a live GEICO charge
- [x] Escape / Cancel closes the dialog without writing. Failed-submit-stays-open is the shared `ModalShell` + inline error path
- [x] No new mutation
- [x] Browser: desktop right-click + Item menu + Commands panel; phone `⋯` opens the same command and the dialog as a bottom sheet. `npm run smoke` — 57 routes. `registerBillDraft.test.ts` 12 tests

## Follow-ups (new work — not amendments to this frozen spec)

- Long-press on compact Register rows was not driven (the driver has no long-press step); phone `⋯` is the verified touch path. Long-press uses the same `rowMenu` as desktop right-click
- Track as spend from Register stays out, as shaped

## Changes from original plan

| #   | Change | Why       |
| --- | ------ | --------- |
|     | None   | As shaped |

## Task 1: Save Spec Documentation

This folder: `plan.md` (**Status: active**), `shape.md`, `standards.md`, `references.md`.

## Task 2: Pure draft + refusal

`src/lib/finances/registerBillDraft.ts` + `.test.ts`.

## Task 3: Load claimed matchers on Register

`src/app/finances/register/page.tsx` — `loadRecurringBills` + `loadRecurringSpend`, compact through `matcherIndex`.

## Task 4: Command + dialog

`FinancesView` `pageCommand` + `TrackAsBillDialog`.

## Task 5: Verify, freeze spec, update roadmap

---

While this spec is **active**, when a material change lands on requirements, design, or scope — including feedback on what was implemented — update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
