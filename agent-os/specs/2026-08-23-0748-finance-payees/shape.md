# Payees — one merchant identity — Shaping Notes

**Status: frozen / complete** (2026-08-23)

## Scope

Give this app a **payee**: a row with a name the user owns, a set of alias strings it
claims, and a stable id that transactions reference instead of recomputing identity. The
same id is the prepared join for commitments and schedules once their delta migrates them.

Today merchant identity is a function, not a record — `effectiveMerchant()` recomputes it
per row at read time from `normalizeMerchant()` plus a linear scan of 66 hardcoded regexes.
The canonical name lives in code, three tables store the string as a join key, and the one
constraint that protects the arithmetic ("a merchant belongs to at most one commitment")
spans two tables and therefore cannot be a constraint at all.

This is the identity foundation for the remaining Actual work. The matcher-cutover delta
must take the prepared join before Rules follows, and Rules needs the same payee id to
condition on — the dependency that put Schedules before Goal templates.

In scope:

- `finance_payees` + `finance_payee_aliases`, and `finance_transactions.payee_id`.
- Idempotently seeding and maintaining payee identities from the register, including
  processor counterparties, and assigning them during ordinary reclassification.
- Replacement commitment-claim columns, queries and mutations, without activating them yet.
- A `/finances/payees` page that displays activity and edits aliases; the Register shows the
  stored payee name.

### Out of scope

- **The commitment/schedule matcher cutover and Rename/Merge UI.** Real-file verification
  proved a partial read cutover moves Available to Spend before legacy matcher strings have
  migrated. Those readers, editors and agent contracts need one delta spec and one atomic
  behavioral cutover. The rename/merge mutations remain tested but unreachable until then.
- **The rules engine, editor and register affordances** — the next spec.
- Auto-learned category rules (Actual's 3-of-last-5 `updateCategoryRules`).
- A per-transaction payee override (D4 explains why the alias edit is the correction).
- Payee `favorite` / `learn_categories`, and transfer payees — `transferGroupId` already
  pairs both legs of a movement, which is what Actual's `transfer_acct` payee is for.
- Turning `financePaymentResolutions.counterparty` into a payee reference.

## Decisions

D1–D7 and the divergence table live in `plan.md`. The shaping arguments behind them:

- **Why an alias table and not `text[]` on the payee.** The whole reason to do this at all
  is that "one merchant string belongs to one payee" should be the database's job. An array
  column cannot carry a unique index across rows; a child table can. The choice follows
  directly from the complaint.

- **Why the commitment claim inverted.** `schema.ts:2483` says the exclusivity rule is
  enforced in two mutations "because Postgres cannot express that across two tables". Put
  the claim on the payee and it becomes expressible: one payee, one row, at most one claim,
  `CHECK (num_nonnulls(...) <= 1)`. Inverting ownership is the price, and it is the ordinary
  direction for a many-to-one anyway.

- **Why no `payee_mapping`.** Actual needs the indirection because undo replays backwards
  and has to reproject ids consistently — their own comment at `rule-utils.ts:118-127` says
  so. We have neither CRDT sync nor an undo log, so the table would exist to hold identity
  mappings that are always the identity. Merge does the rewrite instead, in one transaction.
  Recorded as a divergence so the next reader does not "restore" it.

- **Why the payee is derived and not editable per row.** The value of this feature is that
  one correction fixes every row a merchant ever produced. A per-transaction dropdown gives
  the opposite: a correction that fixes one row and leaves the next import wrong. The
  existing `matchers` model already made this choice and it is the half of it that worked.

- **Why `CLASSIFY_RULES` survives.** Its `category` and `flow` entries are unrelated to
  identity and keep working. Only the 48 `merchant:` entries are consumed — once, as seed
  data for payee names. Deleting the list would mean re-deciding categorisation inside a
  spec about identity, and the Rules spec is where that belongs.

- **What could go wrong, and how it is caught.** Every risk here is silent: a matcher that
  resolves to no payee makes a commitment's spend quietly drop to zero; a merged payee
  leaves a dangling id inside schedule JSONB that no FK protects. The implementation stopped
  at the additive identity layer when the real-file check caught that partial cutover. The
  follow-up delta owns the pre-drop assertions; this slice proves seeding itself moves no
  finance number.

## Context

- **Visuals:** None. Actual's own payees UI
  (`packages/desktop-client/src/components/payees/`) is the reference.
- **References:** see `references.md` — Actual's `payees.ts`, `db/index.ts` merge/mapping,
  and in-repo `classify/`, `analytics.ts`, `schedules/conditions.ts`, `budget/autoMap.ts`.
- **Product alignment:** the Finances module's stated direction is that facts the user
  states once should keep paying off — the argument the commitments spec made for
  `matchers` and the budget spec made for `sourceCategories`. This finishes that thought for
  merchant identity. Roadmap item: the Rules/Payees follow-on named by all three frozen
  Actual specs.

## Standards Applied

- `development/clean-code` — `lib` never imports `app`; every mutation takes `userId`;
  one shared implementation per concern (the resolver is one module, not a copy per caller).
- `development/testing` — pure logic in `src/lib/**` with tests beside it; DB work gets a
  `*.integration.test.ts` including the second-user case; no React component tests.
- `development/security` — every payee and alias mutation proves ownership before writing.
- `development/dates` — the backfill and any date-keyed assertion use `YYYY-MM-DD` keys.
- `development/commits` — one logical change per commit; the message is the record.
- `database/migrations` — drizzle-kit generated, never hand-written, snapshot included.
- `components/data-grid` — the payees page is a column array over the one `DataGrid`.
- `components/drawer-pattern` — alias editing is a drawer with the standard footer.
- `components/modal-pattern` — merge is a `ModalShell` confirmation naming what moves.
- `components/ux-principles` — inline editing for rename; modals only for confirmation.
- `components/navigation` — the page is registered in one registry, with its commands.
- `components/responsive` — list + sheet below `md`; the row menu is a real bottom sheet.
