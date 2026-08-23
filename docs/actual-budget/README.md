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

| Concern                                                                                      | File in `../actual`                                                                                             |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Balance, carryover and To Budget formulas**                                                | `packages/loot-core/src/server/budget/envelope.ts`                                                              |
| Per-category monthly activity; the on-budget filter                                          | `packages/loot-core/src/server/budget/base.ts`                                                                  |
| **Movement operations and their clamps** — cover overspending, transfer, hold for next month | `packages/loot-core/src/server/budget/actions.ts`                                                               |
| Budget table shapes (`zero_budgets`, `zero_budget_months`)                                   | `packages/loot-core/migrations/1632571489012_remove_cache.js`                                                   |
| `categories` / `category_groups`                                                             | `packages/loot-core/src/server/sql/init.sql`                                                                    |
| Integer-cents assertion                                                                      | `packages/loot-core/src/shared/util.ts` (`safeNumber`)                                                          |
| Tracking (non-envelope) budget, for contrast                                                 | `packages/loot-core/src/server/budget/tracking.ts`                                                              |
| **Goal templates** — apply vs overwrite, priority loop, remainder last                       | `packages/loot-core/src/server/budget/goal-template.ts`                                                         |
| Per-template math — `runSimple`, `runBy`, the limit clamp, `fromLastMonth`                   | `packages/loot-core/src/server/budget/category-template-context.ts`                                             |
| Schedule templates — pay-this-month vs sinking, the already-funded fallback                  | `packages/loot-core/src/server/budget/schedule-template.ts`                                                     |
| The stored template shapes (`goal_def`) — dollar floats there, integer cents here            | `packages/loot-core/src/types/models/templates.ts`                                                              |
| **Schedules** — recurrence, status, skip, next-date cursor, discover                         | `packages/loot-core/src/shared/schedules.ts`, `packages/loot-core/src/server/schedules/{app,find-schedules}.ts` |
| **Payees** — identity, aliases, merge behavior and stable-id commitment/schedule matching    | `packages/loot-core/src/server/accounts/{payees,sync}.ts`, `packages/loot-core/src/server/db/index.ts`          |
| Rules and rule editor (next; direct payee claims currently own commitment matching)          | `packages/loot-core/src/server/rules/`                                                                          |
| Budget UI and menu vocabulary                                                                | `packages/desktop-client/src/components/budget/envelope/`                                                       |
| Cell → UI naming crib                                                                        | `packages/desktop-client/src/spreadsheet/bindings.ts`                                                           |
| Their own docs                                                                               | `packages/docs/docs/`                                                                                           |

## Reading order (for agents)

1. **`envelope.ts` first.** Every budget number in this app is one of those formulas. Our
   restatement of them, with the five traps that make them easy to get wrong, is D1 of
   `agent-os/specs/2026-08-22-1948-zero-based-budget/plan.md`.
2. **`actions.ts`** for what each UI affordance is allowed to do. The clamps are the semantics.
3. **`base.ts`** only when the question is _which transactions count_ — the on-budget filter and
   the month rollup.

## Where we diverge

Divergences are recorded in the spec that makes them, not here. As of the first budget spec:

- On-budget accounts are an explicit column seeded from account kind, matching this app's
  existing "checking + cash + full card balance" model.
- The budget starts at a chosen month with an opening position, instead of assuming the ledger
  goes back to the beginning.
- No CRDT, no tombstones, no local-first sync.
