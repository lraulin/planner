# Rules — categorisation becomes user data

**Status: active**
Spec folder: `agent-os/specs/2026-08-23-1536-finance-rules/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-23-0748-finance-payees/` — claims its follow-up #3,
  "shape the Rules engine/editor on top of stable payee ids; retire the remaining render-time
  merchant defaults when identity and categorisation move together."
- **Extends:** `agent-os/specs/2026-08-23-1041-payee-matcher-cutover/` — claims its follow-up
  #1, builds on the stable payee ids its cutover made authoritative, and reuses its
  guarded-migration shape.
- **Extends:** `agent-os/specs/2026-08-22-2124-actual-schedules/` — reuses the `{field, op,
value}` condition contract and the `approxThreshold` / `amountMatches` helpers its restricted
  parse established.
- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — closes four of its
  follow-ups (create/reorder envelopes, reachability of hidden envelopes, the movement log,
  Assign remaining).
- **Supersedes:** nothing frozen. `src/lib/finances/classify/rules.ts` is not a frozen decision;
  it is the workaround this spec removes. Its own header paragraph — _"This list is expected to
  grow by inspection… It is data, not logic"_ — is the claim this spec makes true.

## Context

The Actual Budget absorption chain is complete and self-consistent — zero-based budget →
schedules → goal templates → payee identity → payee matcher cutover, all frozen. Three separate
follow-up lists and `agent-os/product/roadmap.md` name the same unclaimed next slice:

> Rules is the next layer on these same stable ids.

The concrete defect: **`src/lib/finances/classify/rules.ts` is 65 hardcoded regexes that only a
developer can change.** Adding a rule is a TypeScript edit and a deploy. That is the same shape
of wrongness the payee spec named and fixed for _identity_ — a fact about the user's own money
living in code rather than in a row they own. The file calls itself data; it is a deploy.

**The engine already exists in all but name.** `planReclassify()` in
`src/lib/finances/classify/reclassify.ts` is a pure, idempotent planner; `changedRows()` writes
only what moved; `reclassifyTransactions(userId)` (`src/lib/finances/mutations.ts`) already runs
on import and behind a button on `/finances/insights`. **This spec does not build a rule
runner.** It replaces one _input_ to the planner and adds a preview before the write. That is
why a feature Actual spreads over sixteen files is one table, one pure module and one page here.

If precedence, transfer detection, income cadence or idempotence move, the parity audit has
caught a bug — not a feature.

## Decisions

- **D1 — Rules are rows, seeded from the 65 that exist.** A `finance_rules` table with Actual's
  `{field, op, value}` JSONB conditions and an actions array. Seeding is a guarded,
  dry-run-by-default, idempotent migration in the shape the payee cutover proved twice.

- **D2 — First match wins, in explicit user order.** The `sort_key` _is_ the priority model, so
  drag-to-reorder is load-bearing rather than a convenience.

  **Actual's ranking cannot be adopted here, and the reason is arithmetic.**
  `../actual/packages/loot-core/src/server/rules/rule-utils.ts:18-35` scores
  `matches: 0`, and `computeScore`'s ×2 bonus applies only when _every_ condition is
  `is|isNot|isapprox|oneOf|notOneOf`. All 65 seeded rules are regexes, so under Actual's
  ranking every one of them scores **0** and ties — and ties break by id. `METLIFE PET` vs
  `METLIFE` would be decided by whichever UUID sorted first. Actual's scoring is calibrated for
  a corpus dominated by `payee is <id>`; ours is dominated by the one op the score cannot see
  into. Adopting it would not be a behaviour change so much as a _random_ one.

  Second reason: Actual's "every match applies, last wins" makes the answer to _why is this
  Dining?_ a set of rules, so `RowClassification.ruleId` becomes a list and every explanation
  surface gets harder.

  **The cost, stated plainly:** a narrow flow-only overlay cannot compose onto a broad category
  rule. `paypal-outbound` sets `flow: spend` and no category; under first-match-wins it always
  will. Today's 65 rules already live with this and no row is affected. The escape hatch is that
  one rule may carry both a category and a flow action. Per-field first-writer-wins would be a
  strictly additive change later; shipping it now would be speculative generality _and_ would
  cost byte-identical seeding.

