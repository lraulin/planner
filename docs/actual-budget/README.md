# Actual Budget reference

**Source of truth for zero-based/envelope budgeting semantics** in this app. Consult it before
inventing budget behaviour or deliberately diverging from it.

Unlike [`docs/achieve-planner/`](../achieve-planner/README.md), this is not a scraped archive:
Actual Budget is open source and the repository itself is the reference. Clone it beside this
one:

```
git clone https://github.com/actualbudget/actual ../actual
```

**Licence: MIT** (© James Long). Code may be read, copied and adapted freely; the licence notice
travels with anything derived from it. Modules here that reproduce Actual's logic say so in a
header comment naming the source file.

We reimplement rather than port. Actual's budget layer is a local-first reactive spreadsheet over
SQLite with CRDT sync; ours is Next.js server components over Postgres with Drizzle. **The
semantics transfer; the machinery does not.**

## Where the semantics live

| Concern                                                                                                                                                                                                                                                                | File in `../actual`                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Balance, carryover and To Budget formulas**                                                                                                                                                                                                                          | `packages/loot-core/src/server/budget/envelope.ts`                                                                                                        |
| Per-category monthly activity; the on-budget filter                                                                                                                                                                                                                    | `packages/loot-core/src/server/budget/base.ts`                                                                                                            |
| **Movement operations and their clamps** — cover overspending, transfer, hold for next month                                                                                                                                                                           | `packages/loot-core/src/server/budget/actions.ts`                                                                                                         |
| Budget table shapes (`zero_budgets`, `zero_budget_months`)                                                                                                                                                                                                             | `packages/loot-core/migrations/1632571489012_remove_cache.js`                                                                                             |
| `categories` / `category_groups`                                                                                                                                                                                                                                       | `packages/loot-core/src/server/sql/init.sql`                                                                                                              |
| Integer-cents assertion                                                                                                                                                                                                                                                | `packages/loot-core/src/shared/util.ts` (`safeNumber`)                                                                                                    |
| Tracking (non-envelope) budget, for contrast                                                                                                                                                                                                                           | `packages/loot-core/src/server/budget/tracking.ts`                                                                                                        |
| **Goal templates** — Actual's `goal_def` / `runSimple` / `runBy` / `runPeriodic` **no longer govern this app**. Envelope arithmetic, the Apply/Overwrite gesture, and schedule sinking still do. Our target engine is YNAB-shaped: `src/lib/finances/budget/targets/`. | `packages/loot-core/src/server/budget/{goal-template,category-template-context,schedule-template}.ts`, `packages/loot-core/src/types/models/templates.ts` |
| **Schedules** — recurrence, status, skip, next-date cursor, discover                                                                                                                                                                                                   | `packages/loot-core/src/shared/schedules.ts`, `packages/loot-core/src/server/schedules/{app,find-schedules}.ts`                                           |
| **Payees** — identity, aliases, merge behavior and stable-id commitment/schedule matching                                                                                                                                                                              | `packages/loot-core/src/server/accounts/{payees,sync}.ts`, `packages/loot-core/src/server/db/index.ts`                                                    |
| Rules and rule editor (first-match categorisation; payee claims still own commitment matching)                                                                                                                                                                         | `packages/loot-core/src/server/rules/`                                                                                                                    |
| Budget UI and menu vocabulary                                                                                                                                                                                                                                          | `packages/desktop-client/src/components/budget/envelope/`                                                                                                 |
| Cell → UI naming crib                                                                                                                                                                                                                                                  | `packages/desktop-client/src/spreadsheet/bindings.ts`                                                                                                     |
| **Amount entry** — evaluating a typed expression, and formatting a cell for and from edit                                                                                                                                                                              | `packages/loot-core/src/shared/arithmetic.ts`, `packages/desktop-client/src/hooks/useFormat.ts`                                                           |
| Their own docs                                                                                                                                                                                                                                                         | `packages/docs/docs/`                                                                                                                                     |

## Reading order (for agents)

1. **`envelope.ts` first.** Every budget number in this app is one of those formulas. Our
   restatement of them, with the five traps that make them easy to get wrong, is D1 of
   `agent-os/specs/2026-08-22-1948-zero-based-budget/plan.md`.
2. **`actions.ts`** for what each UI affordance is allowed to do. The clamps are the semantics.
3. **`base.ts`** only when the question is _which transactions count_ — the on-budget filter and
   the month rollup.

## Where we diverge

Divergences are recorded in the spec that makes them, not here. As of the first budget spec,
narrowed by later deltas:

