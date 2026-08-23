# Payees — one merchant identity

**Status: frozen / complete** (2026-08-23)
Spec folder: `agent-os/specs/2026-08-23-0748-finance-payees/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-2124-actual-schedules/` — adds the stable payee
  identity that its Actual-shaped conditions can eventually reference. Existing schedule
  payee conditions remain merchant strings in this slice; converting them to ids is part of
  the matcher-cutover delta (Changes row 3).
- **Prepares to supersede:** `agent-os/specs/2026-08-16-1938-commitments/` — this slice
  installs the replacement shape for **D2's `matchers text[]` storage** and **D3's
  cross-table matcher exclusivity**, but does not switch the money-sensitive readers or drop
  the legacy columns. The later matcher-cutover delta becomes the formal superseding spec.
  Every other commitments decision — the two tiers (D0), propose-never-apply (D8), the
  one-page layout (D10) — carries forward untouched.

**Downstream specs that extend those matcher decisions**, and so must be migrated together:
`2026-08-18-2058-commitments-clarity`, `2026-08-21-1122-commitments-curation`, and
`2026-08-21-1810-register-track-as-bill` (whose `claimedMatchersOf` /
`trackAsBillRefusal` in `src/lib/finances/registerBillDraft.ts` are exactly the
application-level exclusivity checks the prepared D1/D2 shape will replace). None of their own
decisions are superseded by this slice; their matcher-shaped plumbing is the delta's scope.

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

- **D2 — The payee carries the replacement commitment claim.** `finance_payees` has nullable
  `commitment_bill_id` and `commitment_spend_id` with
  `CHECK (num_nonnulls(...) <= 1)`. The schema, claim queries and mutations ship here, but
  the existing `matchers` columns remain authoritative until the delta moves every reader.
  At that cutover, ownership inverts — "which payees does this bill claim" becomes a query
  rather than a column — which is the normal shape for a many-to-one and is what buys the
  state constraint.

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

- **D5 — `CLASSIFY_RULES` stays, and becomes seed data before it leaves render paths.** Its
  48 `merchant:` entries seed payee _names_ and alias groupings. Payee-aware display reads
  (the Register and Payees catalog) prefer the stored name. Money-sensitive analytics keep
  their legacy merchant-string reads in this slice because commitments still use those
  strings; switching only one side moved Available to Spend on the real file. The matcher
  delta moves both sides together, after which `effectiveMerchant()` can stop calling
  `matchRule()` globally. Its `category` and `flow` entries keep working until the later
  Rules spec replaces those facts with data.

  **This is sequencing, not a verdict that a hardcoded list is the right home.** It is not:
  a fact about the world that can only be changed by editing TypeScript is the workaround,
  and the Rules spec retires the list by moving its `category` / `flow` entries into data
  too. D5 keeps categorisation and the temporary merchant fallback so that identity,
  commitment matching and categorisation are not re-decided in one change — not because
  touching them would be inconvenient.

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

- **The commitment/schedule matcher cutover, and rename/merge UI.** The replacement columns,
  mutations and merge rewrite exist, but legacy matcher strings remain authoritative. The
  delta must move every money-sensitive reader and editor together before rename or merge is
  safe to expose (Changes row 3).
- **The rules engine, editor and register affordances.** The immediate follow-on; this spec
  exists to give it a `payee` id to condition on.
