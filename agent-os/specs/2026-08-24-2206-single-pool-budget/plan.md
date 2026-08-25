# One pool, every dollar assigned

**Status: active**
Spec folder: `agent-os/specs/2026-08-24-2206-single-pool-budget/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — Actual-derived
  envelope arithmetic, integer-cent invariants, opening-position base case, and
  transfer-neutral activity.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — the envelope budget is the
  only budgeting system and Ready to Assign is its headline.
- **Extends:** `agent-os/specs/2026-08-24-0930-envelope-sections/` — Savings is a required
  envelope section/type whose envelopes otherwise behave like ordinary expense envelopes.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — assigning is how
  every dollar receives a job; automatic options remain clamped to Ready to Assign.
- **Supersedes:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` **D3** — savings is
  no longer outside the budget. Checking, savings, cash, and credit cards are one mandatory
  on-budget pool. It also narrows **D2's opening-position immutability**: opening remains
  fixed except for a deliberate account-boundary transition, which rebases it exactly once.
- **Supersedes:** `agent-os/specs/2026-08-18-2005-period-result/` **D3–D7** — a savings
  withdrawal is no longer a raid to score or excuse. The Period Result scorecard and
  `planned_withdrawal` flag retire. `event_label` remains for its independent one-off
  Insights meaning.

## Context

The first Finances model treated savings as money removed from day-to-day budgeting. Ready
to Assign therefore grew from this month's income and a narrow checking/cash/card position,
while moving money to savings represented intent physically. That custom approach was close
to useful, but it has been superseded by the zero-balance budget now at the center of the app.

The zero-balance rule is simpler and stricter: **give every dollar a job**. Account location
does not give money a job; an envelope does. Checking and savings balances, less credit-card
debt, are current money in one pool. Moving money between those accounts changes where it is
held, not whether it is available to the budget. Savings intent belongs in Savings envelopes,
which the app already models as a mandatory peer section.

The current implementation carries both models at once. Savings defaults off-budget; account
membership can be changed without rebasing the budget opening; current Ready to Assign is a
fold of opening, income, assignments, and carryover rather than a reconciliation to today's
account pool; setup and account copy teach the old boundary; and Period Result explicitly
penalizes savings withdrawals. Those are repeated consequences of one wrong model, so this
spec changes the model and removes the remnants together.

## Decisions

### D1 — Core cash and debt accounts are always on-budget

The mandatory budget pool includes every account whose kind is:

- `checking`
- `savings`
- `cash`
- `credit_card`

For those kinds, `offBudget` is always `false`. This is one shared domain rule used by account
creation/import, account editing, budget queries, dashboard position queries, and cutover code.
The database enforces the same invariant with a generated CHECK constraint so a forgotten
caller cannot recreate the split model.

`investment`, `loan`, and `other` accounts remain flexible. They may be included when they
represent money or debt the user wants the budget to govern, or excluded when they are tracking
accounts. Existing flexible-account choices are preserved. New investment and loan accounts
default off-budget; other accounts retain their current default unless explicitly chosen.

Closing an account does not remove a non-zero balance or its history from the pool. A core
account remains on-budget while closed. Zeroing, transferring, or otherwise reconciling its
balance is a separate financial action.

### D2 — The current account pool uses one working-balance definition

`accountPoolCents` is the signed sum of all on-budget account working balances. Positive asset
balances add to it and negative credit-card/debt balances subtract from it naturally; callers
must not apply `abs` or kind-specific sign inversions.

The working balance includes the same selected pending transactions as the Dashboard. Pending
selection and headline anchoring must live in shared finance-domain logic, not be independently
reimplemented by the Budget and Dashboard. An on-budget-to-on-budget transfer—including a
checking/savings transfer or a credit-card payment—is neutral. A transfer crossing the budget
boundary is activity in the on-budget account.

Rename `BudgetData.onBudgetPositionCents` to `accountPoolCents`. Retire copy and symbols that
still call only checking/cash “spendable” or savings a separate quasi-pool; split or rename
`src/lib/finances/available.ts` so surviving balance and pending helpers describe the one-pool
model.

### D3 — Current Ready to Assign reconciles exactly to the pool

The existing month fold remains the source of envelope balances, assigned amounts, categorized
activity, overspending, carryover, and held-for-next-month money. Let `baseRtaCents` be the Ready
to Assign that fold produces before current-position reconciliation.

For the current month only:

```text
accountReconciliationCents =
  accountPoolCents
  − (baseRtaCents
     + totalEnvelopeBalanceCents
     + heldForNextMonthCents
     + uncategorizedActivityCents)

readyToAssignCents =
  baseRtaCents
  + uncategorizedActivityCents
  + accountReconciliationCents
```

Therefore the load-bearing identity is always:

