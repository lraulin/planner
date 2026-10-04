# Scenarios — a planning worksheet for a month that does not exist yet

**Status: active**
Spec folder: `agent-os/specs/2026-10-04-1937-finance-scenarios/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-26-0910-supplies-worksheet/` — a standalone finance
  surface owns its tables, reads the budget, and never writes it. Scenarios does the same.
- **Supersedes:** `agent-os/specs/2026-08-26-0910-supplies-worksheet/` — **D3 only, and only
  the half that says a group is free text.** A Supplies group becomes a row. The other half
  of D3 stands: a group and the envelope that funds it remain two different fields.
- **Extends:** `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/` — Regular income
  and its `expectedMonthlyIncomeCents`; cost-of-living actuals from completed months only.
- **Extends:** `agent-os/specs/2026-08-21-1403-commitments-expected-vs-income/` — D1/D2: a
  bill's comparable figure is `annual ÷ 12`, and only active bills count by default.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — a bill is an envelope
  (`kind = 'bill'`), so one override table keyed by envelope id covers bills and income.
- **Extends:** `agent-os/specs/2026-08-21-2038-paused-bills-assignment/` — paused holds
  nothing; here that means "present, switched off, can be switched on".
- **Extends:** `agent-os/specs/2026-08-27-0757-currency-expression-entry/` — money cells use
  `parseAmountEntryCents`.
- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` — one registry entry per page.

## Context

Envelope budgeting answers "what should the money I have do?" It cannot answer "will my
income cover the life I am about to live?", because it only deals in money that exists.
Lee closes on a house in about three weeks and needs the second answer: rent is still a
real bill, the mortgage is not, and every dollar this month is already assigned.

He is doing it in a spreadsheet today (`visuals/spreadsheet.png`): take-home + VA, minus a
mortgage figure, minus the Bills page's monthly total with rent subtracted by hand.
Checked against the app on 2026-10-04:

| Figure                                       | Per month       |
| -------------------------------------------- | --------------- |
| Declared active bills excluding Rent         | $1,001.71       |
| Rent → mortgage                              | $2,100 → $2,429 |
| Trailing-12 cost of living excluding housing | $3,142.88       |
| …of which is not a bill                      | ≈ $2,141        |
| Spreadsheet remainder after mortgage + bills | $1,372.16       |

So last year's habits overshoot the remainder by about **$769/month**. The spreadsheet
cannot show that, and it also missed that Renter's Insurance and Rent Reporting end at
closing.

What exists, and why none of it is this: **Bills** compares real declared bills to income
and cannot hold a bill that does not exist or drop one that does. **Budget**'s Plan margin
is this month's targets, catch-up included. **Supplies** prices consumables but is
deliberately disconnected. **Insights** has the actuals. Scenarios reads all four.

## Decisions

**D1 — A scenario is one steady-state month.** No dates, no carryover, no month-by-month
projection. Every figure is a monthly equivalent (`annual ÷ 12`). Irregular costs enter as
a line at their own cadence ("4,000 / year").

**D2 — Reads everything, writes nothing outside its own tables.** No effect on Ready to
Assign, allocations, targets, bills or Supplies.

**D3 — Bills and Regular income are live rows; a scenario stores only its differences.**
Every bill envelope and every Regular income envelope appears at its current monthly
figure (`billRows` / `expectedMonthlyIncomeCents`). A per-scenario override row can switch
one off or replace its monthly amount; no row means "as it is today". Default inclusion is
`status = 'active'`; a paused or cancelled bill is listed, off, and can be switched on. A
bill added or repriced later appears in every scenario with no re-typing. A Regular income
envelope with no expectation and no override leaves the remainder marked incomplete, the
same rule `regularIncomePlan` applies.

**D4 — Lines are a tree, and a line with sub-lines is a roll-up.** A line is `income` or
`expense`; sub-lines inherit that. A roll-up shows the sum of its children and has no
amount of its own. **Splitting never changes the total:** adding the first sub-line moves
the parent's amount onto it. Same-scenario and same-kind parentage is enforced by the
schema, not by a mutation remembering to check.

**D5 — A leaf line's amount comes from exactly one source**, enforced by a `CHECK`:

- _manual_ — cents at a cadence. Reuses the bill `Cadence` type, `CADENCE_CHOICES`,
  `CadenceSelect` and `annualCents` (`src/lib/finances/recurringBills.ts`), so "every 4
  weeks" and "every 6 months" work and one function annualizes bills and lines alike.
- _supply item_ — live `monthlyCents` of that item's in-use offer.
- _supply group_ — live sum over the group's items.

**D6 — Supplies groups become rows.** `finance_supply_groups`, `finance_supply_items.group_id`,
`group_label` dropped after backfill. This is what lets a line follow a group by id; a
label match would fall to $0 on rename. The group cell in Supplies becomes pick-or-create,
and renaming a group becomes one edit.

**D7 — The actuals link is separate from the amount.** A line may reference one envelope
or one budget group. Beside the planned figure it shows that target's average monthly
spending over the last 12 **completed** months, from the same rows and rules as Insights'
cost of living (`loadInsightsRows`, `spendingContributions`). Reference only. Bill rows
show their own envelope's actual without being linked.

**D8 — Seed from spending.** A command adds one linked line per spending envelope that
had spending in the window and is not yet referenced, amount prefilled from its average.

**D9 — Uncovered spending is named.** A footer lists living-scope envelopes with spending
in the window that nothing in the scenario references, with the monthly amount and an
"Add line" action. A bill switched off is accounted for, not uncovered.

**D10 — Double counting is not prevented.** Chewy can be a bill while cat food is a
Supplies line. The actuals column is how that shows; the page does not guess.

**D11 — Several named scenarios.** New starts as "today" (live bills and income, no
lines). Duplicate copies lines and overrides. The picker shows each scenario's remainder.

**D12 — Periods.** Monthly is the headline. Pay period (`annual ÷ 26`) and Year are
columns available through Show Fields.

**D13 — Agent access is read-only.** `list_scenarios` (id, name, income, expenses,
remainder) and `get_scenario` (rows, totals, uncovered). No write tools.

**D14 — Desktop first.** Phone gets a readable list with totals; editing there is not a
goal of this spec.

**Not Achieve / Actual / YNAB.** None of the three has this surface. It is net-new intent,
and it deliberately leaves Actual's envelope math untouched.

### Out of scope

- Applying a scenario to budget targets or allocations.
- Dated cash-flow projection, cushion runway, one-off purchases.
- Scenario write tools for agents.
- Deduplicating a bill against a Supplies line.

## Acceptance criteria

- [ ] A new scenario with no edits shows Regular income minus active bills, equal to the
      Bills page's "after bills" remainder.
- [ ] Switching Rent off and adding a manual `Mortgage 2,429 / month` line reproduces the
      spreadsheet: bills + mortgage ≈ $3,430.71, and against $4,802.86 income the remainder
      is ≈ $1,372.15. Each bill's monthly figure is rounded on its own, so the sum may sit a
      few cents either side; the spreadsheet's $1,372.16 is the same number.
- [ ] `32.99 / week` reads $143.45 a month (`× 365.25 ÷ 7 ÷ 12` via `annualCents`), not
      `× 4`.
- [ ] Repricing a bill on Bills changes it in every scenario that has not overridden it,
      and leaves an overridden one alone.
- [ ] Adding the first sub-line to a $250 line leaves the scenario total unchanged.
- [ ] A line linked to a Supplies group picks up an item added to that group afterwards.
- [ ] Renaming a Supplies group is one edit and no scenario line changes amount.
- [ ] Every pre-migration `group_label` survives as a group with the same items.
- [ ] A line linked to an envelope shows its 12-completed-month average; the current
      partial month is excluded.
- [ ] Seeding a fresh "Rent off, Mortgage on" scenario lands near the −$769 gap.
- [ ] An envelope with spending last year and no line appears under Uncovered, and
      disappears when a line links it or its group.
- [ ] A second user cannot read, change, duplicate or delete the first user's scenario,
      line, override or supply group, and cannot attach a line to the first user's
      envelope, group or supply item.
- [ ] `get_scenario` returns the same remainder the page shows.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

Create `agent-os/specs/2026-10-04-1937-finance-scenarios/`:

- `plan.md` — this plan, Status active.
- `shape.md` — scope, the Q&A outcomes (own page; named scenarios; live switchable bills;
  all four line abilities; both actuals helpers; read-only tool; groups as rows), the
  evidence table above, out of scope.
- `standards.md` — references pinned to standards commit `866bae77`: `components/data-grid`,
  `components/navigation`, `components/ux-principles`, `components/responsive`,
  `components/modal-pattern`, `database/migrations`, `development/testing`,
  `development/security`, `development/clean-code`, `api/agent-tools`. Deviations: none.
- `references.md` — governing specs above; code references listed under each task.
- `visuals/spreadsheet.png` — the LibreOffice screenshot from the request.

Commit the folder to `master` (pre-authorized). **Stop.**

## Task 2: Supplies groups become rows

- `src/db/schema.ts`: `finance_supply_groups` (`userId`, non-empty `name`, unique per user,
  `sortKey`); `finance_supply_items.groupId` nullable FK, `set null`.
- Migration via `db:generate`, hand-edited to add → backfill from distinct trimmed
  `group_label` → drop the column, snapshot regenerated. **Data-transforming: run the
  recovery gate in `database/migrations.md` before it deploys.**
- Update every `groupLabel` reader: `supplies/queries.ts`, `rows.ts` (`supplyGroups`),
  `merge.ts`, `mutations.ts`, `suppliesColumns.tsx`, `SuppliesView.tsx`, the three dialogs,
  and the Amazon paths that create items.
- Mutations: create / rename / delete group, all taking `userId`. Deleting a group ungroups
  its items.
- Tests: extend `supplies/*.integration.test.ts` with a second user; `rows.test.ts` and
  `merge.test.ts` follow the type change.

## Task 3: Scenario schema

Additive migration, three tables, each carrying `userId`:

- `finance_scenarios` — `name` (non-empty), `notes`, `sortKey`.
- `finance_scenario_lines` — `scenarioId`, `parentId`, `kind`, `sortKey`, `name`; amount
  source columns (`amountCents` + cadence unit/count, or `supplyItemId`, or
  `supplyGroupId`); actuals link (`envelopeId` or `budgetGroupId`, at most one). `CHECK`s
  for D5 and the at-most-one link; a composite FK on `(parentId, scenarioId, kind)` for D4.
- `finance_scenario_overrides` — unique `(scenarioId, envelopeId)`, `included`, nullable
  `monthlyCents`.

Text + `CHECK` rather than `pgEnum`, as the Supplies tables do.

## Task 4: Pure logic — `src/lib/finances/scenarios/`

One small module per concern, each with a `*.test.ts`:

- `amount.ts` — a leaf's monthly cents from its source.
- `compose.ts` — bills, income, overrides, lines, supplies and actuals → the row tree,
  section totals and remainder. Roll-up sums; incomplete-income rule.
- `actuals.ts` — 12-completed-month average per envelope and per group (descendants via
  `descendantEnvelopeIds`).
- `uncovered.ts` — D9.
- `seed.ts` — D8's proposed lines.
- `split.ts` — D4's "first sub-line inherits the amount".

Reuse, do not re-derive: `billRows` / `activeBillTotals` (`commitmentRows.ts`),
`regularIncomePlan` (`budget/incomePlan.ts`), `annualCents` / `Cadence`
(`recurringBills.ts`), `supplyGroups` + `cost.ts`, `spendingContributions` /
`completedMonthAverages` (`reports.ts`), `sortKey` (`src/lib/tree/sortKey.ts`).

## Task 5: Queries and mutations

- `scenarios/queries.ts` — `listScenarios`, `loadScenario`.
- `scenarios/mutations.ts` — scenario create / rename / duplicate / delete; line create /
  edit / move / split / delete; override set / clear; seed. Every one takes `userId` and
  proves ownership of each referenced id (scenario, parent, envelope, group, supply item,
  supply group) before writing.
- `*.integration.test.ts` with a second user failing at read, change, duplicate, delete and
  foreign-id attach. Add the reads to `src/lib/db/crossUserReads.integration.test.ts`.
- Check for the Postgres skip warning after `npm run test:unit`.

## Task 6: The page

- `src/lib/navigation/pages.ts` — `scenarios` after `bills`.
- `src/app/finances/scenarios/page.tsx` (force-dynamic) and thin additions to
  `src/app/finances/actions.ts`.
- `src/components/finances/scenarios/` — `ScenariosView` on the shared `DataGrid`:
  Income, Bills (grouped by bill group, collapsible), Lines; columns Name, Amount, Cadence,
  Monthly, Last 12 mo, Difference, plus Pay period / Year. Footer: income, expenses,
  remainder, Uncovered disclosure. Scenario picker with remainders.
- Commands registered in the menus per `components/navigation`: New / Duplicate / Rename /
  Delete scenario; New line, New sub-line, Add from Supplies…, Add lines from last year's
  spending; Include / Exclude; Clear override. Dialogs on `ModalShell`.
- Phone: list + totals per `components/responsive`.
- Read the Next.js docs in `node_modules/next/dist/docs/` before writing the route.

## Task 7: Agent tools

`list_scenarios` and `get_scenario` in `src/lib/agent/contracts.ts` and
`financeTools.ts`, registry-defined, strict schemas, read-only, foreign id ≡ `not_found`.
Add both to `mcp.test.ts` and a `responseBudget.test.ts` case.

## Task 8: Verify, freeze, roadmap

- `npm test`, lint, typecheck, build; then dev server + **`npm run smoke`**.
- Drive `/finances/scenarios` in a browser and walk the acceptance list on real data,
  including the spreadsheet reproduction.
- Confirm the Task 2 backfill on a copy of production data before deploying it.
- Update plan / shape for as-built drift; complete **Changes from original plan**; mark
  frozen with the date; list follow-ups as new work.
- Add the shipped entry to `agent-os/product/roadmap.md`.

> While this spec is **active**, a material change to requirements, design or scope
> (including feedback on what was built) updates the relevant sections and appends to
> **Changes from original plan**. Skip pure implementation details. Freeze when verified.
