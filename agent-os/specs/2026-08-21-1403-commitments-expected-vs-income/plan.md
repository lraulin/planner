# Commitments — expected vs income

**Status: active**
Spec folder: `agent-os/specs/2026-08-21-1403-commitments-expected-vs-income/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-21-1122-commitments-curation/` — the two grids, Review
  at the foot, cadence-in-days, and the category/alias work. This does not reopen those
  decisions.
- **Extends:** `agent-os/specs/2026-08-16-1938-commitments/` — the two-tier model and the
  26-paycheck year that `normalizedMonthlyIncome` already uses.

## Context

The curation spec made it possible to list the bills. Once they were listed, the page still
could not answer the question the list exists for: **what do these cost, together, against
what I earn?** Amount on a bill is the charge per cycle, so summing it is a lie — a yearly
$72 next to a monthly $72. Recurring spend already had Weekly and Monthly; bills had A year
and no comparable period columns. Review was still ordered by annual cost, which is the
discovery sort, not the backlog sort.

Two rendering bugs rode along because they blocked reading the lists: the bills grid clipped
instead of scrolling, and adding a merchant to an existing spend group wrote the matchers
without the cell updating until a full reload.

## Decisions

**D1 — Comparable columns are annualized, not the accrual slice.** Bills gain Monthly
(`annual / 12`) and Pay period (`annual / 26`). Recurring spend gains Pay period
(`monthly × 12 / 26`). `held.perPaycheckCents` stays the accrual (expected divided by
paydays in _this_ cycle) and is not what the new column shows — putting it there would make
rent look half as expensive as a yearly bill of the same annual cost.

**D2 — Totals skip Amount and Rate.** Those columns do not share a period. Each grid's
footer totals the period columns it does share. Only active rows count; cancelled, dismissed,
and paused stay on the books without shrinking the remainder.

**D3 — One comparison table, three periods.** Subscriptions, recurring spend, their sum,
detected income, and the remainder, each as monthly / pay period / year. Income is
`incomeFromPaydays` over the payday series the page already has — not a second detector —
so the headline cannot disagree with the dashboard. A negative remainder is overcommitted.

**D4 — Review sorts.** Default is last charge, newest first. Every column is clickable.
This stays a table, not a DataGrid: Review is an inbox with a draft that spans the row, and
the grid's blur-commit / layout persistence would fight that.

**D5 — Show Fields is already the column picker.** The View menu's Show Fields command is
the same one every other grid uses. New columns appear on saved layouts via `GridSettings.known`
(curation spec correction). No second picker.

## Scope

**In**

- Monthly and Pay period columns on bills; Pay period on recurring spend
- Active totals under each grid
- Expected vs income table between the grids and Review
- Review: Last charge column, default sort newest first, click-to-sort on every column
- Bills/spend grids scroll inside the section (the wrapper is a flex column, DataGrid fills
  a bounded parent)
- Matcher / name / amount cells remount when the server value they display changes

**Out**

- Merging two already-declared commitments (still a follow-up on the curation spec)
- A double-charge watch after a merge
- Treating monthly VA / named benefits as paydays (the income detector still excludes them)
- Totals of Amount, Rate, or Set aside

## Acceptance

- A yearly $71.88 bill reads ~$5.99 / month and ~$2.76 / pay period, not $71.88 / month
- A monthly $2,100 bill reads $2,100 / month, not $1,050 (the accrual slice)
- Summing Amount across mixed cadences is impossible from the footer — it is not there
- Cancelled bills do not change Expected vs income
- Review opens with the most recently charged merchant at the top
- More bills than fit in 26rem are reachable with the grid's own scrollbar, not only arrow keys
- Adding a merchant to Groceries from Review updates the Matchers cell without a reload

## Changes from original plan

| What                                                             | Why                                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Mobile sections are `h-auto`; the 26rem/22rem clip is `md:` only | A phone stacks the add form so tall that a 26rem pane left zero height for the rows |