```text
accountPoolCents =
  readyToAssignCents
  + totalEnvelopeBalanceCents
  + heldForNextMonthCents
```

The current month's signed `uncategorizedActivityCents` is named as a Ready to Assign term until
those transactions receive envelopes. `accountReconciliationCents` is a separate named term for
the residual between ledger-derived budget history and today's working account position—for
example an opening snapshot difference or bank-headline/ledger mismatch. Neither discrepancy is
hidden in “income.” `BudgetMonth` exposes both signed terms so the summary can explain the
headline exactly.

Past months stay historical: their displayed Ready to Assign is not rewritten to today's bank
headline. The reconciled current result is the amount carried into future months, so navigating
forward does not resurrect the old discrepancy.

### D4 — Savings is budget intent, not an account boundary

The Savings section/type remains mandatory and permanently visible, including when empty.
Both Minimal and Detailed setup presets seed a default Savings envelope. A Savings envelope row
is ordinary user data: it may be renamed, hidden, moved within the Savings section, or deleted.
The section/type is protected; an individual seeded row is not.

Setup, account, Budget, Income, and Ready to Assign copy consistently teach:

- Ready to Assign is unassigned money from all on-budget accounts, not only this month's income.
- Moving money to a savings account does not assign it.
- Assigning money to a Savings envelope gives it a savings job.
- Credit-card debt reduces the pool; card payments between on-budget accounts do not change it.

### D5 — Account-boundary changes rebase opening exactly once

Changing which accounts participate without changing `openingCents` corrupts every later month.
All boundary changes therefore use one transactional domain operation:

1. Determine the account's signed position immediately before the budget start month, using the
   shared working-balance/pending semantics and historical ledger walk.
2. Add that position to `openingCents` when the account enters the pool, or subtract it when a
   flexible account leaves.
3. Change `offBudget` in the same transaction.
4. Record enough before/after data to prove the pool identity and make retries harmless.

Core accounts cannot leave. A kind edit that changes a flexible account into a core kind forces
it on-budget through this operation. New on-budget accounts created after budgeting began use
the same operation after their imported ledger is present. Repeated imports do not rebase again:
the transition is tied to account creation or an actual membership change, not to seeing the
account in another import.

For existing data, ship an explicit user-scoped cutover with dry-run and apply modes. For every
off-budget savings account, it computes the pre-start position, adds it to opening, and flips the
account on-budget in one transaction without changing allocations or transaction categories.
Checking/savings transfers become neutral through query semantics; no ledger rows are rewritten.

The cutover receipt includes, before and after: affected account ids and positions,
`openingCents`, account pool, Ready to Assign, total envelope balances, held amount,
uncategorized activity, and reconciliation. It aborts and rolls back on malformed data,
cross-user ownership, a non-integer amount, or a failed pool identity. A second run reports no
transition and makes no changes. The generated schema migration adding the core-account CHECK is
applied only after this cutover and intentionally refuses any incompatible row that remains.

### D6 — Retire the pre-envelope success score and its exception flag

Delete the Dashboard Period Result scorecard and its period-result calculation. Its core premise
was that savings is outside ordinary money and a withdrawal is evidence of failure; that premise
now contradicts D1 and D4. The budget itself answers whether all current money has jobs and where
tradeoffs are being made.

Drop `finance_transactions.planned_withdrawal` with a generated migration and remove the field
from mutations, query DTOs, agent mappings, analytics inputs, fixtures, and tests. Preserve
`event_label`, the one-off Insights behavior it supports, and unrelated historical balance
helpers only if they still have a live caller. Remove dead Period Result UI and roadmap language
rather than relabeling the old score.

## Out of scope

- Goal templates or automated funding priorities beyond the already-shaped Assign options.
- A special YNAB-style credit-card payment envelope. Actual's transfer-neutral card model remains.
- Making investment, loan, or other accounts mandatory members of the pool.
- Rewriting historical month headlines from today's account balance.
- Protecting the seeded Savings envelope row from ordinary editing or deletion.
- General bank reconciliation workflows beyond exposing the signed current reconciliation term.

## Acceptance criteria

- [ ] Checking, savings, cash, and credit-card accounts cannot be stored or edited as
      off-budget; investment, loan, and other accounts retain an explicit membership choice.
- [ ] The current `accountPoolCents` uses the same selected pending rows and signed balances as
      the Dashboard.
- [ ] Current month `Ready to Assign + envelope balances + held = account pool` to the cent,
      whether activity is categorized, uncategorized, pending, or affected by a headline/ledger
      mismatch.
- [ ] The Ready to Assign summary names signed uncategorized activity and account reconciliation
      separately and its displayed terms add to the headline.
- [ ] Categorizing a transaction moves its effect from the uncategorized term into its envelope
      without changing the one-pool identity.
