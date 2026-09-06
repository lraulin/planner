# A bill's expected charge follows its charges — Shaping Notes

**Status: active**

## Scope

The stale-bill-anchor follow-up from `2026-09-06-1301-pile-spent-is-not-a-raid`, plus the two
things investigating it turned up. Three changes, one theme — **what counts as a bill's
charge, and what a charge does to the date the bill is waiting for**:

1. A stored anchor retires when a charge pays it (D1), and the write guard learns the same
   rule (D2).
2. A bill's charges become the transactions filed to its envelope rather than the ones that
   arrived on a claimed payee (D3), everywhere that question is asked (D4).
3. A bill whose charges have outgrown its declared amount offers the observed figure (D5).

### Out of scope

- The **one-time savings goal** — the other open follow-up from `pile-spent-is-not-a-raid`.
  Confirmed out for this session.
- **Giving a payee more than one envelope.** `Apple/bill` (290 transactions) claims nothing
  because a claim is one payee → one envelope; eight phantom payees exist to work around it.
  D3 makes them harmless. Removing them is a schema question and its own spec.
- Any schema change.
- Changing Rent's `due_day` / `lead_days` in production. Flagged in Task 6, not touched.

## How the diagnosis was reached

The frozen follow-up asserted a cause. Rather than implement against it, `billAnchor` was
replayed over the live data (read-only, via `readBackupSecrets()`, `todayKey = 2026-09-06`,
33 non-cancelled bill envelopes). The assertion did not survive: Dropbox's `DROPBOX` payee is
claimed, its 2026-09-05 charge was seen, and the anchor was stale anyway.

The replay is the evidence for every number in `plan.md`, and it is worth re-running rather
than trusting, because it also produced the before-table Task 6 verifies against:

| finding                                                                  | figure                |
| ------------------------------------------------------------------------ | --------------------- |
| bills whose expected date changes under D1 + D3                          | **2** — Dropbox, Rent |
| bills whose expected date is unchanged                                   | 31                    |
| bills whose charges the app cannot see at all today (D3)                 | **8**                 |
| phantom claim payees with zero transactions                              | 8                     |
| bills whose recent charges sit outside their declared amount's band (D5) | 7                     |
| bills declaring a `due_day`                                              | **0**                 |

Switching the basis alone (claim → envelope) changes **nothing** today — every claim-blind
bill's stored anchor is still in the future. That is why it reads as "not urgent" and is
exactly why it needed doing: Paste's anchor is 2026-09-07, and its charge arrives on
`Apple/bill`.

## Decisions

- **Half a cadence, from `nearestOccurrence`.** Considered and rejected:
  `minimumCadenceGapDays` (the 12% band in `billClaimMatch.ts`), which puts Chewy's 27-day gap
  0.2 days from the boundary — a coin flip on real data. Half a cadence is the rule the
  declared branch already uses and has 12 days of margin on the same case.
- **Retire, then walk — do not seed a series from the anchor.** Seeding is the prettier
  symmetry with `declaredSeries` and it is wrong: it makes an unverified date permanent.
  Rent proves it (`2026-10-05` seeded vs `2026-09-26` walked, against a bill that really does
  post around the 25th). `bill-due-dates-and-lead-time` D2 already said an undeclared bill is
  a walk.
- **No amount gate on the anchor**, though `billClaimAccepts` is right there and the D4 it
  supersedes would suggest it. The band would reject the latest real charge on seven bills.
  Recorded with the numbers in `plan.md` D3 so the next reader does not re-propose it.
- **The write guard moves with the reader.** Chosen over the smaller diff, because a guard
  that permits a date the grid then silently replaces is the exact symptom the guard exists to
  prevent.
- **Agreement, not distance, drives the amount nudge.** A bill that is genuinely variable
  (SMECO) must not nag every month; a bill that has quietly settled at a new price
  (SimpliSafe, five identical charges) should. `observedAmountRange`'s 25% spread already
  encodes that distinction and is reused rather than re-derived.

## Context

- **Visuals:** None. Date arithmetic.
- **Data:** production, read-only, 2026-09-06. Queries were `select` only; nothing was written.
- **References:** `src/lib/finances/commitments.ts` (`billAnchor`, `nextChargeWriteError`,
  `billsNeedingReview`), `billSchedule.ts` (`nearestOccurrence` — the rule being generalised),
  `billLastCharge.ts`, `dashboardQueries.ts` (`loadBillForecast`, `loadDashboard`),
  `payees/billClaimMatch.ts`, `amountMatch.ts`, `commitmentRows.ts` (`observedAmountRange`),
  `splitRows.ts`, `components/finances/bills/BillsView.tsx`.
- **Product alignment:** the Bills work has no roadmap entry —
  `bill-due-dates-and-lead-time` shipped without one. Task 6 adds a single entry covering both.

## Standards Applied

See `standards.md` for the pinned list. The ones that shaped a decision rather than a style:

- `development/clean-code.md` — "When the model is wrong, change the model", and its two-
  workarounds signal, which is what D3 is answering. Also the reason `billsNeedingAmountReview`
  is a pure lib function and not logic in `BillsView`.
- `development/testing.md` — D3 changes a database query, so a cross-user case is mandatory;
  the pure date rule in D1 is where the tricky reasoning is and gets tests named for their
  claims.
- `development/dates.md` — `YYYY-MM-DD` keys throughout, no `Date` for calendar arithmetic.
