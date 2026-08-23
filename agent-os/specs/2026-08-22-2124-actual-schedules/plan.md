# Actual-style Schedules & Recurring Transactions

**Status: active**
Spec folder: `agent-os/specs/2026-08-22-2124-actual-schedules/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — that spec's scope note
  named "Schedules, Rules, Payees and Reports" as follow-on specs. This is the first of them.
  Its envelope tables and `finance_transactions.budget_category_id` stand untouched here.
- **Extends:** `agent-os/specs/2026-08-16-1938-commitments/` — tier 1
  (`finance_recurring_bills`) is the **seed source** for schedules. Nothing in that table
  changes; both tiers keep accruing and keep feeding `availableToSpend`.
- **Extends:** `agent-os/specs/2026-08-21-1122-commitments-curation/` — the matcher/category
  curation those rows carry is what makes the import produce usable conditions.
- **Supersedes:** nothing.

## Context

The envelope budget landed and froze on 2026-08-22. Schedules is the sanctioned next slice, and
it is the right one to take before goal templates: Actual's most useful budget template,
`#template schedule <name>`, cannot exist until schedules do.

The user's framing: **absorb Actual Budget into this app in parallel.** Duplication is
acceptable at first. Both systems must read the **same transactions**, so that after living with
them side by side the decision — merge, or keep two pages each good at something different — is
made from use rather than from a spec.

The specific constraint the user named: _"I've already identified almost all of my bills, and I'm
not going to want to have to manually copy them all."_ `finance_recurring_bills` already holds
`matchers`, `cadenceMonths` / `cadenceDays`, `anchorDate`, `dueDay`, `expectedCents`, `category`
and `status` — everything a `RecurConfig` plus an amount condition needs. The import is
mechanical, and this spec makes it one click.

### What Actual's Schedules actually is

Read `../actual/packages/loot-core/src/server/schedules/app.ts` and
`../actual/packages/loot-core/src/shared/schedules.ts`. A schedule there is a **Rule** whose
conditions are `payee is X`, `account is Y`, `amount is|isapprox|isbetween Z`, and
`date is <RecurConfig>`, plus `posts_transaction` / `completed` flags and a stored `next_date`
cursor. From that it derives a status, links posted transactions through
`transactions.schedule`, previews upcoming occurrences in the register, and can auto-post.
`find-schedules.ts` additionally _discovers_ schedules by scanning transaction history.

---

## Decisions

### D1 — A first-class schedules table holding Actual-shaped conditions

`finance_schedules` stores `conditions` as JSONB in Actual's exact `{field, op, value}` shape,
restricted to the four schedule conditions. A schedule-specific evaluator reads that JSON; we do
**not** port the generic rule engine, its indexer, or formula actions.

Why this shape rather than plain typed columns: it is the difference between a later Rules spec
being able to consume this data and having to migrate it. The condition shape is Actual's public
contract between rules and schedules, and it costs nothing to honour now.

```
finance_schedules
  id, user_id, name (unique per user)
  conditions jsonb        -- [{field:'payee',  op:'is'|'oneOf', value:string|string[]},
                          --  {field:'account',op:'is',        value:uuid},
                          --  {field:'amount', op:'is'|'isapprox'|'isbetween', value:...},
                          --  {field:'date',   op:'is'|'isapprox', value:RecurConfig}]
  posts_transaction boolean default false
  completed boolean default false
  next_date date                    -- the advancing cursor, not a derivation
  custom_upcoming_length text null
  source_bill_id uuid null -> finance_recurring_bills(id) on delete set null
  sort_order, created_at, updated_at

finance_transactions
  + schedule_id uuid null -> finance_schedules(id) on delete set null   (+ index)
```

`next_date` is **stored, not derived**, because Actual's is (`setNextDate`, `app.ts:211`).
Skipping an occurrence and being paid early both move the cursor in ways the recurrence rule
alone cannot express.

### D2 — Import from bills is re-runnable, and drift is visible

`sourceBillId` records provenance. Re-running the import skips anything already imported and
picks up bills added since. After import the two lists edit independently.

The user leans toward **bills remaining the source of truth** — they value having every bill
enumerated in one place — but chose to start with the copy so the new system can be exercised on
real data first. What keeps that option open is **drift**: the schedules page compares each
schedule to its source bill (cadence, amount, next due) and badges the difference. When the
merge decision comes, it will have evidence instead of memory.

### D3 — `postsTransaction` is stored and honoured, but nothing writes unattended

Transactions here arrive from bank imports and scrapes. An auto-post service would race the feed
for the same payment and demand a dedup story this slice does not need. The flag is stored and
shown; the only thing that writes a transaction is the user pressing **Post now** on a due
schedule, which inserts exactly one linked row and advances the cursor.

### D4 — All four surfaces are in scope