- **D3 — Both regex and payee conditions; `merchant matches` is the lossless op.** All 65 seed
  as `merchant matches` — no rule is "modernised" during the migration, because that is a second
  change hiding inside a migration.

  `merchant matches` earns permanent residence, not just a compatibility shim: it is the only op
  that fires on a spelling nobody has ever seen. `ensurePayees` runs before `planReclassify`, so
  a novel spelling does get a payee in the same pass — but a **new** payee, absent from any
  `payee oneOf` list. The chain rules (`grocery-chains`, `dining-chains`, `fuel-chains`,
  `software-vendors`) exist precisely to categorise a merchant on first sight. Converting them
  to payee ids would break that silently, on exactly the rows most in need of categorising.

  `payee is` / `oneOf` earns its place too: it is stable under a rename and correct after a
  merge.

- **D4 — Three actions: `set category`, `set flow`, `name payee`.** No splits, no formulas, no
  schedule linking, no delete-transaction, no notes ops, no pre/post stages. The taxonomy stays
  the fixed `FINANCE_CATEGORIES` list.

  `name-payee` is the honest home for today's `ClassifyRule.merchant` — the knowledge that
  `WM SUPERCENTER` and `WAL-MART` are one company, which is a fact about the world and belongs
  in a row the user can correct. It takes effect **only when a payee is minted for a
  newly-seen alias**; it never renames an existing payee, because renaming is an operation the
  user already owns and a rule must not undo it. That preserves `payees/seed.ts`'s existing
  invariant — a re-run cannot undo an edit — verbatim.

- **D5 — Precedence is unchanged.** Explicit `financeTransactions.category` > commitment
  category (via payee claim) > rule > bank `sourceCategory`. Transfer detection still beats
  rules; a rule naming a `flow` still withholds its row from income-cadence detection; only
  `spend | refund | interest_fee` carry a category.

- **D6 — Nothing runs unattended, and the preview is the whole planner.** Rules apply on import
  and on explicit **Run rules**. Preview is `planReclassify` + `changedRows` **without the
  write** — anything less under-reports, because a new flow-setting rule changes
  `claimedByDetector`, which changes `detectIncome`, which changes the median paycheck and
  therefore every figure on the dashboard. The preview must therefore surface
  `medianPaycheckCents` and `normalizedMonthlyIncomeCents` on both sides, not only row counts.

- **D7 — Identity leaves the rule, in the right order.** `ClassifyRule.merchant` becomes the
  `name-payee` action; `matchRule` and `CLASSIFY_RULES` are deleted once nothing calls them.
  There are **four** consumers, not two — `analytics.ts`'s `effectiveMerchant` is the fourth and
  the widest-reaching (analytics, Sankey, dashboard, agent tools, the Register column).

- **D8 — The refund rekey ships first and separately.** Moving the `spendingMerchants` set from
  merchant strings to payee ids is payee-spec follow-up #3 and is independent of the rules
  table. It is expected to produce a **nonzero** diff; the rules seeding must produce **exactly
  zero**. A circuit breaker that must report zero cannot also contain a known-nonzero change, so
  these are two commits with two audits.

- **D9 — Four dead wires get connected.** Server capability that is built, tested and reachable
  by nothing is not shipped capability.

## Divergences from Actual

