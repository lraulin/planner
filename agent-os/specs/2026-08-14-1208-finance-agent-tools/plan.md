# Finance agent tools over the MCP API

**Status: frozen / complete** (2026-08-14)  
Spec folder: `agent-os/specs/2026-08-14-1208-finance-agent-tools/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-09-1130-agent-tool-contracts/` — typed Zod
  registry, strict schemas, effects metadata, focused discovery, compact outputs.
- **Extends:** `agent-os/specs/2026-08-13-1730-remote-mcp-transport/` and
  `agent-os/specs/2026-08-13-1805-mcp-oauth/` — new tools ride the existing
  transport unchanged.
- **Extends:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` —
  every number these tools return is the dashboard's number, computed by the
  dashboard's code. Nothing here supersedes it.

## Context

The MCP server exposes tools across outline, notes, schedule, planning and
metrics — and nothing from Finances. The module holds years of classified
transactions, statement APRs, declared recurring bills, and a 1,500-line
analytics library. An agent connected to Planner today cannot see a cent of it.

The question this exists to answer, in the user's words:

> "It looks like we've been at negative cashflow for the last two years. It
> doesn't seem like it, as I've been paying off the credit cards. Have I only
> been able to do that due to the occasional gifts from family? … help analyze
> my spending and understand my options for achieving positive cash flow."

That single question needs five distinct reads — the cash-flow series with its
baseline/one-off split, the debt trajectory and what it costs to carry, the
ranked spending, the annualized recurring commitments (the actual levers), and
the ability to drill into named transactions to test the "family gifts"
hypothesis. This spec adds exactly those, read-only.

## Decisions

- **Six read tools**, `domain: "finances"`, `exposure: "domain"`,
  `effects: read`.
- **Writes are out of scope.** The agent advises; classification stays a human
  act in the UI. A later delta can add `set_transaction_flags` /
  `declare_recurring_bill`.
- **Integer cents**, field names suffixed `Cents`, matching `analytics.ts` and
  the whole module. Schema field descriptions state the unit.
- **One source of truth.** The dashboard's composition is extracted into
  `src/lib/finances/insightsAnalysis.ts` and called by both `InsightsView` and
  the tools. The agent must never quote a number the page does not show.
- **Search filters in JS** over `loadInsightsRows`, not SQL, because the
  predicates are _effective_ values (`coalesce(flow_override, derived_flow)`
  etc.) that only `analytics.ts` defines.
- **No tool returns raw rows** except `search_transactions`, which paginates
  (default 50, max 200). Everything else is bounded aggregates.
- **Out of scope:** Sankey layout and cadence _candidates_ — both are UI
  affordances, not analysis. Budgets/envelopes remain deferred per the roadmap.

### Why extract rather than duplicate

`InsightsView` composes ~70 lines of analytics inside a `useMemo`: filter →
resolve window → build buckets → `cashFlow` over **full** history then slice →
detect recurring on the window but read declared amounts from the whole history
→ `baselineSplit` → categories, merchants, trends, asset/debt, contributions.
Every one of those has a non-obvious rule attached, and each rule is exactly
what an independent tool-side composition would get subtly wrong. That logic
also belongs in `src/lib/**` under `development/clean-code` regardless of this
feature.

The extraction is a pure move: `analyzeInsights(rows, bills, options)` returns
the same object the `useMemo` returns today, minus `sankey` and `drilled`,
which are presentation and stay in the component. Coverage reads unfiltered
rows and stays in the view (and in `get_finance_overview`) as
`coverageGap(rows)`.

## The six tools

**1. `get_finance_overview`** — orientation, no window. Accounts with
`balanceCents`, kind, institution, transaction count and closed date; the
imported history range and row count; `unclassifiedCount`; the `coverageGap`
(the agent **must** know about the pre-itemized blind spot before it draws
conclusions from category totals); the category vocabulary from
`insightsFilterOptions`; headline carrying cost. This is finance's
`get_context`.

**2. `get_cash_flow`** — the headline tool. Args: `window`
(`3m|6m|12m|24m|ytd|qtd|all`, default `12m`) or explicit `from`/`to`; `axis`
(`month|pay-period`, default `month`; `pay_period` is accepted as an alias);
`levelRecurring` (default false); optional `accountIds` / `categories` /
`merchants`. Returns the resolved range, per-bucket
`income/spend/fixed/variable/net` plus the trailing-12 overlay, window totals,
the `IncomeBreakdown`, and the `BaselineSplit` with its named one-off events.
The description states that `baselineCents` and `oneOffCents` are two numbers
and must never be blended.

**3. `get_spending_breakdown`** — same window/filter args plus `by`
(`category|merchant`, default category), `limit` (default 20, max 100),
`trend` (default false → adds per-bucket spend for the top categories).
Returns ranked `{ name, cents, share, count }`, `totalSpendCents`,
`otherCents`, and the returned/total counts.

**4. `list_recurring_bills`** — the lever list. Window arg (default `12m`) plus
`includeUpcoming` (default true). Returns `recurringMerchants` — detected and
declared alike — the annual total, and `upcomingBills`. Detection runs on the
window; declared bills read amounts from the whole history, exactly as the
dashboard does.

**5. `get_debt_summary`** — "am I actually paying off the cards, and what is it
costing?" Window arg. Returns `assetDebtSeries` per bucket, the latest
snapshot with `debtToAssetRatio`, `accountContributions` over the range, and
`loadCarryingCost` per-account with totals.

**6. `search_transactions`** — the drill-down that tests a hypothesis. Args:
`query` (case-insensitive substring over description), `from`, `to`,
`accountId`, `category`, `flow`, `direction` (`income|spend|any`), `minCents`,
`maxCents` (on absolute amount), `offset`, `limit`. Returns compact rows plus
`pageInfo` and `matchedIncomeCents` / `matchedSpendCents` / `matchedNetCents`
over the **whole** match set, so "did the family gifts cover the gap" is one
call and not fifty. This exceeds the standard's ~8-parameter guideline; it is
the "strict general-purpose escape hatch" that standard explicitly permits.

## Acceptance criteria

- [x] Six finance tools appear in `tools/list` over MCP and in `list_tools`
      with `domain: "finances"`.
- [x] `get_cash_flow` over the same window and axis returns figures identical
      to the Insights page, including the trailing-12 overlay on the first
      visible bucket.
- [x] `get_finance_overview` reports the coverage gap, and
      `get_spending_breakdown`'s description warns the reader about it.
- [x] `search_transactions` paginates and returns income/spend/net over the
      whole match set, not the page.
- [x] A second user gets empty results from all six tools against the first
      user's data.
- [x] `InsightsView` renders unchanged after the extraction.
- [x] Unknown fields are rejected with a message naming the field.

## Changes from original plan

No material requirement, design, or scope changes were needed during
implementation.

## Code map (as built)

| Concern                      | Location                                |
| ---------------------------- | --------------------------------------- |
| Dashboard composition        | `src/lib/finances/insightsAnalysis.ts`  |
| Transaction search predicate | `src/lib/finances/transactionSearch.ts` |
| Tool handlers                | `src/lib/agent/financeTools.ts`         |
| Schemas                      | `src/lib/agent/contracts.ts`            |
| Registry + discovery         | `src/lib/agent/tools.ts`                |
| MCP orientation sentence     | `src/lib/agent/mcp.ts`                  |
| Generated docs               | `docs/agent-api.md`                     |

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-14-1208-finance-agent-tools/` with `plan.md`
(**Status: active**, this document, with an empty _Changes from original
plan_ table), `shape.md`, `standards.md`, and `references.md`.

## Task 2: Extract the dashboard composition into `src/lib`

- New `src/lib/finances/insightsAnalysis.ts`: `analyzeInsights(rows, bills,
options)` where options are `{ filter, window, axis, levelRecurring, today,
range? }`. Body is the `useMemo` in `InsightsView`, moved verbatim minus
  `sankey`, `drilled` and `coverage`.
- `InsightsView` calls it and layers `sankey` / `drilled` / `coverage` on top.
  **No behavior change** — `npm run smoke` is mandatory after it.
- `src/lib/finances/insightsAnalysis.test.ts`: a fixture history exercising
  the rules the comments call out — trailing average computed from full
  history but reported for the window, a declared yearly bill surviving a
  narrow window, baseline vs one-off staying two numbers, pay-period axis vs
  month axis.

## Task 3: Transaction search predicate

- New `src/lib/finances/transactionSearch.ts`: pure `searchTransactions(rows,
filter)` over `AnalyticsRow[]`, reusing `effectiveCategory` /
  `effectiveMerchant` / `effectiveFlow` / `spendCentsOf` / `incomeCentsOf`.
  Returns the matched rows plus the three aggregate totals over the full
  match set (computed before pagination).
- `transactionSearch.test.ts` beside it: substring case-insensitivity, amount
  bounds on the absolute value, `direction` against effective flow, aggregates
  spanning a page boundary, empty filter meaning "everything".

## Task 4: The six tool handlers

- New `src/lib/agent/financeTools.ts`, one exported handler per tool, following
  `metricTools.ts`: parse with the helpers in `agent/parse.ts`, page with
  `agent/pagination.ts`, throw `AgentError`, take `userId` first and pass it
  to every query. Data comes from `dashboardQueries.ts`, `queries.listAccounts`,
  and the two new lib modules. **No SQL in this file.**
- Add a shared window/filter argument parser here, used by tools 2–5, so a
  window means the same thing in all four.

## Task 5: Register the tools

- `src/lib/agent/contracts.ts`: strict input + output schemas for all six; add
  `"finances"` to the `list_tools` domain enum; add field descriptions to
  `fieldDescriptions` in `tools.ts` for the new argument names, stating that
  `*Cents` values are integer cents.
- `src/lib/agent/tools.ts`: add `"finances"` to `AgentToolDomain` and the
  `listTools` domain cast; six `defineTool` entries with `summary` /
  `useWhen` / `avoidWhen` / `returns` written as _selection instructions_.
- `src/lib/agent/mcp.ts`: extend the `instructions` string with one sentence
  pointing money questions at `get_finance_overview`.

## Task 6: Tests, docs, smoke

- `src/lib/agent/financeTools.integration.test.ts` — real Postgres, and a
  second user must attempt every one of the six tools against the first user's
  data and get nothing back. Seeds accounts, transactions, a statement and a
  declared bill.
- Extend `src/lib/agent/tools.test.ts` / `mcp.test.ts` / the MCP route test
  for the new catalog size (26 → 32).
- `npm run agent:docs` to regenerate `docs/agent-api.md`.
- Add the six read tools to `scripts/smoke-agent.mjs`.

## Task 7: Verify, freeze, roadmap

Confirm acceptance criteria, record any material drift in _Changes from
original plan_, mark `plan.md` / `shape.md` **frozen / complete**, and note
the Finances agent surface under roadmap § Financial planning.

> While this spec is **active**, when we make a material change to
> requirements, design, or scope (including from feedback on what was
> implemented), update the relevant sections and append to **Changes from
> original plan**. Skip pure implementation details. Freeze when verified.
