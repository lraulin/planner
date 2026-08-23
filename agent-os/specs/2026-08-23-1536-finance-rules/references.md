# References for Rules

## Governing specs

### `agent-os/specs/2026-08-23-0748-finance-payees/`

- **Relationship:** Extends. Claims its **follow-up #3** — _"Shape the Rules engine/editor on
  top of stable payee ids; retire the remaining render-time merchant defaults when identity and
  categorisation move together."_
- **Carries forward:** payee identity is a row; aliases are database-unique and normalized;
  `finance_transactions.payee_id` is derived and recomputable; a re-run of the seed planner
  cannot undo a human edit.
- **What this spec changes:** the canonical-name knowledge that lived in `ClassifyRule.merchant`
  becomes a `name-payee` rule action, so it is data the user owns instead of a deploy.

### `agent-os/specs/2026-08-23-1041-payee-matcher-cutover/`

- **Relationship:** Extends. Claims its **follow-up #1** — _"Shape the generic Rules engine and
  editor on top of stable payee ids, including rule ordering and conflict semantics."_
- **Carries forward:** payee ids are authoritative everywhere and names are display only; D9's
  refusal to delete a payee that is still referenced (this spec adds rules to that check).
- **Key pattern borrowed:** the guarded two-stage migration — a pure deterministic planner,
  dry-run by default, all-or-nothing per user, idempotent, with a parity audit reporting
  differences as counts and **signed cents** rather than transaction ids, and a CLI that
  requires `--apply`. Used twice successfully; used again here.
- **Deliberate difference:** that cutover had an _accepted-difference_ clause for the opaque
  PayPal identity correction. This spec has none — there is no known semantic correction, so
  any difference is a bug.

### `agent-os/specs/2026-08-22-2124-actual-schedules/`

- **Relationship:** Extends.
- **Relevant decisions:** the `{field, op, value}` JSONB condition contract, its validating
  all-or-nothing parse, the `payee oneOf` widening of Actual's `payee is`, and signed integer
  cents with positive meaning money in.
- **Key patterns:** `src/lib/finances/schedules/conditions.ts` is the model for
  `rules/conditions.ts`; `approxThreshold` and `amountMatches` are re-exported rather than
  reimplemented. Its header already says it is the restricted schedule parse and _not_ the
  generic engine — this spec writes the generic one.

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends. Closes four of its follow-ups: creating and reordering envelopes,
  the unreachable "Show envelope" path, the movement log that nothing reads, and (with it)
  Assign remaining.

### `agent-os/specs/2026-08-22-2242-budget-goal-templates/`

- **Relationship:** Extends, for its stance rather than its code: _nothing runs unattended._
  Apply and Overwrite are explicit and each writes a note. Run rules follows the same rule, with
  a preview standing in for the goal indicator.

## Reference implementation — Actual Budget (MIT, © James Long)

Cloned beside this repo at `../actual`. See `docs/actual-budget/README.md`.

### `packages/loot-core/src/server/rules/rule-utils.ts`

- **Relevance:** `OP_SCORES` (lines 18–35) and `computeScore` / `_rankRules` / `rankRules`
  (37–110). **The decisive citation for D2:** `matches: 0`, and the ×2 specificity bonus applies
  only when every condition is `is|isNot|isapprox|oneOf|notOneOf`. A corpus of 65 regexes all
  score zero and tie, so ranking degenerates to a sort by id.

### `packages/loot-core/src/server/rules/condition.ts`

- **Relevance:** `CONDITION_TYPES` (line 29) — the per-field-type op vocabulary this spec
  restricts and adopts.

### `packages/loot-core/src/server/rules/action.ts`

- **Relevance:** the action op set — `set`, `set-split-amount`, `link-schedule`,
  `prepend-notes`, `append-notes`, `delete-transaction`. All but `set` are refused at parse
  here, and the refusals are enumerated so a future reader can see they were considered.

### `packages/loot-core/src/server/rules/rule.ts`

- **Relevance:** how conditions and actions compose per transaction. Not ported — the split
  machinery is most of it and has no caller here.

### `packages/loot-core/src/server/accounts/payees.ts`

- **Relevance:** already the source for payee identity. Cited again because Actual learns payee
  names from imports and lets the user rename, which is exactly the model `name-payee` preserves.

## Similar implementations in this repo

### The engine that already exists

- **Location:** `src/lib/finances/classify/reclassify.ts`, `src/lib/finances/mutations.ts`
- **Relevance:** `planReclassify` is a pure idempotent planner; `changedRows` writes only what
  moved; `reclassifyTransactions` already runs on import and from `/finances/insights`.
- **Key patterns:** the detector ordering in its header is the precedence model this spec must
  not disturb; `mintGroupId` injection is why the module is testable without a database; the
  PayPal double-`categorize` merge is a deliberate asymmetry to pin with a test, not clean up.

### The corpus being migrated

- **Historical location:** `src/lib/finances/classify/rules.ts` (deleted).
- **As-built location:** `src/lib/finances/rules/starterRules.ts` (65 migration-only entries),
  with runtime matching in `rules/match.ts`.
- **Relevance:** the seed source. Its load-bearing comments became the `notes` column; runtime
  classification reads only the user's persisted rows.

### List view + drawer editor

- **Location:** `src/components/finances/payees/{PayeesView,PayeeDrawer,payeeColumns,PayeePickerField,PayeeMergeDialog}.tsx`
- **Relevance:** the closest structural analogue. `PayeeMergeDialog` is already a
  preview-then-confirm `ModalShell`, which is what the run preview needs.

### Condition-row editing

- **Location:** `src/components/finances/schedules/{ScheduleDrawer,scheduleColumns}.tsx`
- **Relevance:** already edits `{field, op, value}` rows and already embeds `PayeePickerField`.

### Propose-never-apply from a Register row

- **Location:** `src/lib/finances/registerBillDraft.ts`, and `Track as bill…` in
  `src/components/finances/FinancesView.tsx`
- **Relevance:** the exact pattern for **Create rule from this transaction…** — a pure draft
  builder that calls no mutation, plus a `rowMenu` page command.

### Fractional-index reordering

- **Location:** `src/lib/tree/sortKey.ts`
- **Relevance:** `sequence` for seeding 65 rules in order, `between` for a single-row move.