- [ ] Checking↔savings transfers and credit-card payments are budget-neutral; transfers across
      an on/off-budget boundary affect the budget once.
- [ ] Both setup presets contain a Savings envelope, and the required Savings section stays
      visible when it has no rows; the seeded row remains editable and deletable.
- [ ] Account/setup/Budget copy no longer says savings is excluded or that Ready to Assign is
      only this month's income.
- [ ] The guarded cutover rebases each existing off-budget savings account exactly once,
      preserves allocations and categories, emits a complete receipt, and rolls back on an
      invariant failure.
- [ ] Creating an on-budget account after budget start and changing a flexible account's
      membership each adjust opening once; retrying an import does not repeat the adjustment.
- [ ] Cross-user integration tests prove another user cannot inspect or trigger an account
      rebase or cutover against the owner's rows.
- [ ] Period Result and every `plannedWithdrawal` / `planned_withdrawal` path are gone while
      `eventLabel` / `event_label` and one-off Insights still work.
- [ ] Frozen predecessor specs remain unchanged; current product docs and Actual divergence
      notes describe the single-pool model.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change | Why |
| --- | ------ | --- |

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-24-2206-single-pool-budget/` with:

- `plan.md` — this plan, **Status: active**, with the relationships and empty change log.
- `shape.md` — problem, confirmed scope, decisions, migration guardrails, and exclusions.
- `standards.md` — links to the canonical standards that govern implementation.
- `references.md` — governing specs, Actual Budget sources, and likely code touchpoints.
- No `visuals/` directory; no visual references were supplied or needed.

## Task 2: Establish one account-pool domain model and reconcile RTA

- Add shared account-membership/default helpers and shared working-balance/pending selection
  logic under `src/lib/finances/**`; give each pure rule named unit tests.
- Rename `onBudgetPositionCents` to `accountPoolCents` through the budget data contract.
- Extend the pure budget fold with current-month uncategorized and reconciliation inputs/terms,
  preserving historical folds and carrying the reconciled result forward.
- Add named tests for the identity, signed debt, pending selection, categorization, past/current/
  future behavior, and both kinds of transfers.

## Task 3: Enforce membership and migrate existing data safely

- Enforce core kinds at every write path and with a generated database CHECK; retain the
  flexible-kind toggle and defaults.
- Build the user-scoped dry-run/apply savings cutover with atomic rollback, idempotency, detailed
  receipts, and cross-user integration coverage.
- Route later account creation, kind edits, and flexible membership transitions through the same
  one-time opening-rebase operation. Cover repeated imports and account closure.
- Generate migrations for the CHECK and eventual `planned_withdrawal` removal only after the
  data cutover precondition is satisfied; never hand-write migration metadata.

## Task 4: Align setup, Budget, Accounts, and Dashboard

- Fix both presets, preserve the permanent Savings section, and update explanatory copy.
- Make core membership read-only/implicit in account editing while flexible kinds retain an
  explicit On budget control with a clear consequence.
- Render the account pool and exact Ready to Assign terms consistently. Replace old
  `available.ts` vocabulary with focused one-pool balance/pending modules shared by Dashboard and
  Budget.
- Keep components presentational; all arithmetic and eligibility rules stay in `src/lib/**`.

## Task 5: Remove the old savings-boundary system

- Remove Period Result UI/calculation/tests and all `plannedWithdrawal` schema, DTO, query,
  mutation, analytics, agent, fixture, and test remnants; preserve independent `eventLabel` use.
- Search user-facing copy, symbols, comments, tests, docs, and roadmap entries for the old
  checking-only/savings-excluded model and update or remove each live remnant.
- Update `docs/actual-budget/README.md` with the narrowed divergences and
  `agent-os/product/roadmap.md` with this delta and retired scorecard.

## Task 6: Verify, cut over, and freeze

- Run focused unit and database integration tests, confirming Postgres tests did not skip, then
  `npm run lint`, `npm run typecheck`, the full unit gate, and production build.
- Start Planner and run `npm run smoke`. In a real browser/file, verify setup, current and future
  RTA, an uncategorized transaction, categorization, checking↔savings, a card payment, flexible
  membership, closing a core account, and an empty Savings section.
- Run cutover dry-run, inspect the real receipt, apply it, and prove the pool identity before and
  after. Preserve the receipt without exposing sensitive transaction detail.
- Update this active spec for material as-built drift, complete **Changes from original plan**,
  mark it **frozen / complete**, and ensure roadmap/reference docs reflect verified behavior.

---

> While this spec is **active**, material changes to requirements, design, or scope—including
> feedback from real use—must update the authoritative sections and append to **Changes from
> original plan**. Skip pure implementation details. Freeze only after verification.
