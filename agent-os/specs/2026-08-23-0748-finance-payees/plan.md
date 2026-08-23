# Payees — one merchant identity

**Status: active**
Spec folder: `agent-os/specs/2026-08-23-0748-finance-payees/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-2124-actual-schedules/` — the Actual-shaped
  `{field, op, value}` condition model. This spec changes the **payee condition's value
  type** from a merchant string to a payee id, and widens the validating parse in
  `src/lib/finances/schedules/conditions.ts` accordingly.
- **Supersedes:** `agent-os/specs/2026-08-16-1938-commitments/` — **D2's `matchers text[]`
  storage** and **D3's cross-table matcher exclusivity**. The name/matcher _split_ that D2
  argued for is upheld and completed, not reversed: this spec keeps the display name
  separate from the join key and gives the join key a row of its own (D1, D2 here). What is
  superseded is where the matcher lives and how exclusivity is enforced — a claim on the
  payee under a CHECK, instead of two `text[]` columns policed by
  `upsertRecurringBill` / `upsertRecurringSpend`. Every other commitments decision — the
  two tiers (D0), propose-never-apply (D8), the one-page layout (D10) — carries forward
  untouched.

**Downstream specs that extend the superseded decisions**, and so inherit this change:
`2026-08-18-2058-commitments-clarity`, `2026-08-21-1122-commitments-curation`, and
`2026-08-21-1810-register-track-as-bill` (whose `claimedMatchersOf` /
`trackAsBillRefusal` in `src/lib/finances/registerBillDraft.ts` are exactly the
application-level exclusivity checks this spec's D1/D2 replace). None of their own decisions are
superseded; their matcher-shaped plumbing is.

## Context

Three Actual Budget subsystems are shipped and frozen — the envelope budget
(`2026-08-22-1948-zero-based-budget`), Schedules (`2026-08-22-2124-actual-schedules`) and
Goal templates (`2026-08-22-2242-budget-goal-templates`). All three named **Rules / Payees**
as the next unbuilt piece, and both `docs/actual-budget/README.md` and the
`financeSchedules` table doc still record the rule engine as deliberately unported: _"The
generic rule engine, payees table and auto-post service stay out; the condition shape is
theirs so a later Rules spec can consume this data without a migration."_

This spec is the **payees half**, taken first because Rules needs a real payee id to
condition on — the same reason Schedules shipped before Goal templates.

**The problem it solves.** There is no payee in this app. Merchant identity is recomputed
at read time by `effectiveMerchant()` (`src/lib/finances/analytics.ts:128`), which runs
`normalizeMerchant(description)` and then a linear `.find()` over 66 hardcoded regexes in
`src/lib/finances/classify/rules.ts`. Three consequences:

1. **The canonical name is a code change.** Teaching the app that `WM SUPERCENTER` and
   `WAL-MART` are one company means editing `CLASSIFY_RULES` — impossible from the phone,
   which is where this app is actually validated.
2. **The string is the join key.** `finance_recurring_bills.matchers`,
   `finance_recurring_spend.matchers` and `finance_schedules.conditions` all store
   `effectiveMerchant()` output. The bills table already split `name` from `matchers`
   precisely to escape "the display name is also the join key", and got half the way there;
   the other half is that the _matcher_ is still a bare string nothing owns.
3. **"A merchant belongs to at most one commitment" cannot be a constraint.** It spans two
   tables, so `schema.ts:2483` records it as enforced in `upsertRecurringBill` /
   `upsertRecurringSpend` and pinned by an integration test.

**Not a performance fix.** At a few thousand rows the read-time regex pass is milliseconds.
Moving it to write time is structurally tidier and matches how `derivedCategory` already
works, but it is a side effect, not the reason.

## Decisions

- **D1 — A payee is a row, and aliases are rows.** `finance_payees` holds the name the user
  chose; `finance_payee_aliases` holds the `normalizeMerchant()` strings it owns, with
  `unique (user_id, alias)`. That unique index is the point: one normalized merchant string
  belongs to at most one payee, enforced by Postgres rather than by a mutation everyone must
  remember to route through. An array column on the payee could not express it.

- **D2 — The commitment claim moves onto the payee.** `finance_payees` gains nullable
  `commitment_bill_id` and `commitment_spend_id` with `CHECK (num_nonnulls(...) <= 1)`,
  replacing both `matchers` columns. The cross-table exclusivity at `schema.ts:2483` becomes
  a row-level CHECK, because a payee has one row and therefore one claim. Ownership inverts
  — "which payees does this bill claim" becomes a query rather than a column — which is the
  normal shape for a many-to-one and is what buys the constraint.

- **D3 — No `payee_mapping`. A merge rewrites its references, transactionally.** Actual
  carries an indirection table so merged payees keep resolving
  (`db/index.ts:608-654`, `rule-utils.ts:112-160`). Their own comment gives the reason: undo
  walks backwards and needs the original id to reproject. We have no CRDT sync and no undo
  log, so the indirection would be a permanently-empty abstraction. Merge moves the aliases,
  repoints `finance_transactions.payee_id`, rewrites the schedule condition JSONB, and
  deletes the row — in one transaction.

- **D4 — `payee_id` is derived, and there is no per-row override.** It is written only by
  the reclassify pass from the alias table, on the same terms as `derivedCategory`: _wiping
  the column and re-running must be a no-op_. Correcting a payee is an **alias edit**, which
  is what makes one correction fix every row that merchant ever produced — the property that
  makes this worth having over a per-row dropdown.

  **The one case where a description genuinely names the wrong merchant is closed here, not
  deferred.** Payment processors wrap many real merchants under one string.
  `normalizeMerchant` already strips the `PAYPAL *` / `SQ *` / `TST* ` prefixes
  (`merchant.ts:43-52`), and where the bank line names no merchant at all,
  `financePaymentResolutions` supplies the counterparty — which `reclassify.ts:131-134`
  already feeds through a second `categorize()` call. **Payee resolution runs on the
  resolved counterparty wherever one exists**, on exactly those terms. Without that, every
  bare PayPal line in the file collapses into a single payee called PAYPAL, which the alias
  model has no way to express its way out of.

- **D5 — `CLASSIFY_RULES` stays, and stops being read at render time.** Its 48 `merchant:`
  entries are the seed for payee _names_ and their alias groupings. Its `category` and
  `flow` entries keep working exactly as they do now. What changes is that
  `effectiveMerchant()` no longer calls `matchRule()` — the answer is a column. The list
  becomes shipped defaults consumed once, which is the shape the Rules spec will build on.

  **This is sequencing, not a verdict that a hardcoded list is the right home.** It is not:
  a fact about the world that can only be changed by editing TypeScript is the workaround,
  and the Rules spec retires the list by moving its `category` / `flow` entries into data
  too. D5 keeps it for exactly one spec so that identity and categorisation are not
  re-decided in the same change — not because touching it would be inconvenient.

- **D6 — Payee names are unique per user, case-insensitively.** `unique (user_id,
lower(name))`, matching Actual's `UNICODE_LOWER(name)` lookup in `payees.ts:3-16`. Two
  payees called "Costco" is the state merge exists to leave.

- **D7 — Seeding is a lib function behind an action, not a SQL migration.**
  `normalizeMerchant` is TypeScript and cannot run inside a migration. This follows
  `seedBudget`: a pure planner with tests, invoked once, idempotent on re-run. Reclassify
  then keeps it current by minting a payee for any merchant it has never seen — Actual's
  `createPayee`-on-import, relocated to the recomputable pass.

### Divergences from Actual, recorded

| Actual                                    | Here                                             | Why                                                                              |
| ----------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `payee_mapping` indirection               | Merge rewrites references                        | No CRDT sync, no undo replay (D3)                                                |
| Payee set per transaction, and by rule    | Payee derived from aliases only                  | One correction fixes every row (D4)                                              |
| `imported_payee` keeps the raw string     | `description` already is that, unaltered         | Import never updates a row, so the raw line is durable                           |
| Title-cased on import (`sync.ts:416-483`) | Name is the user's, seeded from `CLASSIFY_RULES` | Title-casing invents `Wm Supercenter`; the rule list already holds the real name |

## Out of scope

Named, not omitted — these are the next specs.

- **The rules engine, editor and register affordances.** The immediate follow-on; this spec
  exists to give it a `payee` id to condition on.
- Auto-learned category rules (Actual's 3-of-last-5 `updateCategoryRules`).
- A per-transaction payee override.
- Payee `favorite` / `learn_categories` flags, and transfer payees (we use
  `transferGroupId`).
- Rewriting `financePaymentResolutions.counterparty` into a payee reference — it resolves
  through the same alias lookup in `reclassify.ts` without needing its own column.

## Acceptance criteria

- [ ] `/finances/payees` lists every payee with its aliases, transaction count and total,
      and which commitment claims it.
- [ ] Renaming a payee changes the name everywhere and **cannot** orphan a charge — the
      thing a bare string could not promise.
- [ ] Merging two payees moves the aliases, repoints every transaction, rewrites any
      schedule condition holding the merged id, and leaves no dangling reference.
- [ ] Adding an alias to a payee reassigns every matching transaction on the next
      reclassify, and reclassify is still a no-op when nothing moved.
- [ ] A commitment claims payees, and claiming one already claimed by another commitment is
      refused **by the database**, not only by the mutation.
- [ ] Every existing bill matcher, spend matcher and schedule payee condition still matches
      the same charges after migration — verified against the real file, not only fixtures.
- [ ] Dashboard, Insights, Commitments, Available to Spend and the Sankey produce identical
      numbers to before, on the same data.
- [ ] A second user cannot read, change, or delete the first user's payees or aliases.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create this folder with `plan.md` (**Status: active**, including the empty Changes table),
`shape.md`, `standards.md`, `references.md`. No visuals.

Standards to copy in full, per the house pattern of the last three Actual specs:
`development/clean-code`, `testing`, `security`, `dates`, `commits`;
`database/migrations`; `components/data-grid`, `drawer-pattern`, `modal-pattern`,
`ux-principles`, `navigation`, `responsive`. (`modal-pattern` is on the list because merge
is a confirmation dialog — see Task 7.)

## Task 2: Schema and migration

In `src/db/schema.ts`, following the finance conventions in that file — `userId` cascade,
`text` + CHECK over `pgEnum`, doc comments that explain _why_:

- `finance_payees` — `id, userId, name, commitmentBillId?, commitmentSpendId?, notes,
timestamps`; `unique (userId, lower(name))`; `CHECK (num_nonnulls(commitment_bill_id,
commitment_spend_id) <= 1)`; both FKs `on delete set null`.
- `finance_payee_aliases` — `id, userId, payeeId → payees (cascade), alias`;
  **`unique (userId, alias)`** (D1); index on `(userId, payeeId)`.
- `finance_transactions.payee_id` — nullable FK, `on delete set null`, index
  `(userId, payeeId, transactionDate)`. Doc it as recomputable, citing `derivedCategory`.
- Drop `finance_recurring_bills.matchers` and `finance_recurring_spend.matchers` **only in
  Task 5**, after the backfill has read them.

Generate with drizzle-kit; never hand-write a migration (`database/migrations`).

## Task 3: The payee resolver

New `src/lib/finances/payees/`, pure, no db:

- `resolve.ts` + `resolve.test.ts` — `payeeIndex(aliases)` → alias→payeeId map, and
  `payeeForDescription(description, index, resolvedCounterparty?)` built on the existing
  `normalizeMerchant`. Mirrors `budget/autoMap.ts`'s index/lookup split. The optional
  counterparty is D4's processor case: when a PayPal resolution names who was actually
  paid, that name decides the payee, exactly as it already decides the category at
  `reclassify.ts:131-134`.
- `seed.ts` + `seed.test.ts` — plan the initial payee set from distinct normalized
  merchants plus the 48 `CLASSIFY_RULES` `merchant:` entries. A rule's canonical name
  becomes one payee owning every normalized string that rule matched; everything else
  becomes a payee named for its own normalized string. **Idempotent** — re-planning against
  existing payees yields no changes.

**Named tests, each able to fail on a plausible mistake:**

1. Two normalized spellings claimed by one `CLASSIFY_RULES.merchant` seed as **one** payee
   with two aliases (`WM SUPERCENTER` / `WAL-MART`).
2. A rule that sets `category`/`flow` but no `merchant` does **not** collapse distinct
   merchants together.
3. Re-running the seed plan over its own output produces zero changes.
4. An alias already owned by another payee is a conflict the plan reports, not a silent
   reassignment.
5. `normalizeMerchant` returning `""` produces no payee — a blank alias would swallow rows.
6. **A bare processor line resolves to its counterparty's payee, not to the processor.** Two
   PayPal charges with different counterparties must not land on one payee — the failure
   that would make a single payee named PAYPAL absorb unrelated spending.

## Task 4: Queries and mutations

`src/lib/finances/payees/{queries,mutations}.ts` + `mutations.integration.test.ts`. Every
mutation takes `userId` first and proves ownership before writing (`development/security`).

- `listPayees` — name, aliases, transaction count, total cents, commitment claim.
- `createPayee`, `renamePayee`, `addAlias`, `removeAlias`, `deletePayee`.
- `mergePayees(userId, targetId, sourceIds)` — **one transaction** (D3): move aliases,
  `UPDATE finance_transactions SET payee_id = target`, rewrite schedule condition JSONB
  holding a merged id, carry the commitment claim across (refusing when both sides hold
  one), delete the sources.
- `claimPayeeForCommitment` / `releaseClaim`, replacing the `matchers` writes in
  `upsertRecurringBill` / `upsertRecurringSpend` and their application-level
  `claimedMatchers` / `checkedMatchers` checks — the CHECK plus the unique index now carry
  it.

**Integration tests must include:** a merge that leaves no dangling schedule condition; an
alias uniqueness violation surfacing as a refusal rather than a 500; a rename that moves no
transactions; and the cross-user case — a second user failing to read, change, and delete
the first user's payee **and** their alias.

## Task 5: Backfill and cutover

One `seedPayees(userId)` mutation behind an action (D7), then the migration that removes
what it replaced:

1. Plan and insert payees + aliases from history.
2. Write `finance_transactions.payee_id` for every row.
3. Convert `finance_recurring_bills.matchers` / `finance_recurring_spend.matchers` into
   payee claims, reporting any matcher that resolves to no payee rather than dropping it.
4. Rewrite `finance_schedules.conditions` payee values from strings to payee ids, extending
   the validating parse in `src/lib/finances/schedules/conditions.ts` to the id shape.
5. Only then, the drizzle-kit migration dropping both `matchers` columns.

**This is the step that can silently lose money-relevant links.** Before dropping anything,
assert every pre-existing matcher resolved and every schedule condition still selects the
same transactions.

## Task 6: Rewire the read path

- `effectiveMerchant()` in `src/lib/finances/analytics.ts` stops calling `matchRule()` and
  reads the joined payee name; keep the export name so the ~15 call sites stay a rename
  rather than a redesign. `normalizeMerchant` stays — it is the alias key generator.
- Thread `payeeName` through the row types consumed by `insightsFilter.ts`, `sankeyFlow.ts`,
  `dashboardQueries.ts`, `commitments.ts`, `schedules/match.ts`, `schedules/discover.ts`,
  `registerBillDraft.ts`, `financeColumns.tsx` and `agent/financeTools.ts`.
- `reclassify.ts` / `planReclassify` resolve and mint payees **through the same
  PayPal-resolution merge that already runs for the category** (D4), adding `payeeId` to `RowPlan`
  and to the three-column update in `mutations.ts:421` — which becomes four. The doc comment
  there listing what is _not_ written stays true and must be re-read, not just edited around.

## Task 7: Payees page

`/finances/payees`, registered in `src/lib/navigation/pages.ts` under `finances` with
keywords, plus its commands (`navigation` standard: a command without a menu is not
shipped).

- `DataGrid` of payees — name, aliases, transactions, total, commitment. Drag-reorder is
  not meaningful here; sort and filter are.
- Row menu: **Rename**, **Merge into…**, **Edit aliases…**, **Delete**.
- Alias editing in a drawer (`drawer-pattern`), merge in a `ModalShell` confirmation naming
  exactly what will move (`modal-pattern`).
- Register gains a **payee** column reading the stored name.

The smoke script discovers routes from the filesystem (`scripts/smoke.mjs:42`), so the new
page is covered the day it lands.

## Task 8: Verify, freeze spec, update roadmap

- Full gate: `npm run test:unit` (**check for the Postgres skip warning** — the payee and
  cross-user integration tests are exactly the ones that silently skip), lint, typecheck,
  build, then `npm run smoke` against a running dev server.
- **Drive the real file**: seed payees, confirm Dashboard / Insights / Commitments /
  Available to Spend / Sankey read identically to before, then rename and merge a payee and
  confirm nothing detaches.
- Update `plan.md` / `shape.md` for material as-built drift; complete **Changes from
  original plan**.
- Mark **Status: frozen / complete**; move leftovers to **Follow-ups**.
- Update `agent-os/product/roadmap.md`, and `docs/actual-budget/README.md` — its "not
  ported; we store the condition shape only" line is now half wrong.

---

## Verification

The gate does not prove this one. Three things must be checked by hand on the real file,
because each is a silent failure:

1. **No number moves.** Payees change identity, not arithmetic. Screenshot Dashboard,
   Insights and Commitments before and after the backfill and compare.
2. **No commitment loses its charges.** Every pre-existing matcher must resolve to a payee;
   a matcher that silently resolves to nothing shows up as a commitment whose spend drops to
   zero, which looks like a data problem rather than a migration bug.
3. **Merge leaves nothing dangling** — specifically a schedule whose payee condition held
   the merged id, since that reference is JSONB and no FK protects it.

> **Standing rule:** while this spec is active, material changes to requirements, design or
> scope — including feedback on what was built — go into `plan.md` / `shape.md` plus a row
> in **Changes from original plan**. Skip pure implementation detail. Freeze when verified.
