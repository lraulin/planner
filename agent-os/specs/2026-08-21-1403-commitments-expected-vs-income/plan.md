# Commitments — expected vs income

**Status: frozen / complete** (2026-08-23)
Spec folder: `agent-os/specs/2026-08-21-1403-commitments-expected-vs-income/`

This is the durable as-built record of the comparison and commitments-grid work shipped on
2026-08-21. Later behavior changes belong to delta-specs rather than edits here.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-21-1122-commitments-curation/` — the two grids, Review
  at the foot, cadence-in-days, and the category/alias work. This does not reopen those
  decisions.
- **Extends:** `agent-os/specs/2026-08-16-1938-commitments/` — the two-tier model and the
  26-paycheck year that `normalizedMonthlyIncome` already uses.

The later `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/` delta renamed the
commitment grouping field from Category to Group. It did not change this spec's comparison,
totals, export, grouping, or Review behavior.

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
and paused stay on the books without shrinking the remainder. Group headers show the same
figures for the rows under them (Monthly / Pay period / A year on bills; Weekly / Monthly /
Pay period on spend), restated after a filter the way the count is. A cancelled or paused
group therefore reads $0.00 — it is not contributing to what you pay.

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

**D6 — Both grids are ordinary DataGrids.** File ▸ Export / Copy (CSV, JSON, YAML) register
on each grid, scoped (`CSV — Subscriptions & bills`) plus a focused shortcut for the grid
with the ring. Money columns export as `formatUsd` so a spreadsheet sees the same figures
as the cells. Group by Category / State, saved views, and row numbers match the other
list grids. In-app totals stay — export is a way to take the view elsewhere, not a
substitute for the footer.

**D7 — Manual create is on demand.** Review is how a bill usually arrives. The always-on
create form occupied the scanning surface for a rare action (`ux-principles.md` —
progressive disclosure). New bill / New spend group live in the New menu (`⌘⏎` on the
focused grid), a quiet header control, and the empty state. The form expands in place —
not a modal — and Escape / Cancel puts it away. Recurring spend gets the same treatment
because its form had the same problem.

## Scope

**In**

- Monthly and Pay period columns on bills; Pay period on recurring spend
- Active totals under each grid
- Expected vs income table between the grids and Review
- Review: Last charge column, default sort newest first, click-to-sort on every column
- Bills/spend grids scroll inside the section (the wrapper is a flex column, DataGrid fills
  a bounded parent)
- Matcher / name / amount cells remount when the server value they display changes
- File ▸ Export ▸ CSV includes Monthly / Pay period / A year (and Amount, Rate, Weekly)
- Group by Category or State; saved views on each grid
- Group headers show the same active totals as the footer, for the rows in that group
- Manual create is New menu / header "Add bill" / empty state — not a persistent form

**Out**

- Merging two already-declared commitments (still a follow-up on the curation spec)
- A double-charge watch after a merge
- Treating monthly VA / named benefits as paydays (the income detector still excludes them)
- Totals of Amount, Rate, or Set aside

## Acceptance criteria (met)

- [x] A yearly $71.88 bill reads ~$5.99 / month and ~$2.76 / pay period, not $71.88 / month
- [x] A monthly $2,100 bill reads $2,100 / month, not $1,050 (the accrual slice)
- [x] Summing Amount across mixed cadences is impossible from the footer — it is not there
- [x] Grouping bills by category puts that category's active Monthly / Pay period / A year on
      the header; a cancelled-only group reads $0.00
- [x] Cancelled bills do not change Expected vs income
- [x] Review opens with the most recently charged merchant at the top
- [x] More bills than fit in 26rem are reachable with the grid's own scrollbar, not only arrow keys
- [x] Adding a merchant to Groceries from Review updates the Matchers cell without a reload

## Changes from original plan

| What                                                             | Why                                                                                           |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Mobile sections are `h-auto`; the 26rem/22rem clip is `md:` only | A phone stacks the add form so tall that a 26rem pane left zero height for the rows           |
| Both grids get File ▸ Export, Group by, views, row numbers       | Asked for full standard grid capabilities so a CSV can be opened in Excel; in-app totals stay |
| Create form is on demand, not persistent                         | Review is the usual path; the always-on form occupied the list                                |
| Group headers show the same active totals as the footer          | Asked once grouping was on the bills table — the footer is the whole list, not the section    |

## Verification and delivery

- Period arithmetic and active-only totals are covered by `commitmentRows.test.ts` and
  `expectedSpending.test.ts`.
- Review ordering and per-group totals are covered by `reviewSort.test.ts` and
  `commitmentGrouping.test.ts`.
- Delivery commits: `be01058`, `04b41df`, `bb6e898`, and `3adc2e7`.
- The current full suite passed 4,219 tests before this retrospective freeze.

## Status (closed)

Shipped 2026-08-21 and recorded in the finance roadmap. All acceptance criteria are met.

## Follow-ups (new work — not amendments to this frozen spec)

- Merging two already-declared commitments and watching for a double charge remain separate
  curation work.
- Treating monthly VA or named benefits as income requires an income-detector delta.