Schedules page + editor, transaction↔schedule linking, Upcoming in the Register, and
Discover-from-history. Linking is the one that makes this _interoperable_ rather than parallel:
it is the same `finance_transactions` rows serving both systems.

### D5 — The recurrence engine is ours, in pure date-key math

`agent-os/standards/development/dates.md` forbids date-fns / Day.js / Luxon, which rules out
adopting `rschedule` as Actual does. `recur.ts` implements `RecurConfig` expansion over
`YYYY-MM-DD` strings. The **config shape stays byte-identical to Actual's** so the semantics —
and any future import/export — transfer.

---

## Divergences from Actual

1. **No Rules engine.** Conditions in their shape, our evaluator.
2. **No Payees table.** The `payee` condition holds merchant matcher strings and reuses the
   existing `matcherIndex` / `resolveMerchant` (`src/lib/finances/commitments.ts`). `oneOf` is
   permitted so one schedule spans both spellings of a merchant, as bills already do — a small
   widening of Actual's `payee is`.
3. **No auto-post service.** See D3.
4. **No CRDT, no `mutator(undoable(...))`.**
5. **`nextDate` advances at link/import time and on demand**, not from a daily background
   service (`advanceSchedulesService`).
6. **`sourceBillId` and drift** have no Actual counterpart; they exist because the bills list
   stays authoritative in spirit.

---

## Acceptance criteria

- [ ] One action turns every **active** declared bill into a schedule with the correct next
      date; re-running creates nothing new and picks up bills added since.
- [ ] A schedule for "the 2nd Tuesday of every other month" lists the correct next three dates
      in the editor preview.
- [ ] An imported bank transaction matching a schedule flips its status to `paid`, links via
      `schedule_id`, and advances `next_date`.
- [ ] **Skip** advances past an occurrence without writing a transaction.
- [ ] **Post now** inserts exactly one linked transaction and advances the schedule.
- [ ] The Register shows upcoming occurrences within the chosen horizon, and no balance,
      Available to Spend figure, or budget number changes because of them.
- [ ] Discover proposes recurring payments that are not already declared, and creates the
      confirmed ones.
- [ ] A second user cannot read, update or delete the first user's schedules — proven in
      `*.integration.test.ts`.
- [ ] `npm run smoke` passes with the new route.

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: The recurrence engine

`src/lib/finances/schedules/recur.ts` + `recur.test.ts`.

- `RecurConfig` mirroring `../actual/packages/loot-core/src/types/models/schedule.ts` exactly:
  `frequency: 'daily'|'weekly'|'monthly'|'yearly'`, `interval`, `patterns: {value, type}[]`,
  `skipWeekend`, `start`, `endMode: 'never'|'after_n_occurrences'|'on_date'`, `endOccurrences`,
  `endDate`, `weekendSolveMode: 'before'|'after'`.
- `occurrences(config, fromKey, take): string[]` — pure `YYYY-MM-DD` math, building on
  `src/lib/schedule/geometry.ts` and `src/lib/finances/recurringBills.ts`
  (`shiftDateKeyMonths`, `shiftDateKey`, `daysBetweenKeys`). No `Date` for calendar arithmetic.
- Monthly `patterns`: day-of-month including negative (`-1` = last day), and nth-weekday
  (`{type:'TU', value:2}` = 2nd Tuesday; negative counts from the end).
- `skipWeekend` + `weekendSolveMode` applied **after** generation, per
  `getDateWithSkippedWeekend`.

**Named tests for the traps.** Each must be able to fail on a plausible mistake:

1. `interval` anchors on `config.start`, never on today — a bimonthly schedule started in an odd
   month must not flip parity when read from an even one.
2. **Day-31 in a 30-day month.** Verify what rschedule actually does before encoding it — run
   the case against `../actual` rather than assuming a clamp or a skip, and record the answer in
   a comment.
3. Last-day-of-month and nth-weekday-from-end patterns.
4. `skipWeekend` with `weekendSolveMode: 'before'` moving an occurrence into the **prior month**.
5. `endDate` inclusivity, and `after_n_occurrences` counting pre- or post-weekend-solve.
6. A bounded schedule that is exhausted returns its **last** occurrence, not null — Actual's
   `getNextDate` falls back to a reverse take (`shared/schedules.ts`).

## Task 3: Schema and the conditions model

- Add `finance_schedules` and `finance_transactions.schedule_id` to `src/db/schema.ts` with
  doc comments in the house style, plus the index on `(user_id, schedule_id)`.
- Generate the migration with drizzle-kit per `agent-os/standards/database/migrations.md` —
  never hand-written, never without its snapshot.
- `src/lib/finances/schedules/conditions.ts`: condition types, a **validating** parse (bad JSONB
  must not reach the math), `extractScheduleConds`, `getScheduledAmount`, and
  `approxThreshold(n) = round(|n| * 0.075)` (`../actual/packages/loot-core/src/shared/rules.ts`).

