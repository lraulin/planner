# Split transactions

**Status: active**
Spec folder: `agent-os/specs/2026-08-26-2022-split-transactions/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — D1 (a bill is an envelope) is what
  makes this necessary.
- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — D6; the envelope fold and
  the backlog-as-discrepancy invariant are what the reader audit must preserve.
- **Extends:** `agent-os/specs/2026-08-24-1945-register-prepared-rows/` — the server-prepared
  index and virtualization this has to extend rather than bypass.
- **Extends:** `agent-os/specs/2026-08-23-0748-finance-payees/` — D4 (payee is derived, no
  per-row override) is why a child inherits its parent's payee and cannot set one.
- **Extends:** `agent-os/specs/2026-08-14-1524-statement-reconcile/` — reconcile's row set is one
  of the two answers the reader audit has to give.
- **Does not supersede** `agent-os/specs/2026-08-23-1536-finance-rules/` D4 ("No splits"). That
  decision forbids a _rule_ creating a split, and it stands unchanged. Splits here are a manual,
  deliberate operation with no automatic trigger.

## Context

`finance_transactions.budget_category_id` is a single nullable FK. Since
`2026-08-23-2313-one-budget` D1 made **a bill an envelope**, one bank charge that pays two bills
has no value that column can hold.

Apple is the case that surfaced it. `PP*APPLE.COM/BILL` is one string for every Apple product,
and Apple batches renewals: a single $34.97 charge covering a $13.00 monthly Copilot
subscription and a $19.99 annual Intervals Pro membership. Those belong in two envelopes, and
today the register can only be wrong about it.

This is not a missing convenience. It is a model that cannot express something that routinely
happens, and there are already **two workarounds in the tree for the same missing concept** —
the "When the model is wrong, change the model" signal in
`agent-os/standards/development/clean-code.md`:

- `src/lib/finances/amountMatch.ts` exists to use _amount as identity_ for this exact merchant.
  Its own doc comment: _"one bank merchant string (`PP*APPLE.COM/BILL`) is many products, and
  amount is the only way to tell a subscription from a one-off."_
- `src/lib/finances/registerBillDraft.ts:95` repeats the workaround for Track as bill:
  _"`PP*APPLE.COM/BILL` is every Apple Store product. Counting the whole payee would treat a
  $9.99 subscription as 299 mixed charges."_

And the gap is already named as an unbuilt blocker in two places: `agent-os/product/roadmap.md`
(§ Itemized receipts) and the `financeSupplyItems` schema header — _"attributing one Walmart
charge across several envelopes needs split transactions, and that friction is what would stop
the sheet being kept up."_

**Splits should stay rare.** One charge, one envelope is right almost always, and a split
register is a harder register to read. The build reflects that: nothing creates a split
automatically, no rule action can, and the register hides children until asked.

## Decisions

### D1 — Parent/child rows in `finance_transactions`, not a splits table

Actual's model (`../actual/packages/loot-core/src/server/aql/schema/index.ts:37-39`): a parent
row carrying the full bank amount and **no envelope**, plus child rows each carrying a piece and
an envelope. Children sum to the parent.

New columns on `finance_transactions`:

- `is_parent boolean not null default false`
- `parent_id uuid references finance_transactions(id) on delete cascade`
- CHECK `not (is_parent and parent_id is not null)` — no nested splits
- Partial index `(user_id, parent_id) where parent_id is not null`

**Divergence: no `is_child` column.** Actual carries one alongside `parent_id` for its CRDT sync
layer. Here `parent_id is not null` _is_ is_child, and a second stored copy is exactly the
derived-duplicate this codebase refuses elsewhere — the envelope fold stores no balance because
"storing a balance would create a second source of truth that drifts."

### D2 — The reader audit is the job, and there are **two** answers, not one

The migration is three columns. The audit is the work, and it is where the bugs will be. Every
aggregate has to declare which set it means:

| Question                        | Filter                               | Why                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **How much money?**             | leaf rows — `is_parent = false`      | Children sum to the parent, so the leaf sum equals the true total with no special case. This is what Actual's query executor appends by default (`server/aql/schema/executors.ts:116,242`). |
| **How many bank transactions?** | non-child rows — `parent_id is null` | The bank moved money once. Counting leaves would report one split charge as two transactions.                                                                                               |

Money sums to fix — `is_parent = false`:

- `src/lib/finances/queries.ts:77` (account balance), `:122`, `:428`
- `src/lib/finances/payees/queries.ts:104`
- `src/lib/finances/budget/queries.ts:270` (`activitySince`), `:311`, `:359`
- **`backlogSince` in `budget/queries.ts` is the sharp one.** It counts on-budget rows with a
  null envelope, and a split parent has a null envelope _by design_ (D3). Unfiltered, every
  split parent is counted as backlog — and per the `budget_category_id` schema comment, that
  count **is** the size of the discrepancy the Budget page reports. The failure would be a
  budget that claims to be out of balance by exactly the value of every split.

Counts and row sets to fix — `parent_id is null`:

- `listAccounts.transactionCount` in `queries.ts`
- `reconcile.ts`'s transaction set, which asserts `opening + sum(rows) = closing`
- the register index (`registerQuery.ts`) and import dedup

### D3 — A split parent holds no envelope

Actual's rule, and it is what makes D2's leaf filter safe: if a parent kept an envelope, the
leaf sum and the envelope sum would double-count it. Splitting a row that already has an
envelope moves that envelope onto the first child rather than dropping it on the floor.

### D4 — Children are not bank rows

`external_source` / `external_id` stay null on a child, so children sit outside the partial
unique index that dedups re-imports (`fingerprint.ts`, `finance_transactions_external_ref_uq`,
which is `where external_id is not null`). A re-import of the source file matches the parent's
fingerprint and is skipped; it can neither create a child nor resurrect a deleted one.

### D5 — A parent amount change flags, never silently rebalances

A live-sync pending→posted update can change a split parent's amount, leaving the children out
of balance. Surface it on the row and let a person fix it. **Do not auto-distribute the
difference.** Silently moving money between envelopes with no record is precisely the failure
this spec exists to prevent.

### D6 — Strict balance, with `Distribute` as the affordance that makes strict liveable

The mutation refuses to write an unbalanced split.

**Divergence from Actual**, which persists the imbalance as a `SplitTransactionError` and shows
it. Two reasons to be stricter: `reconcile.ts` is a hard arithmetic check here, so an unbalanced
split becomes a statement discrepancy whose cause is not visible from where it is reported; and
there is no multi-device sync forcing tolerance of a half-written record. An unbalanced split
can only ever be a bug wearing data's clothes.

Strictness is only tolerable because D7 makes balancing one click.

### D7 — `Distribute` is **proportional**, which Actual's is not

The problem this has to solve, in the user's words: you type the two subscription prices off the
receipt — $13.00 and $19.99 — and they total $32.99 against a $34.97 charge. The $1.98 is tax.
Ordinarily tax is just part of the charge and the whole charge gets one envelope; nobody is
going to hand-compute per-item tax to split it.

Actual's `Distribute` spreads the remainder **evenly across zero-amount children only**
(`desktop-client/src/components/transactions/TransactionsTable.tsx:3774`). That does not help
here: both children have amounts, and even-splitting $1.98 gives 99¢ each, which is wrong — tax
is proportional to price, not per-line.

New pure module `src/lib/finances/splitRemainder.ts`: one deterministic largest-remainder
allocator behind two strategies.

- **`proportional`** — spread the remainder across children that already have an amount, in
  proportion to those amounts. The default when every child has an amount. This is the tax case.
- **`even`** — Actual's behaviour: spread across zero-amount children. The default when any
  child is empty, which is the state right after adding a row.

Plus a manual escape: click one child to take the whole remainder.

**The worked case, pinned in a test:** parent $34.97, children $13.00 and $19.99, `Distribute`
→ **$13.78 and $21.19**, summing to exactly $34.97. (Remainder 198¢; proportional shares 78.02
and 119.98; floors 78 + 119 = 197; the odd cent goes to the larger fractional part.) Integer
cents throughout, and the sum must be _exact_ — an allocator that is off by a cent produces a
number that looks entirely plausible and fails reconcile a month later.

### D8 — Register: expand-on-demand

The parent is the only indexed row; its Category cell reads `Split (2)`. A disclosure triangle
injects the children beneath it.

**Children never participate in sort, filter, search or grouping.** They exist only under an
expanded parent. That is what keeps `registerQuery.ts`'s server-prepared pipeline and the
virtualized fixed-height row model (`2026-08-24-1945-register-prepared-rows`) intact rather than
making every stage split-aware.

```
  ▸ 05/03  PP*APPLE.COM/BILL        Split (2)     -34.97
  ▾ 05/03  PP*APPLE.COM/BILL        Split (2)     -34.97
      └  Copilot: Track & Budget    Software      -13.78
      └  Intervals Pro HIIT Timer   Fitness       -21.19
