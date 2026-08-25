# Month-ahead zero-based budget — Shaping Notes

**Status: frozen / complete** (2026-08-25)

## Scope

Finish the cashflow → zero-based migration on Budget, then add YNAB Rule 4 (a month ahead).

1. Stop splitting monthly bills across two months / paychecks.
2. Remove pay-period math from Budget (Expected vs Income, Next 12 months).
3. Replace Actual's Hold-for-next-month with YNAB-style assign-into-future-month.

### Out of scope

- Insights pay-period reporting axis
- Jobs `payPeriod`
- Dashboard payday countdown
- Age of Money, auto-hold, copy-budget-through-the-year
- Dropping `buffered_cents` from the schema
- Earmarked savings / Goals

## Decisions

- Monthly (`n = 1`) bills ask for the full amount only in the month they are due. Yearly and quarterly bills still sink.
- Ready to Assign on the current month and later subtracts assignments in future months. Past months stay historical.
- Hold is removed. Leftover Ready to Assign already rolls into `fromLastMonth`; assigning in a future month is the job.
- Any future month in the existing 12-month horizon. No hard gate that the current month must be fully funded first — a muted note only.
- Visuals: none beyond the YNAB vs Actual comparison in the request.

## Context

- **Visuals:** None. Shaped from the user's YNAB vs Actual write-up and the live Budget page.
- **References:** Envelope fold, `billFundingDemand`, Hold operations, Expected vs Income / ForwardPanel, single-pool identity.
- **Product alignment:** Rule 4 / month-ahead is the next Finances slice. Earmarked savings stays later.

## Remnant inventory (Budget)

| Leftover                                                                 | Disposition                                |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| Monthly bill sinking `remaining / (monthsUntil + 1)` when due next month | D1: demand $0 except the due month         |
| `baseMonthlyContribution` asking another full month for `n = 1`          | D1: already-funded → $0                    |
| Expected vs Income Pay period column (`annual / 26`)                     | D5: drop                                   |
| Next 12 months Pay periods axis                                          | D5: drop                                   |
| `paycheckCents` on bill rows                                             | D5: drop if unused elsewhere               |
| Hold for next month                                                      | D2: remove; Release leftover buffered only |
| Insights pay-period charts                                               | Keep                                       |
| Dashboard "until payday"                                                 | Keep this slice                            |

## Standards Applied

- development/clean-code — model correction, not a second workaround
- development/testing — demand, displayed RTA, identity, cross-user
- development/security — `userId` on every write
- development/dates — month keys, no `Date` in the fold
- development/commits — one logical change; Spec trailer
- components/ux-principles — muted note, not a blocking dialog