| Actual                                                                                | Here                                                                                                 | Why                                                                                                                      |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `rankRules` scores specificity; ties break by id                                      | Explicit user-dragged `sort_key`; first match wins                                                   | `matches` scores 0, so all 65 seeded rules tie and order becomes UUID-random. See D2.                                    |
| Every matching rule's actions run; last wins                                          | One rule per row                                                                                     | Keeps `ruleId` singular and _why is this Dining?_ answerable                                                             |
| `pre` / `post` stages                                                                 | None                                                                                                 | Stages exist to break scoring ties; explicit order already does                                                          |
| A category _is_ an envelope                                                           | A rule sets a taxonomy category; the envelope follows via `sourceCategories` and `budget/autoMap.ts` | Two concepts here. This app had a spending taxonomy before it had envelopes, and they answer different questions.        |
| Rules can set payee, split amounts, link schedules, delete transactions, run formulas | `set category`, `set flow`, `name payee`                                                             | Payee _identity_ is owned by aliases; `name-payee` only names a payee at mint time. The rest have no caller in this app. |
| Rules run on every transaction write                                                  | On import and on explicit **Run rules**, with preview                                                | A category rewrite moves every finance figure on the site. Same stance goal templates took.                              |

## Out of scope

- A user-editable category taxonomy (`FINANCE_CATEGORIES` stays a fixed list).
- Auto-learned category rules (Actual's 3-of-last-5 `updateCategoryRules`).
- Split transactions and sub-transactions.
- Rules that link schedules or delete transactions.
- An OR across fields (`conditionsOp`). `oneOf` covers the within-field case the 65 rules need;
  an OR across fields is two rules.
- Merging Commitments / Available to Spend with envelopes — still deliberately parallel.

## Acceptance criteria

- [x] The refund rekey (D8) lands on its own, with its `refund` ↔ `external_transfer` diff
      reported in signed cents and explained before it is applied. **Result: 0 of 7,030 rows
      move.**
- [ ] Seeding the 65 rules produces `differing === 0` on the real ~7,030-row file, with both
      income figures byte-identical; a second seed plans zero writes.
- [ ] Precedence per D5 holds; a transfer still beats a rule; reclassify still never changes an
      account balance; two runs in a row write zero rows the second time.
- [ ] A second user cannot read, change, reorder, delete, preview or run the first user's rules,
      and cannot make their own rules apply to the first user's transactions.
- [ ] A regex with `g` or `y`, an unparseable source, or an exponential-backtracking shape is
      refused with a message — not accepted and then wrong.
- [ ] Preview writes nothing, and its counts equal the counts the subsequent apply reports.
- [ ] A rule can be created, edited, reordered, disabled and deleted from `/finances/rules`
      without a deploy; **Create rule from this transaction…** prefills from a Register row.
- [ ] `classify/rules.ts` is deleted and `matchRule` has no remaining callers.
- [ ] A hidden envelope can be shown again; envelopes and groups can be created, renamed and
      deleted; the movement log is readable; **Assign remaining** is reachable.
- [ ] Desktop and 390×844 both complete, light and dark; all routes pass `npm run smoke`.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                                                                                                                                                                                                             | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The refund rekey's expected nonzero diff is **zero**: 0 of 7,030 classified rows change flow on the real file. D8's separate-commit sequencing is kept anyway, and the audit it produced (`classify/flowDiff.ts`, `npm run flow:audit`) stays as the standing gate for any future detector change. | The prediction assumed the merchant-string and payee-id keys still disagreed on PayPal rows. They did — until the payee matcher cutover rebuilt the catalog and corrected 88 assignments, which had already repaired that disagreement. This change only removes the dependency on `ClassifyRule.merchant`. A tripwire forcing the refund branch off moved exactly the 64 refund rows and $1,991.49, proving the zero is a real zero rather than an audit that cannot see. |

---

## Task 1: Save spec documentation

- [x] Create `plan.md`, `shape.md`, `standards.md`, `references.md`. No visuals.
- [x] Copy the selected standards in full so the active implementation is self-contained.

## Task 2: Rekey the refund heuristic to payee ids — ships alone (D8)

Payee-spec follow-up #3, independent of everything below.

- `classify/reclassify.ts` — build the "money went out to" set from `payeeIdByRow` instead of
  `perRow.merchant`; `spendingMerchants.has(merchant)` becomes `spendingPayees.has(payeeId)`,
  with `null` **never** a member.
- A one-off audit reporting every row whose `derivedFlow` moves between `refund` and
  `external_transfer`, in counts and signed cents.
- **Expect a nonzero diff and explain it before applying.** `reclassify.ts` sets
  `merchant = fromPaypal.merchant || fromBank.merchant` — `categorize` always prefers the PayPal
  counterparty when non-empty. `aliasFor` prefers the counterparty **only when the bank line is
  opaque** (cutover change #3). So for a PayPal row where the bank names a merchant, the two
  keys genuinely disagree today, and the payee key is the correct one.
- Tests: a credit from a payee money went out to is a refund; a credit from a payee never paid
  is an external transfer; two spellings of one payee share the refund set (the case the string
  key got right only via `ClassifyRule.merchant`); a row with no payee is never a refund.

**As built.** `summarizeFlowChanges` / `formatFlowDiff` in `classify/flowDiff.ts` with eight
tests; `previewFlowChanges` in `mutations.ts` over a new `loadAndPlanReclassify` that a run and
a preview now share, so the count a person confirms cannot drift from the count that lands; and
`npm run flow:audit -- --user <id>`, which has no `--apply` because it cannot write.

On the real 7,030-row file: **0 rows change flow** — see change #1 above. Forcing the refund
branch off moves 64 rows / $1,991.49, which is the tripwire proving the audit can see the
decision it is auditing. 3,232 unit and 848 integration tests pass.

## Task 3: Schema + migration

`finance_rules` in `src/db/schema.ts`, beside `financeSchedules` and `financePayees`, with the
same rationale-carrying header comment those tables have.

| Column                              | Notes                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `id`                                | uuid pk                                                                      |
| `user_id`                           | → `users.id`, cascade                                                        |
| `name`                              | text; unique per user, case-insensitive                                      |
| `conditions`                        | jsonb — array of `{field, op, value}`                                        |
| `actions`                           | jsonb — array of `{op, field?, value}`                                       |
| `enabled`                           | boolean, default true                                                        |
| `sort_key`                          | text fractional index (`src/lib/tree/sortKey.ts`) — **this is the priority** |
| `seeded_id`                         | text, nullable — the `CLASSIFY_RULES.id` this row came from                  |
| `notes`, `created_at`, `updated_at` | `notes` is where a rule's _why_ survives                                     |

Constraints: `unique (user_id, lower(name))`; `unique (user_id, sort_key)`;
`index (user_id, sort_key)`; `unique (user_id, seeded_id) where seeded_id is not null` — the
last is what makes seeding idempotent and what lets the audit say "rule `metlife-pet` decided
this row" in both worlds.

`deletePayee` gains a rules check alongside its existing commitment-claim and schedule-condition
refusals (cutover D9) — forgetting it makes a rule silently stop matching.

Generate with drizzle-kit; commit `.sql` + snapshot + journal together.

## Task 4: The pure rules module — `src/lib/finances/rules/`

Modelled on `schedules/conditions.ts`, whose header says it is the restricted schedule parse and
_not_ the generic engine. This is the generic one.

**`conditions.ts`** — the validating parse, all-or-nothing, so bad JSONB never reaches a matcher.

| Field         | Tested against                                 | Ops                                                     |
| ------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `merchant`    | `normalizeMerchant(description)` — uppercase   | `matches`, `is`, `contains`, `oneOf`                    |
| `description` | the raw bank line                              | `matches`, `contains`, `is`                             |
| `payee`       | `transaction.payeeId`                          | `is`, `oneOf` (UUIDs)                                   |
| `amount`      | signed integer cents, **positive is money in** | `is`, `isapprox`, `isbetween`, `gt`, `gte`, `lt`, `lte` |
| `date`        | `YYYY-MM-DD` calendar day                      | `is`, `isbetween`, `gt`, `gte`, `lt`, `lte`             |
| `account`     | `accountId`                                    | `is`, `oneOf`                                           |

Conditions on one rule are **ANDed only**. Re-export `approxThreshold` / `amountMatches` from
`schedules/conditions.ts` rather than reimplementing them; do **not** import `RecurConfig` —
rule dates are calendar days, not recurrences.

Regex is stored as `{source, flags}`, never a serialized `/…/`, and compiled **at parse**:

1. **Reject `g` and `y`.** `RegExp.prototype.test` with `g` advances `lastIndex`, so a
   compiled-once rule returns alternating answers across 7,030 rows. That is a correctness bug,
   and the easiest way to ship a rules engine that works in the editor and is wrong in the
   register. Allow `i` only.
2. `new RegExp` inside try/catch — an unparseable source fails the parse, not the pass.
3. Reject a source over the length cap.
4. A conservative static backtracking screen: reject a quantified group whose body itself
   contains a quantifier, or a top-level alternation of overlapping branches — `(a+)+`,
   `(a|a)*`, `(\w+\s?)*`. `merchant` regexes only ever run against `normalizeMerchant` output,
   which is short and whitespace-collapsed; that bounds the blast radius but does not remove it,
   since `(a+)+b` on 40 characters is still 2⁴⁰.

**`actions.ts`** — `set category`, `set flow`, `name-payee`. Refused at parse:
`set-split-amount`, `link-schedule`, `delete-transaction`, the notes ops, and `set` on any other
field. Three cross-validations, each a bug waiting to happen if omitted:

- `category` must be a member of `FINANCE_CATEGORIES`. `budget/autoMap.ts` maps taxonomy
  categories onto envelopes via `sourceCategories`; a rule writing `"Restaurants"` produces a
  `derived_category` no envelope claims, and the money vanishes from the budget with no error
  anywhere.
- A rule setting a flow outside `spend|refund|interest_fee` may not also set a category —
  `carriesCategory()` would silently drop it. Refuse rather than discard.
- A rule with a `payee` condition may not carry `name-payee` — circular: the payee must already
  exist for the condition to match.
- A rule with no conditions, or no actions, is invalid.

**`compile.ts`** — `compileRules(rows)` → `{rules, problems}`. Compiles each regex **once per
pass**, not per row: 65 rules × 7,030 rows is 457k `.test()` calls, and a `new RegExp` inside
that loop is the performance bug that only appears on production data. A rule that fails to
parse is dropped and reported, never thrown — a bad row must not take the register down.

**`match.ts`** — `matchRules(rules, row)` returns the first enabled match in `sort_key` order;
`applyRules(rules, row)` returns `{category, flow, payeeName, ruleId}`.

**`summary.ts`** — one-line human summary, for the grid and the seeded `name`.

**Named tests that fail on a plausible mistake:**

_conditions_ — rejects the `g` flag, because `.test()` with `g` is stateful across rows; rejects
`y`; rejects an unparseable source at parse rather than throwing during a pass; rejects a nested
quantifier that backtracks exponentially; rejects a source over the cap; rejects `contains ""`;
rejects an empty condition list — a blank rule must claim nothing, not everything; rejects a
non-integer amount and a non-UUID payee; returns null for the whole list when one entry is bad.

_actions_ — rejects the five out-of-scope ops; rejects a category outside `FINANCE_CATEGORIES`;
rejects a category on a flow that does not carry one; rejects `name-payee` beside a payee
condition; accepts a flow-only rule (`paypal-outbound`); rejects a rule with no actions.

_match_ — matches `merchant` regexes against the **normalized** merchant, not the raw
description (`^GITHUB` must claim `PAYPAL *GITHUB INC`); the earlier rule wins (`METLIFE PET`
above `METLIFE`); **swapping their sort keys swaps the answer**, proving order is load-bearing
rather than incidental; a disabled rule never fires; re-testing one compiled rule against a
second row gives the same answer (the `lastIndex` tripwire); conditions on different fields are
ANDed; `lt -5000` claims a $60 charge and not a $60 deposit; date compares calendar-day strings
with no timezone arithmetic; a payee condition never fires on a row whose `payeeId` is null.

## Task 5: Thread rules through the planner

- `categorize()` takes the compiled rules instead of importing `matchRule`; `merchant` becomes
  the rule's `name-payee` value ?? the normalized string; `ruleId` becomes the rule's UUID.
- `planReclassify(..., rules = [])` — a defaulted trailing parameter keeps every existing call
  site compiling.
- **Preserve the PayPal merge exactly**: `fromPaypal.category ?? fromBank.category` but
  `fromBank.flow ?? fromPaypal.flow`, and `||` (not `??`) on merchant. That asymmetry is
  deliberate and looks undocumented; pin it with a test named _the bank line settles the flow
  and the PayPal counterparty settles the category_ before touching the function.
- Delete the dead `commitmentCategories` default parameter on `categorize()`: it is keyed by
  merchant while its only real caller keys by payee id. Two disagreeing lookups in one file is
  the next reader's trap.
- Rewrite `classify/categorize.test.ts` to drive every existing assertion through the seeded
  rules — the strongest offline regression harness available. **Keep every case.**
- **Trap:** `ruleId` changes from a slug to a UUID. Re-grep consumers before changing the shape.

## Task 6: Seeding + parity audit + CLI (the circuit breaker)

Follow the payee cutover exactly: dry run by default, `--apply` required, `--user` required,
one transaction, one user, all-or-nothing, idempotent via `seeded_id`.

- `planRuleSeed(existing)` — pure. One draft per `CLASSIFY_RULES` entry in array order,
  `sortKey` strictly increasing, `name = seededId = rule.id`, conditions
  `[{field: "merchant", op: "matches", value: {source, flags}}]`, actions from `category`,
  `flow` and `merchant`. Rows whose `seeded_id` exists are skipped — that is the idempotence,
  and it is also why a rule the user renamed or deleted is never resurrected.
- **Asserts `rule.match.flags === ""` on every entry**, so a future flag addition cannot be
  silently dropped by `RegExp.source`.
- **`auditRuleParity(userId)`** — loads rows the way `reclassifyTransactions` does, runs
  `planReclassify` twice (baseline through `matchRule`, candidate through the compiled rules),
  and diffs all four planned fields. Reports: scanned, differing, per-field breakdown; baseline
  `ruleId` slug vs candidate rule name for each differing row; **signed-cent totals per (flow,
  category) on both sides** — money, not row counts, matching the cutover's practice; the
  `derivedFlow` histogram; both income figures; and `nullPayeeRows` (rows with no `payee_id` and
  a non-empty normalized merchant), which gates Task 10. `canApply` is true only when
  `differing === 0` **and** both income figures match. **Unlike the payee cutover there is no
  accepted-difference clause** — there is no known semantic correction here, so any difference
  is a bug.
- An offline half of the same proof in `seed.test.ts`: the compiled seeded rules agree with
  `matchRule` for every distinct normalized merchant in a corpus fixture harvested from
  `categorize.test.ts` plus the local database.
- Integration coverage including a second user who tries to read, seed into, modify and delete
  the first user's rules and fails at each.

Run dry-run → apply → replay locally, then against the real file. **The gate is
`differing === 0` on production before any reader switches.**

## Task 7: Mutations, queries, actions

- `rules/mutations.ts` — `createRule`, `updateRule`, `deleteRule`, `setRuleEnabled`,
  `moveRule(userId, ruleId, beforeId, afterId)` via `sortKey.between`, each taking `userId`
  first and proving ownership before writing. A move is one transaction recomputing only the
  moved rule. `isUniqueViolation` → _A rule named X already exists._
- `rules/queries.ts` — `listRules(userId)` with resolved payee/account names and a match count;
  `previewRules(userId)` returning the D6 preview.
- `mutations.ts` — `reclassifyTransactions` loads and compiles the user's rules alongside its
  existing parallel selects. Add `previewReclassify(userId)`: the same load-and-plan, **writing
  nothing**.
- Thin `"use server"` wrappers in `src/app/finances/actions.ts` returning `ActionResult` /
  `DataActionResult<T>`.
- Integration tests: create/update/delete/reorder/enable; a second user cannot read, update,
  delete or reorder the first user's rule — four separate assertions, each confirming the stored
  row is untouched afterwards; reorder touches only the acting user's rows; deleting the last
  rule leaves reclassify running with zero rules and no crash.
- Reclassify integration additions: a disabled rule stops categorising on the next pass; an
  explicit category still beats a rule; a commitment category still beats a rule; a transfer
  still beats a rule; a second pass writes zero rows. **Keep the existing "reclassify never
  changes an account balance" test** — it is the sharpest test in this layer and this change is
  exactly the kind that could break it.
- Preview tests: preview writes nothing (snapshot both derived columns before and after, assert
  equal); preview counts equal the counts a subsequent apply reports; preview for user B never
  counts user A's rows.

## Task 8: `/finances/rules` and the editor

- `src/app/finances/rules/page.tsx` mirroring `payees/page.tsx` — `getCurrentUserId`,
  `listRules`, `listPayees`, `listAccounts`, `AppShell active="finances"`, `force-dynamic`.
- `src/components/finances/rules/{RulesView,RuleDrawer,ruleColumns,RulePreviewDialog}.tsx`.
  `RulesView` from `PayeesView.tsx`; `RuleDrawer` from `ScheduleDrawer.tsx`, which already holds
  a `{field, op, value}` condition-row editor and `PayeePickerField`; `RulePreviewDialog` on
  `ModalShell` from `PayeeMergeDialog.tsx`, already a preview-then-confirm dialog.
- Columns: priority (drag handle), name, conditions summary, actions summary, enabled, match
  count. **Drag-to-reorder is first-class** — it _is_ the priority model.
- **`merchant` and `description` must read as two distinct fields, never one with a flag.**
  Every seeded `^` is anchored to the normalized string, and the same `^` against a raw
  description means something else. Label them "Merchant (cleaned)" and "Bank description
  (raw)".
- Register the page in `src/lib/navigation/pages.ts` beside `payees` with keywords, add the
  `pages.test.ts` case, and put **Run rules…** in the Finances menu — a command without a menu
  entry is not shipped, and unavailable is disabled with the specific reason, never absent.
- The existing **Reclassify** button on Insights becomes **Run rules…**, opening the preview.
- Phone: list + full-screen sheet; the `⋯` row menu must carry **Move up** / **Move down**,
  because drag is disabled on touch.

## Task 9: Register affordance — Create rule from this transaction…

The `Track as bill…` pattern exactly.

- `rules/fromTransaction.ts` + test — pure `ruleDraftFromTransaction(row)`. Prefills
  `merchant is <normalized>` when the row has a payee (stable, exact) or
  `merchant matches ^<escaped normalized>` when it does not, plus the row's current effective
  category. Proposes, never applies — the module calls no mutation, matching
  `registerBillDraft.ts`.
- **Escape the regex.** `PADDLE.NET`, `AMZN MKTP US*` — an unescaped metacharacter silently
  over-matches. Named test: _escapes regex metacharacters in a merchant name_.
- A `record.create-rule` page command in `FinancesView.tsx`'s `capabilitiesFor`, `rowMenu: true`,
  disabled with _Select a row first_. Opens `RuleDrawer` in create mode.

## Task 10: Retirements

Only after Task 6's production audit reports zero.

1. Delete `classify/rules.ts` entirely — `matchRule`, `CLASSIFY_RULES`, `ClassifyRule.merchant`.
2. `analytics.ts`'s `effectiveMerchant` fallback becomes plain `normalizeMerchant(description)`.
   **This is the fourth consumer and the widest** — it feeds `analytics.ts`, `insightsFilter.ts`,
   `sankeyFlow.ts`, `dashboardQueries.ts`, `registerBillDraft.ts`, `schedules/queries.ts`,
   `agent/financeTools.ts` and two components. It is provably inert iff the audit's
   `nullPayeeRows` is 0, because `matchRule("")` already returns null. **Report the count; do not
   assume it.**
3. `payees/seed.ts` — drop `import { matchRule }`. `planSeed` gains an injected
   `nameHint: (alias) => string | null`; `backfill.ts` supplies one built from the rules table's
   `name-payee` actions. `seed.ts` stays pure and stops importing from `classify/`, which also
   removes a lib-to-lib dependency that existed only for this lookup. Its header paragraph
   "Where the names come from" is now wrong — rewrite it.
   **Sequencing hazard:** this must land _after_ the `name-payee` actions are seeded and live,
   or there is a window in which a new alias mints a payee named `WM SUPERCENTER` instead of
   `Walmart`, and the fix is a manual merge.
4. `src/db/schema.ts` — the `financePayees.name` and `payeeId` comments cite `classify/rules.ts`
   and `CLASSIFY_RULES`. Update both.
5. `classify/transfers.ts` and its test carry comments referencing `CLASSIFY_RULES`.
6. Update `docs/actual-budget/README.md`: the rules row no longer says "next", and the
   divergence table above joins the reference map.

## Task 11: The four dead wires (D9)

- **Hidden envelopes are a one-way door.** `BudgetView.tsx` calls `budgetGridRows(groups, rows)`
  with no options, so `showHidden` is always false and the "Show envelope" menu item is
  unreachable once used. The file's own comment describes the bug: _"without it the only way
  back would be a database."_
- **Envelope/group CRUD is stranded.** `createCategoryGroupAction`, `createBudgetCategoryAction`,
  `renameCategoryGroupAction`, `deleteCategoryGroupAction` and `deleteBudgetCategoryAction` are
  exported from `actions.ts` and referenced by **zero** components. Today a budget can only be
  created from a preset and never changed afterwards.
- **Assign remaining is a dead prop.** `BudgetSummary` renders the button when given
  `onAssignAll`; `BudgetView` renders it without one, while `assignFromReadyToAssign` is built
  and tested.
- **The movement log has no reader.** `finance_budget_months.notes` is appended by `appendNote`
  on every operation and `loadBudget` does not even select it.

## Task 12: Verify, freeze spec, update roadmap

- `npm run lint`, `npm run typecheck`, `npm run test:unit` — **check for the Postgres-skip
  warning**; the integration tests here are worthless if they silently skip.
- `next build`, start the dev server, `npm run smoke` (route list is derived from the
  filesystem, so `/finances/rules` is picked up automatically).
- Drive it on the real file: audit dry, seed, confirm Dashboard, Available to Spend, Insights,
  Sankey, Commitments and Budget are unmoved; add a rule from the Register; drag it above a
  general rule and watch the answer change; preview and run; confirm the preview count equals
  the write.
- Walk the same at 390×844, light and dark.
- Update `plan.md` / `shape.md` for as-built drift, complete **Changes from original plan**,
  mark both **Status: frozen / complete**, update `agent-os/product/roadmap.md` § Financial
  planning.

---

> While this spec is **active**, when we make a material change to requirements, design, or
> scope (including from feedback on what was implemented), update the relevant sections and
> append to **Changes from original plan**. Skip pure implementation details. Freeze when
> verified.
