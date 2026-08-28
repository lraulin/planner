# Budget Activity → filtered Register

**Status: active**  
Spec folder: `agent-os/specs/2026-08-28-1356-budget-activity-register-links/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — Activity is the month's categorized on-budget rollup; the uncategorized tray already links to a filtered Register.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — `/finances/budget` is the only budgeting page; Assigned / Activity / Available stay the money columns.
- **Extends:** `agent-os/specs/2026-08-25-1633-budget-inspector/` — inspector Available-breakdown Activity is the same number as the grid cell. That spec's D9 left Register out of scope; this delta delivers the drill-down.
- **Extends:** `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/` — Register deep-link views `?view=uncategorized` and `?view=tag&tag=` are the pattern to copy.
- **Extends:** `agent-os/specs/2026-08-24-1945-register-prepared-rows/` — server-prepared index + 100-row blocks; the Register page must not await `searchParams`.
- **Extends:** `agent-os/specs/2026-08-26-2022-split-transactions/` — split parents hold no envelope; children are the activity rows.
- **Extends:** `agent-os/specs/2026-07-31-1520-persistent-ui-state/` — filters/sort/layout stay in `user_settings`; this view is named in the URL like the other Register deep links.
- **Does not supersede** inspector D9 (that was a scope boundary, not a ban). Does not change envelope math, funding indicators, or group/section totals.

## Context

On Actual Budget desktop, clicking a category's Spent/Activity cell navigates to the accounts register with `category is {id}` and `date is {month}`. Planner's Activity column is a formatted number; the inspector repeats it. The uncategorized tray and tag pills already drill into the Register. This delta makes envelope Activity the same kind of link: the transactions that summed to the number.

Product alignment: Budget/Register fidelity to Actual, not a named roadmap item. Note it at freeze.

## Decisions

- **D1 — Which numbers.** Envelope (Regular, Bills, Savings) Activity cells and the inspector's Activity line. Not group-header Activity, not section "spent" captions, not Income received, not Ready to Assign terms.
- **D2 — Destination.** Navigate to `/finances/register`. Browser Back returns to Budget. No inspector transaction list in this slice.
- **D3 — The list is the contributing set.** Same predicates as `activitySince` in `src/lib/finances/budget/queries.ts`: on-budget account, money rows (split children, not parents), not superseded pending, `budget_category_id` is that envelope, calendar month of `transactionDate` is the Budget month being viewed, on-budget-to-on-budget transfers excluded (the on-budget leg of an off-budget transfer counts — money left the pool). Refunds/inflows in the envelope stay; do not hide positive amounts.
- **D4 — URL.** `/finances/register?view=activity&category=<envelopeId>&month=YYYY-MM`. Reuse `monthKeyFromParam` / `monthParamOf`. Client reads `category` and `month` from `useSearchParams`, same reason tag does not go through the Register server page (awaiting `searchParams` reloads the ledger on `?detail=`). Garbage or missing params degrade to All Transactions.
- **D5 — URL-only view.** Do not persist `activity` as the last Register view. `clearViewState()` on mount like uncategorized/tag, so a previous search cannot hide contributing rows. Default chips: Category = envelope name, Date = that month. `viewRows` is the hard contributing set; chips may narrow further; switching to All Transactions is how you leave it.
- **D6 — Zero is still a link.** `$0.00` stays muted and remains clickable. Empty copy names the envelope and month (`No transactions in Groceries for August 2026.`).
- **D7 — Phone.** Activity tap navigates; it must not open the inspector sheet (name tap / Enter still does). 44px tap target below `md`.
- **D8 — No schema, no Insights, no new API.** Navigation + Register query only.

**Named Actual alignment:** same gesture as `onShowActivity` in `../actual/packages/desktop-client/src/components/budget/index.tsx`. Machinery is our Register view, not Actual's router-state `filterConditions`.

## Acceptance criteria

- [ ] On `/finances/budget`, each Regular / Bills / Savings Activity number is a link to `/finances/register?view=activity&category=<id>&month=<budget month>`.
- [ ] The inspector Activity line is the same link.
- [ ] The Register shows exactly the transactions that summed to that Activity figure (D3). Their amounts sum to it.
- [ ] `$0.00` still links; empty state names envelope and month.
- [ ] Group/section/income figures are not links.
- [ ] Browser Back returns to the Budget month you left. Visiting Register from the page bar does not restore a stale activity view.
- [ ] Below `md`, tapping Activity navigates; tapping the name still opens the inspector sheet.
- [ ] Pure tests cover the contributing-set filter (split parent vs child, on-budget transfer, off-budget-leg transfer, month bounds, other envelope). No React component tests.
- [ ] `npm run test:unit`, lint, typecheck; `npm run smoke` with the dev server up; browser-verified desktop and 390-wide.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-28-1356-budget-activity-register-links/` with:

- **plan.md** — this plan (**Status: active**)
- **shape.md** — shaping notes
- **standards.md** — references, not copies; pin `154ded766693b30f8376199159a6eb5b350415d7`
- **references.md** — governing specs and code studied
- **visuals/** — none; Actual is the reference

## Task 2: Activity Register query

Extend `RegisterViewId` with `"activity"` and parse `category` (envelope id) + `month` (`YYYY-MM` → MonthKey).

`viewRows` for this view returns the D3 contributing set. Prefer one shared predicate with `activitySince` rather than a second copy of the transfer/split/on-budget rules — `categoryAssignableIds` is the transfer half; compose month + envelope + money-row/split + pending on top.

Default filters (chips): Category options-filter of the envelope name; Date custom `gte` first of month AND `lte` last of month. Empty copy as in D6.

Unit tests in `registerQuery.test.ts` (and a small href/query helper test): contributing-set cases in D3; invalid month/category degrade; amounts of returned rows sum to the envelope's Activity for that month on a fixture that matches `activitySince` semantics.

`FINANCE_VIEWS` may list Activity only while the URL is that view (label = envelope name + month). Picking All Transactions drops `view` / `category` / `month`. Do not write `activity` into the persisted default view id.

## Task 3: Budget Activity links

`budgetColumns.tsx` Activity cell: `<Link>` (or equivalent) with the href from Task 2. Keep tabular/muted-when-zero styling. Stop the click from selecting the row or opening the inspector (`stopPropagation` as needed). Inspector Activity `<dd>` is the same link.

`BudgetView` already has the current month key — pass it into column ctx. Do not await extra searchParams on the Register server page.

Phone: Activity control `min-h-tap` below `md`. Name tap / Enter still opens the sheet.

## Task 4: Verify, freeze spec, update roadmap

Walk `/finances/budget` → Activity on a spending envelope, a bill, a $0.00 cell, and the inspector line. Confirm the Register list and that amounts sum to the number. Back. Page-bar Register is not stuck on the view. 390-wide: Activity navigates, name opens the sheet. Group/income still plain.

`npm run test:unit`, lint, typecheck, `npm run smoke`. Postgres up if any integration file was touched.

Update plan/shape for as-built drift; fill **Changes from original plan**. Mark **Status: frozen / complete** (date). Follow-ups (not this spec): group/section spent links, Income received, Insights chart drill-down.

Roadmap: short note under the shipped Budget line that Activity drills to the filtered Register.

---

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