## Task 4: Status, cursor, queries and mutations

- `status.ts` — `getStatus(nextDate, completed, hasTrans, upcomingLength, today)` returning
  `completed | paid | due | upcoming | missed | scheduled`, verbatim from `shared/schedules.ts`.
  `today` is a parameter, never the server clock (`dates.md` rule 8).
- `nextDate.ts` — compute, advance, skip. Includes the `weekendSolveMode: 'before'` Friday trap
  documented at `../actual/.../schedules/app.ts:242`, where skipping from a Friday would
  otherwise resolve back to the same date and silently do nothing.
- `queries.ts` / `mutations.ts` under `src/lib/finances/schedules/`. Every mutation takes
  `userId` and scopes by it; `mutations.integration.test.ts` includes a second user failing to
  read, update and delete.

## Task 5: Transaction ↔ schedule linking

- `match.ts` — pure. Given a schedule's conditions and an occurrence date, does a candidate
  transaction satisfy account, merchant (through `resolveMerchant`), amount within threshold,
  and the date window? The window follows `getScheduleOccurrenceMatchStartDate`: exact for
  `date op 'is'` and for `postsTransaction`, otherwise a 2-day lookback, upper-bounded by the
  occurrence date.
- Run linking during import and on demand ("Find matches"); a link writes `schedule_id` and
  advances `next_date`.
- Manual link / unlink from the Register row menu.

## Task 6: Import from declared bills

- `fromBill.ts` — pure `billToScheduleConditions(bill)`:
  - `cadenceDays` present → `daily` interval N, or `weekly` interval N/7 when divisible.
  - `cadenceMonths` → `monthly` interval N; 12 → `yearly` interval 1.
  - `anchorDate` / `dueDay` → `start` plus a day-of-month pattern.
  - `matchers` → `payee is` for one, `payee oneOf` for several.
  - `expectedCents` → `amount isapprox`; absent → no amount condition.
  - Only `active` bills import. `paused`, `cancelled` and `ignored` are skipped, with counts
    reported.
- `importSchedulesFromBills(userId)` — idempotent on `sourceBillId`; returns created / skipped.
- `billDrift(schedule, bill)` — cadence, amount and next-due comparison for the badge.
- Tests: every entry in `CADENCE_CHOICES` round-trips; `dueDay: 31`; a bill with no
  `anchorDate`.

## Task 7: Schedules page and editor

- `/finances/schedules` — the shared DataGrid per `agent-os/standards/components/data-grid.md`:
  name, account, payee, amount, next date, status chip, source bill / drift badge.
- Drawer editor per `components/drawer-pattern.md`: name, account, matchers, amount
  (`is` / `isapprox` / `isbetween`), and the recurrence editor — frequency, interval, monthly
  patterns, skip-weekend + solve mode, end conditions — with a live **next three dates** preview
  (Actual's `getUpcomingDates`).
- Row actions: **Post now**, **Skip next date**, **Complete**, **Delete**. Toolbar: **Import
  from bills…**, **Discover…**.
- Register the page and its commands per `agent-os/standards/components/navigation.md` — a
  command without a menu entry is not shipped.

## Task 8: Upcoming in the Register

- Preview rows for unposted occurrences above today's transactions, with the horizon setting
  (1 day / 1 week / 2 weeks / 1 month / end of current month) and each schedule's
  `customUpcomingLength` override.
- **Preview rows are not transactions.** They must not reach any balance, `availableToSpend`
  figure, or budget number. Worth an explicit assertion, because the register's row type is
  shared.

## Task 9: Discover schedules from history

- Port the semantics of `../actual/packages/loot-core/src/server/schedules/find-schedules.ts`:
  per account, take 3 occurrences of each candidate config, gather transactions within ±2 days,
  match on payee plus amount within threshold, rank by day-distance
  (`1 / (daysOff + 1)`), and dedupe against existing schedules and imported bills.
- Ranking and matching are pure and tested; the query lives in `queries.ts`.
- A proposal modal with checkboxes creates the confirmed ones.

## Task 10: Verify, freeze spec, update roadmap

- `npm run lint`, `npm run typecheck`, `npm run test:unit` — **check for the Postgres-skip
  warning**, since this slice adds integration tests that are worthless if they silently skip.
- `next build`, then **start the dev server and run `npm run smoke`**. Mandatory: this adds a
  route under `src/app/**`, which is exactly the gap the smoke script exists to close.
- Walk the acceptance criteria on the deployed iPhone as well as desktop.
- Update `plan.md` / `shape.md` for as-built drift, complete **Changes from original plan**,
  mark both **Status: frozen / complete**, and update `agent-os/product/roadmap.md`.

---

> **While this spec is active:** update `plan.md` / `shape.md` and append to **Changes from
> original plan** on any material change to requirements, design or scope — including feedback on
> what was actually built. Skip pure implementation details. Freeze when verified.
