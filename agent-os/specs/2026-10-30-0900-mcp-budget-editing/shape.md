# MCP budget editing — Shaping Notes

**Status: in review** (2026-10-30). Written alongside the build, not before it.

## Scope

Give the MCP / agent API the budget edits Lee makes on the Budget page, through the
same `src/lib/finances/**` mutations the page uses:

- read one budget month inside the 16 KB response budget;
- create and rename groups and envelopes (spending, bill, savings, income);
- set or adjust an envelope's Assigned in a month;
- move Assigned between envelopes;
- recategorize transactions, and split or unsplit one;
- hide or unhide an envelope.

Nine tools: `get_budget_month`, `create_budget_group`, `update_budget_group`,
`create_budget_envelope`, `update_budget_envelope`, `set_budget_assignment`,
`move_budget_money`, `set_transaction_category`, `split_transaction`.

### Out of scope

- Deleting groups or envelopes (the page's delete re-files money and transactions; too
  much to do blind).
- Hiding groups, moving groups between parents, reordering.
- Goals / targets, bill schedules, income roles, carryover and snooze.
- Budget setup (presets). The tools refuse until the page has set the budget up.
- A schema change. None is needed: `hidden` and split rows already exist.

## Decisions

- **D1 — Reuse, don't re-derive.** Every write goes through the existing mutation
  (`createCategoryGroup`, `createBudgetCategory`, `updateBudgetCategory`,
  `renameCategoryGroup`, `performBudgetOperation`, `setTransactionBudgetCategories`,
  `splitTransaction` / `updateSplitChildren` / `unsplitTransaction`). The read folds the
  budget with `loadBudget` and orders rows with `budgetRows` + `sectionGridRows`, so the
  agent sees envelopes in page order with the page's hidden rules. Two small options were
  added to the mutations rather than copying them: `auditOrigin` (audit events read
  "Agent", not "Register" / "Budget") and `exact` on `performBudgetOperation` (D4).
- **D2 — Compact month, paged envelopes.** `get_budget_month` returns the month summary,
  visible groups, income rows and one compact row per expense envelope (assigned,
  activity, available, goal when set). No notes, bill schedules, targets or term
  breakdowns. Expense envelopes page at 50 by default, 60 max. A fixture shaped like
  Lee's real budget (50 envelopes, 13 groups, seven-digit figures) fits on one page under
  16 KB; a 60-row page of long names stays under the 20,000-byte gateway cap. The page's
  own row shape for the same fixture is over the cap, which is why the compact shape
  exists.
- **D3 — Months are refused, not clamped.** `loadBudget` clamps an out-of-range month to
  the nearest one; a write silently landing in a different month is wrong for an agent,
  so the tools refuse with the budget's first and last month instead.
- **D4 — Moves are exact and all-or-nothing.** The page's Move dialog clamps a transfer
  to what the source has available. `move_budget_money` passes `exact: true`, so a move
  larger than the source's available balance is refused with
  "<Envelope> has $X available in <Month>; move at most that." and nothing is written.
  An envelope already overspent (available ≤ $0) cannot be a source. Both allocation rows
  and the audit event are written in one transaction, so a move lands whole or not at
  all. The availability check reads the folded month before the transaction opens; a
  concurrent edit between the read and the write could let a move take an envelope
  slightly negative. That is the same window the page has, and a single-user app makes it
  theoretical; closing it would mean locking allocation rows and re-folding inside the
  transaction.
- **D5 — Assign follows the page.** `set_budget_assignment` takes exactly one of
  `amountCents` (the new Assigned) or `adjustCents` (a delta). Assigned below $0 is
  refused. Assigning more than Ready to Assign is allowed, as on the page, and comes back
  with a warning naming the negative Ready to Assign. Income envelopes are refused: income
  is received, not assigned.
- **D6 — Duplicate names are a conflict.** Group and envelope names are checked
  case-insensitively among siblings before the write. The database only enforces part of
  this (root envelopes have a NULL group, which a unique index does not compare).
- **D7 — Recategorizing keeps the register's side effects.** `set_transaction_category`
  calls the same mutation as the register, so payee auto-category learning happens for
  agent edits too. Split parents and unknown ids come back in `skipped` with a reason
  rather than failing the batch.
- **D8 — `split_transaction` states the whole answer.** The lines given replace the
  current split; an empty list unsplits. Lines must sum to the transaction. A retry lands
  the same state, so the tool is retry-safe. A first line with no envelope inherits the
  row's envelope, as on the page.

## Context

- **Visuals:** None
- **References:** see `references.md`
- **Product alignment:** the agent can do the monthly budget pass (fund, move, file)
  without the Budget page open.
