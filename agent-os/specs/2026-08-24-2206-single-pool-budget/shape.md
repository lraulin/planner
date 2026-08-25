# Shaping notes — one pool, every dollar assigned

**Status: active**

## Problem statement

Ready to Assign currently inherits an earlier custom budgeting idea: this month's income and a
narrow checking/cash/card position are the spendable base, while savings is held outside the
budget. That made physical account transfers carry budget intent.

The product has since adopted zero-balance envelope budgeting. Its first rule is to give every
dollar a job, which requires one pool of current on-budget money and debt. Savings is a job
expressed by an envelope, not a bank-account exclusion. Keeping both models makes Ready to Assign
plausible-looking but wrong, and leaves copy, account controls, setup, migration behavior, and a
Dashboard scorecard teaching contradictory rules.

## Root cause

The original budget made `offBudget` mutable while treating the budget opening as immutable, and
seeded account membership from the old savings boundary. The month fold therefore has no stable
way to reconcile to the current set of accounts. Period Result repeats the same boundary by
penalizing savings withdrawals and adding a flag to excuse selected ones.

The correction is one domain model shared across storage, queries, arithmetic, and UI:

- account membership defines the pool;
- envelope assignment defines purpose;
- current Ready to Assign is the unassigned remainder of the pool;
- changing the pool boundary rebases the opening exactly once.

## Confirmed scope decisions

### Account membership

- Checking, savings, cash, and credit-card accounts are always on-budget.
- Investment, loan, and other accounts may be on- or off-budget.
- Existing flexible-account choices remain; new investments and loans default off-budget.
- A closed core account with balance/history remains part of the pool.
- The rule is enforced in shared application logic and the database, not just in the drawer.

### Ready to Assign

- The headline reconciles against the current working balance of all on-budget accounts.
- It uses exactly the same pending-row selection as the Dashboard.
- Uncategorized activity and residual account reconciliation are separate signed terms.
- The current identity is `pool = RTA + envelope balances + held`.
- Historical months are not retroactively rewritten; current reconciliation carries forward.
- Internal on-budget transfers are neutral. Boundary-crossing transfers are activity once.

### Savings envelopes

- Savings remains a required, permanently visible section/type.
- Both Minimal and Detailed presets seed a default Savings envelope.
- The section is mandatory; the seeded row is ordinary editable/deletable user data.

### Existing data

- Use a guarded automatic cutover, scoped to one user and one database transaction.
- Dry-run and apply produce before/after receipts and verify the pool identity.
- Existing off-budget savings accounts contribute their position immediately before the budget
  start to `openingCents`, then become on-budget without ledger/category/allocation rewrites.
- The transition is idempotent. Future account creation and flexible membership changes use the
  same one-time rebase rule.
- Apply the generated database CHECK only after incompatible rows have been cut over.

### Old-system cleanup

- Retire Period Result instead of redefining it.
- Drop `planned_withdrawal` throughout schema and code.
- Preserve `event_label` and its one-off Insights behavior.
- Remove checking-only, “Savings stays out,” “income this month,” and old spendable-pool language
  wherever it still governs live behavior.
- Record supersession in the new spec and current docs; never edit frozen predecessor specs.

## Product alignment

This is a correction inside the existing Financial planning roadmap direction: one envelope
budget, Actual-derived semantics, fewer duplicate representations, and explicit arithmetic the
user can act on. It also follows the codebase rule “when the model is wrong, change the model”:
the same missing pool concept is currently worked around by account defaults, setup copy,
budget arithmetic, and Period Result.

## Reference behavior

Actual Budget treats all on-budget accounts as one pool. Savings accounts can be on-budget, and
saving is represented with category balances. Credit cards are on-budget debt; payments between
on-budget accounts are transfers and do not create spending. We intentionally make the four core
kinds mandatory rather than preserving Actual's fully user-selectable account boundary, because
this personal app has a declared one-pool invariant.

## Risks and guardrails

- A membership flip without an opening rebase changes every month. Only one transactional domain
  operation may perform the transition.
- Bank headline balances and ledger rows can disagree. The reconciliation term must expose this,
  not mislabel it as income or silently spread it through envelopes.
- Pending rows can be duplicated when both scrape and synced feeds report them. Budget must reuse
  Dashboard selection rather than sum raw pending rows.
- A schema CHECK deployed before data cutover can block migration. Dry-run/apply and deployment
  order are part of the feature, not operator folklore.
- Removing `planned_withdrawal` must not remove `event_label`; they share old DTO/write paths but
  serve different features.
- Database changes and account mutations require second-user read/change/delete isolation tests.

## Out of scope

- Funding goals or new automatic assign behavior.
- Credit-card payment envelopes.
- Mandatory inclusion of investments, loans, or other tracking accounts.
- Restating today's bank balance across historical budget months.
- A general-purpose reconciliation product.
- New visual design or supplied mockups; this change is semantic and copy-level.

## Definition of a successful handoff

An implementing agent can start from `plan.md`, follow only the linked governing specs and
references, and answer unambiguously:

1. which accounts comprise the pool;
2. how current Ready to Assign ties to that pool;
3. what happens to uncategorized and unreconciled differences;
4. how existing and future boundary changes preserve history;
5. what Savings means in the envelope model; and
6. which old behavior and schema must disappear.