```

**The cost, stated plainly:** filtering the register to an envelope will not surface a split
child. The Budget page's envelope drill-down is where those are found. Accepted because splits
are rare by design; if that stops being true, the fully-indexed alternative is a later delta.

### D9 — A child carries amount, envelope and notes. Nothing else.

Date, account, description, payee, flow, transfer group and pending all inherit from the parent
and are read-only on the child. Payee especially: `2026-08-23-0748-finance-payees` D4 makes
identity derived from the bank description with deliberately no per-row override, and the bank
says Apple. A payee rollup summing leaf rows therefore still attributes $34.97 to Apple, which
is correct — Apple was paid $34.97.

### D10 — What cannot be split

- **A transfer leg.** Both legs would need splitting to stay coherent, and `activitySince`'s
  transfer exclusion keys on `transfer_group_id`.
- **An existing child.** No nesting; the CHECK in D1 enforces it.

### D11 — Unsplit restores an ordinary row

Removing the last child clears `is_parent` and returns the row to the ordinary envelope picker.
Without this there is no undo, and a mis-split row would be permanently strange.

### D12 — Desktop only for v1

Splitting is a deliberate, fiddly operation done while reading a receipt — the desktop case.
Mobile renders splits read-only: the parent with its children listed, no editor. Deliberate
deviation from `agent-os/standards/components/responsive.md`, recorded in `standards.md`.

## Acceptance criteria

- [ ] The $34.97 Apple charge splits into $13.78 Software and $21.19 Fitness via `Distribute`,
      and both envelopes' Activity move by exactly those amounts.
- [ ] Account balance, reconcile, and the statement check are **unchanged** by splitting a row —
      the same numbers before and after.
- [ ] Splitting a row does **not** increase the account's transaction count.
- [ ] A split parent is **not** counted in the Budget page's backlog / discrepancy figure.
- [ ] An unbalanced split is rejected by the mutation, with the shortfall named in the error.
- [ ] `splitRemainder` unit tests cover: proportional and even strategies, the exact-sum
      invariant, odd-cent determinism, zero and negative amounts, and a single child.
- [ ] Cross-user integration test: a second user cannot read, split, rebalance or delete the
      first user's transaction — **and cannot attach a child to the first user's parent**, which
      is the novel cross-user hole this schema opens.
- [ ] Deleting a parent deletes its children; deleting the last child unsplits the parent.
- [ ] Re-importing the source file leaves the split intact and creates no duplicate row.
- [ ] lint, typecheck, Postgres tests with no skip warning, production build, `npm run smoke`,
      and a browser pass on the Register and Budget pages.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`. No visuals.