- Checking, savings, cash and credit cards are a **mandatory** on-budget pool. Actual lets
  the user pick any account's membership; this app does not, because the product has a
  declared one-pool invariant. Investment, loan and other stay optional. See
  `agent-os/specs/2026-08-24-2206-single-pool-budget/` D1.

  **Credit cards are the one place we keep Actual's model over YNAB's, on preference rather
  than inertia.** A card balance is simply negative money in the one pool, which
  `accountPoolCents` subtracts naturally — no `abs`, no kind-specific sign inversion. YNAB's
  payment categories and cash-vs-credit split buy nothing here and would cost an envelope kind
  plus a reconciliation between an envelope and a card balance. So there is no credit-card
  payment category, deliberately and permanently — not a gap awaiting a later spec. See
  `agent-os/specs/2026-08-28-2223-target-snooze/` D7.

- Current Ready to Assign reconciles to today's working account pool (same pending
  selection as the Dashboard). Uncategorized activity and residual account reconciliation
  are named terms, not income. Historical months stay historical. See that spec's D3.
- The budget starts at a chosen month with an opening position, instead of assuming the ledger
  goes back to the beginning. Changing the pool boundary rebases that opening once.
- No CRDT, no tombstones, no local-first sync.
- Recurrence for a bill envelope is derived from charge history (`nextDueFrom`) rather
  than a stored `RecurConfig` cursor — a missed or early charge self-corrects instead of
  needing an explicit skip. See `agent-os/specs/2026-08-23-2313-one-budget/` D2.
- **Assign is YNAB-shaped, not Actual's Apply/Overwrite.** The fill _gesture_ clamps to
  Ready to Assign, previews a shortfall or a multi-envelope split (a single fully funded
  envelope writes immediately), and offers eight auto-assign options. Apply may no longer
  drive Ready to Assign negative. See
  `agent-os/specs/2026-08-24-1311-budget-assign-options/`.
- **The target engine is YNAB's, not Actual's.** One target per envelope, with behaviour
  (`add` / `upTo` / `balance`) and cadence as explicit axes. `goal_def`, `runSimple`,
  `runBy`, `runPeriodic`, the priority loop, and `remainder` no longer govern what an
  envelope asks for. Envelope arithmetic, Apply/Overwrite, and schedule sinking (yearly /
  quarterly bills) are still Actual's. See
  `agent-os/specs/2026-08-28-1000-ynab-target-engine/`.
- **Monthly bills do not sink across months.** Actual's schedule template asks
  `remaining / (monthsUntilDue + 1)` when a monthly charge is due next month (half of rent
  in August). This app asks for the full amount in the due month and $0 otherwise; next
  month's rent is funded by assigning in next month. Yearly/quarterly sinking is unchanged.
  See `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` D1.
- **Rule 4 is assign-into-a-future-month, not Hold.** Actual holds a lump so it appears in
  next month's To Budget. This app subtracts later-month assignments from current Ready to
  Assign (YNAB). Hold is removed from the product; `buffered_cents` remains for leftover
  rows. See that spec's D2–D3.
- **The Budget grid's scan layer is YNAB, not Actual.** Leftover is labeled Available.
  Underfunded / funded / on-track / fully-spent show as a progress bar, status copy, and
  a colored pill with an icon. Envelope math is still Actual's; the ask is Assign's
  `neededAssigned`. Actual colors leftover by sign and puts goal status in a tooltip.
  See `agent-os/specs/2026-08-25-1310-budget-funding-indicators/`.
- **The Budget page has a YNAB-shaped inspector.** Category details (bill cadence, next
  charge, status, URL, notes, target status) live in a right pane on desktop and a
  full-screen sheet below `md`. Envelope math and bill-cadence demand stay Actual-derived.
  The Available breakdown is leftover identity (carry-in + assigned + activity), not
  YNAB's cash-vs-credit split. See
  `agent-os/specs/2026-08-25-1633-budget-inspector/`.
- **Fix This is YNAB's gesture, not Actual's.** Actual has no banner for a negative To
  Budget. Envelope arithmetic stays Actual (Assigned may go negative when leftover is
  unassigned; Available is clamped at zero). The UI — summary verb on the red number,
  Un-assign money from a month's envelopes, including a later month — is YNAB. See
  `agent-os/specs/2026-08-29-2033-budget-fix-this/`.
- **Unparseable amount entry reverts instead of committing zero.** Actual's `fromEdit`
  returns a caller-supplied default for anything it cannot read, and the budget cell's
  `onSave` turns that into `0` — so clearing a cell zeroes the envelope. This app writes
  nothing and restores the prior value; typing `0` is how you zero one. It also runs the
  **currency parser before the expression evaluator**, the reverse of `fromEdit`, so
  `(1.23)` keeps its accounting meaning of −1.23 rather than being re-read as grouping and
  flipping to +1.23. And it stops at the four functions: no `^`. See
  `agent-os/specs/2026-08-27-0757-currency-expression-entry/` D3/D4/D6.