- Auto-learned category rules (Actual's 3-of-last-5 `updateCategoryRules`).
- A per-transaction payee override.
- Payee `favorite` / `learn_categories` flags, and transfer payees (we use
  `transferGroupId`).
- Rewriting `financePaymentResolutions.counterparty` into a payee reference — it resolves
  through the same alias lookup in `reclassify.ts` without needing its own column.

## Acceptance criteria

### Delivered here

- [x] `/finances/payees` lists every payee with its aliases, transaction count and total,
      and any replacement commitment claim already present.
- [x] Stable payee ids and aliases are seeded idempotently from the register, including
      resolved PayPal counterparties; ordinary reclassification mints new identities and
      writes `payee_id` beside its other recomputable fields.
- [x] Reassigning an alias moves every matching transaction on the next reclassify, and the
      following pass writes nothing.
- [x] Rename and merge mutations are ownership-scoped and tested. Merge moves aliases,
      repoints transactions, carries a lone claim, rewrites schedule JSONB holding a payee id,
      and leaves no dangling source row. Their UI remains deferred for safety.
- [x] A payee cannot hold both bill and recurring-spend claims at once; the database CHECK,
      rather than a component, makes that state unrepresentable. Claim reads and mutations
      are ready for the cutover.
- [x] Dashboard, Insights, Commitments, Available to Spend, Budget and the Sankey produce
      identical numbers before and after seeding on the real file.
- [x] A second user cannot read, change or delete the first user's payees or aliases.

### Moved to the matcher-cutover delta

- [ ] Rename changes the canonical name on every business surface without orphaning a
      commitment charge; expose Rename only after this is true.
- [ ] Commitments claim payee ids instead of matcher strings, and schedule payee conditions
      hold ids instead of strings.
- [ ] Every legacy bill matcher, spend matcher and schedule condition selects the same
      charges after that migration; only then drop both `matchers` columns and expose Merge.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                       | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Task 5 splits, and the `matchers` drop moves to land with its readers.** The backfill ships first and is purely additive; migrating schedule conditions, converting commitment matchers, and dropping the two columns each land with the readers whose meaning they change.                                                                                                                                                                | Dropping `matchers` breaks every reader of it in the same instant, and rewriting a schedule's `payee` conditions to ids silently stops `schedules/match.ts` matching until that file changes too — it compares against `effectiveMerchant`. Landing a cutover apart from its readers means a commit where the app compiles and quietly matches nothing. It also preserves the one state in which "no number moved" is checkable: payees populated but not yet read.                                                                                          |
| 2   | **`isUniqueViolation` became a shared helper in `src/lib/db/constraints.ts`,** and fixed a live bug in `createSchedule` on the way.                                                                                                                                                                                                                                                                                                          | Drizzle wraps the `PostgresError` in a `DrizzleQueryError` and puts the `code` in `cause`, so the existing top-level check never matched: `createSchedule`'s "already exists" message had never been reachable, and the raw SQL plus its parameters travelled instead. The payee mutations needed the same translation four times over, and a second copy would have carried the same defect.                                                                                                                                                                |
| 3   | **The commitment-matcher cutover is larger than this plan assumed and needs its own spec.** Converting `matchers` to payee claims touches 13 lib modules, 8 UI surfaces and the agent tool contracts — including `matcherIndex` / `resolveMerchant`, which the Available to Spend arithmetic runs through. Payees ship additively; money-sensitive read paths, the cutover, and the rename/merge UI that depends on it move to a delta spec. | `matcherIndex` keys on the merchant string while payee-aware reads return the payee name. A deliberately attempted partial read cutover materially moved Available to Spend on the real file before any commitment data had migrated — the exact silent failure this spec's verification section warns about. Making rename safe means moving the whole index onto payee ids and the commitment editors from string lists onto payee pickers. The final replay kept the legacy readers and produced byte-identical finance figures before and after seeding. |

---

## Task 1: Save spec documentation — complete

Create this folder with `plan.md` (**Status: active**, including the empty Changes table),
`shape.md`, `standards.md`, `references.md`. No visuals.

Standards to copy in full, per the house pattern of the last three Actual specs:
`development/clean-code`, `testing`, `security`, `dates`, `commits`;
`database/migrations`; `components/data-grid`, `drawer-pattern`, `modal-pattern`,
`ux-principles`, `navigation`, `responsive`. (`modal-pattern` is on the list because merge
is a confirmation dialog — see Task 7.)

## Task 2: Schema and migration — complete

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

## Task 3: The payee resolver — complete

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

## Task 4: Queries and mutations — complete

`src/lib/finances/payees/{queries,mutations}.ts` + `mutations.integration.test.ts`. Every
mutation takes `userId` first and proves ownership before writing (`development/security`).

- `listPayees` — name, aliases, transaction count, total cents, commitment claim.
- `createPayee`, `renamePayee`, `addAlias`, `removeAlias`, `deletePayee`.
- `mergePayees(userId, targetId, sourceIds)` — **one transaction** (D3): move aliases,
  `UPDATE finance_transactions SET payee_id = target`, rewrite schedule condition JSONB
  holding a merged id, carry the commitment claim across (refusing when both sides hold
  one), delete the sources.
- `claimPayeeForCommitment` / `releaseCommitmentClaims`, ready to replace the `matchers`
  writes in `upsertRecurringBill` / `upsertRecurringSpend` when the delta moves their readers.

**Integration tests must include:** a merge that leaves no dangling schedule condition; an
alias uniqueness violation surfacing as a refusal rather than a 500; a rename that moves no
transactions; and the cross-user case — a second user failing to read, change, and delete
the first user's payee **and** their alias.

## Task 5: Backfill complete; matcher cutover deferred

`seedPayees(userId)` ships behind an action (D7), and reclassification uses the same seed
planner on every pass. Steps 1–2 are delivered; steps 3–5 move together to the delta:

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

## Task 6: Write and display the identity — analytics cutover deferred

- `effectiveMerchant()` accepts a joined payee name and the Register supplies it, so the
  stored identity is visible there. Dashboard, Insights, Sankey, commitment and schedule
  readers deliberately keep the legacy merchant-string path until their matchers migrate in
  the same delta; `matchRule()` therefore remains the fallback in this slice (D5).
- `normalizeMerchant` remains the one alias-key generator.
- `reclassify.ts` / `planReclassify` resolve and mint payees **through the same
  PayPal-resolution merge that already runs for the category** (D4), adding `payeeId` to `RowPlan`
  and to the three-column update in `mutations.ts:421` — which becomes four. The doc comment
  there listing what is _not_ written stays true and must be re-read, not just edited around.

## Task 7: Payees page — complete

`/finances/payees`, registered in `src/lib/navigation/pages.ts` under `finances` with
keywords, plus its commands (`navigation` standard: a command without a menu is not
shipped).

- `DataGrid` of payees — name, aliases, transactions, total, commitment. Drag-reorder is
  not meaningful here; sort and filter are.
- Row menu: **Edit aliases…**, **Delete**. **Rename and Merge are deliberately not here yet** —
  both change the key `resolveMerchant` looks a commitment up by, so they are unsafe until the
  matcher cutover lands (Changes row 3). The mutations exist and are tested; only the
  affordances wait.
- Alias editing in a drawer (`drawer-pattern`).
- Register gains a **payee** column reading the stored name.

The smoke script discovers routes from the filesystem (`scripts/smoke.mjs:42`), so the new
page is covered the day it lands.

## Task 8: Verify, freeze spec, update roadmap — complete

- Full gate: `npm run test:unit` (**check for the Postgres skip warning** — the payee and
  cross-user integration tests are exactly the ones that silently skip), lint, typecheck,
  build, then `npm run smoke` against a running dev server.
- **Drive the real file**: seed payees and confirm Dashboard / Insights / Commitments /
  Available to Spend / Budget / Sankey read identically to before. Rename and merge stay
  mutation-tested rather than browser-driven because their affordances are intentionally
  deferred.
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
2. **No commitment loses its charges.** This is the matcher-cutover delta's gate. Every
   pre-existing matcher must resolve to a payee before those strings stop being authoritative.
3. **Merge leaves nothing dangling.** The JSONB rewrite is integration-tested here; the
   delta repeats the check against migrated real schedule conditions before exposing Merge.

## As-built verification

- `npm test`: 319 files, 4,065 tests, including Postgres suites; no database skip warning.
- `npm run lint`, `npm run typecheck`, `npm run build`: pass.
- `npm run smoke`: all 61 discovered routes render, including `/finances/payees`.
- Real file: 723 payees, 851 normalized aliases and 7,030 assigned transactions. Dashboard,
  Insights, Commitments, Available to Spend, Budget and Sankey figures were identical before
  and after the clean rebuild.
- Browser: catalog and drawer checked in light/dark desktop and 390×844 phone layouts; alias
  add/remove completed end to end without leaving test data behind.

## Follow-ups (new work — not amendments to this frozen spec)

1. Shape the payee-id matcher-cutover delta: migrate both commitment matcher arrays and
   schedule payee conditions, update every business reader/editor and agent contract, verify
   the real file, then drop the legacy columns.
2. Expose Rename and Merge only after that delta proves neither operation can detach charges.
3. Shape the Rules engine/editor on top of stable payee ids; retire the remaining render-time
   merchant defaults when identity and categorisation move together.
