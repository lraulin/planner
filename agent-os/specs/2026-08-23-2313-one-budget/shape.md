# Collapse Budget, Schedules and Commitments — Shaping Notes

**Status: frozen / complete** (2026-08-24)

## Scope

Merge three parallel Finances surfaces — the envelope budget (`/finances/budget`),
Actual-style Schedules (`/finances/schedules`), and Commitments bills/recurring spend
(`/finances/commitments`) — into one page and one table. A bill becomes an envelope with
extra columns (cadence, status, URL) instead of three linked rows across three tables.
Recurring spend becomes an ordinary envelope with a template. Available to Spend and its
accrual are retired; the budget's Ready to Assign becomes the one spendable-money figure.

### Out of scope

- Redesigning envelope arithmetic itself (Ready to Assign, carryover, cover-overspending) —
  unchanged, still Actual's formulas.
- Percentage-of-income templates, income carryover / hold-for-next-month for income
  envelopes — still not shaped.
- Continuous two-way sync with an external calendar or bank schedule beyond what payee
  matching already does.
- Multi-user / sharing concerns — this is a single-user app.

## Decisions

See `plan.md` D1–D8. Summary of the two biggest calls, made in conversation:

- **"We don't have to put them in same table" meant the UI table, not the database.**
  The user confirmed a single underlying table (`finance_budget_categories` with a `kind`
  discriminator) is fine; the constraint was about not cramming unrelated concepts into
  one grid, not about schema design.
- **The parallel-systems phase is deliberately over.** Quote: "I think we're done with
  the 'build Actual Budget as a parallel system' phase... it's now time to collapse and
  integrate zero-based budgeting with the original vision." Available to Spend is
  explicitly allowed to break and be cleaned up rather than preserved.
- Recurring spend (tier 2) is explicitly retired as a concept: "Pizza and groceries and
  discretionary and whatever else can just be envelopes now."
- Bill cadence (not Actual's `RecurConfig`) wins as the one recurrence representation,
  chosen because it self-corrects from the bank feed rather than needing an explicit skip.
- Available to Spend is retired in this spec rather than kept running on re-sourced data —
  chosen specifically because "if it has to break, that's ok, and if it does, maybe we
  should clean it up."
- Review, the annualized cost columns, the Next 12 Months forecast, and the Expected vs
  Income comparison all carry over rather than being dropped, but move from permanent
  page sections to on-demand / collapsible surfaces — user's explicit ask: "keep those for
  now, maybe have them collapsable... definitely want to keep Review, but it should be
  something you can access when you need it, not necessarily a persistent major section."

## Context

- **Visuals:** None.
- **References:** See `references.md` — eleven prior specs across Commitments, Schedules
  and the envelope budget line, three of which this delta most directly collides with
  (`commitments-expected-vs-income`, `paused-bills-assignment`,
  `nested-budget-groups-bill-import`).
- **Product alignment:** `agent-os/product/roadmap.md`'s Finances section already frames
  the three systems as "fully parallel... which system survives is a later decision made
  from use, not from this spec" (zero-based-budget) and "Decide from lived use whether
  Commitments should eventually merge into or be replaced by Schedules" (nested-groups).
  This spec is that decision, made from roughly six weeks of parallel use.

## Standards Applied

See `standards.md`.

## Follow-ups (new work — not amendments to this frozen spec)

- Upgrade the Budget grid from `useGridState` to `GridToolbar` / `useModuleViews`
  (module id `finance-budget`) for saved views and export, per D6's original intent — the
  grid works without it at the current dozen columns, but the spec's own reasoning ("it
  now needs it") still applies as the column count grows.
- A **Pay period** hideable column beside A year / Monthly, once there is a clean way to
  thread payday cadence into the pure `budgetColumns.tsx` module without a database read
  per render.