## Task 2: Schema and migration

Add the columns, CHECK and index from D1 to `src/db/schema.ts`, at the doc-comment density the
surrounding table already uses — the _why_ for the absent `is_child`, for the parent's null
envelope, and for the cascade. Generate the migration with drizzle-kit; never hand-write one
without its snapshot (`agent-os/standards/database/migrations.md`).

## Task 3: `splitRemainder.ts` — the pure core, first

Both strategies over one largest-remainder allocator, integer cents asserted the way
`budget/envelope.ts` asserts them. `splitRemainder.test.ts` beside it, including the pinned
Apple case from D7. This lands before anything can call it.

## Task 4: Mutations and the balance invariant

`splitTransaction`, `updateSplitChildren`, `unsplitTransaction` in
`src/lib/finances/mutations.ts` — each taking `userId`, each inside one DB transaction, each
enforcing D6 and refusing the D10 cases. `mutations.integration.test.ts` gains the cross-user
cases from the acceptance list.

## Task 5: The reader audit

Every call site listed in D2, each with a deliberate answer to _which set does this one mean_.
Extend the existing tests for `activitySince`, `backlogSince`, reconcile and account balance so
that a wrong filter fails a test rather than merely looking plausible.

## Task 6: Register index and grid

`registerQuery.ts` returns parents only, carrying a child count. A new index entry kind holds
expanded children. `financeColumns.tsx` renders `Split (N)` and the disclosure, within the
virtualized fixed-height row model.

## Task 7: The split editor in the drawer

`TransactionDrawer.tsx` gains the child list, add/remove, a running remainder, and `Distribute`.
Per `agent-os/standards/components/drawer-pattern.md`.

## Task 8: Verify, freeze spec, update roadmap

Run the full gate plus `npm run smoke`, drive the real Apple charge end to end in the browser,
complete **Changes from original plan**, mark `plan.md` and `shape.md` **frozen / complete**,
and update both places that name this as an unbuilt blocker: the Itemized-receipts paragraph in
`agent-os/product/roadmap.md` and the `financeSupplyItems` header comment in `src/db/schema.ts`.

## Verification

1. `npm run test:unit` — and check for the Postgres skip warning. The DB tests are the point
   here; a silent skip would pass the gate having tested nothing that matters.
2. `npm run lint && npx tsc --noEmit && npm run build`.
3. Dev server up, then `npm run smoke` (all 23 routes).
4. Browser: split the real Apple charge on `/finances`; confirm both envelopes move on
   `/finances/budget`; confirm `/finances/accounts` balance and transaction count are unchanged;
   confirm the backlog figure did not grow.

---

**Standing rule while this spec is active:** material changes to requirements, design or scope —
including developer feedback on what was actually built — update `plan.md` / `shape.md` and
append a row to **Changes from original plan**. Skip pure implementation detail. Freeze when
verified.
