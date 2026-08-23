# Actual-style Schedules & Recurring Transactions — Shaping Notes

**Status: frozen / complete** (2026-08-22)

## Scope

Reimplement Actual Budget's **Schedules** feature inside the Finances module, running in
parallel with the existing Commitments tiers rather than replacing them, and seeded from the
declared bills the user has already curated.

In scope:

- `finance_schedules` with Actual-shaped `conditions` JSONB, and `finance_transactions.schedule_id`.
- A recurrence engine implementing Actual's `RecurConfig` in pure `YYYY-MM-DD` math.
- Schedule status, next-date cursor, skip, complete, and manual post.
- Transaction ↔ schedule linking, run on import and on demand.
- One-click, re-runnable import from `finance_recurring_bills`, with drift reporting.
- `/finances/schedules` page with a drawer editor and a live next-dates preview.
- Upcoming preview rows in the Register with a configurable horizon.
- Discover-schedules-from-history with a proposal modal.

### Out of scope

- **The generic Rules engine** (conditions + actions applied on import). Its own spec; this
  slice stores conditions in its shape so that spec can consume them.
- **Payees.** Merchant matcher strings stand in. Own spec.
- **Auto-posting on a schedule.** The flag is stored and honoured in the UI; no background job.
- **Goal templates** (`#template schedule <name>`) — the natural next spec once schedules exist.
- **Reports.**
- **Merging with Available to Spend or with Commitments.** Deliberately deferred until both
  have been lived with; that is the whole point of building in parallel.
- Backfilling `schedule_id` across all historical transactions beyond what linking naturally
  matches.

## Decisions

- **D1** — First-class `finance_schedules`, conditions stored in Actual's `{field, op, value}`
  shape. Not a plain-columns model (closes the door on Rules), not a full rule-engine port
  (much larger slice).
- **D2** — Import from bills is a re-runnable copy with `sourceBillId` provenance **and drift
  reporting**. The user leans toward bills staying the source of truth and values having every
  bill enumerated in one place, but chose to start with the copy in order to exercise the new
  system on real data first. Drift is what keeps the merge decision evidence-based later.
- **D3** — `postsTransaction` stored and shown; only an explicit **Post now** writes anything.
  Transactions arrive from bank feeds here, so an unattended poster would race the feed for the
  same payment.
- **D4** — All four surfaces ship in this slice, including Discover.
- **D5** — The recurrence engine is ours: `dates.md` forbids date-fns/Luxon, which rules out
  rschedule. The **config shape** stays identical to Actual's; only the expansion is rewritten.

## Context

- **Visuals:** None.
- **References:** `../actual` (MIT) — `loot-core/src/server/schedules/{app,find-schedules}.ts`,
  `loot-core/src/shared/schedules.ts`, `loot-core/src/types/models/{schedule,rule}.ts`,
  `loot-core/src/shared/rules.ts`. In this repo: `src/lib/finances/recurringBills.ts`
  (cadence model and date-key math), `src/lib/finances/commitments.ts`
  (`matcherIndex` / `resolveMerchant`), `src/lib/finances/budget/` (the shape a recent
  Actual-derived module takes here), `src/db/schema.ts`.
- **Product alignment:** Continues the Finances module's absorption of Actual, following the
  frozen `2026-08-22-1948-zero-based-budget`, which named Schedules as a follow-on. Taking it
  before goal templates is deliberate: `#template schedule <name>` depends on it.

## Standards Applied

- `database/migrations` — new table plus a column on `finance_transactions`; drizzle-generated.
- `development/dates` — the whole recurrence engine is calendar-day math; the reason we do not
  adopt rschedule.
- `development/testing` — pure logic in `src/lib/**` with tests beside it; the cross-user
  integration test; the reminder that `test:unit` green does not mean the DB tests ran, and that
  `npm run smoke` is a step you take after touching `src/app/**`.
- `development/clean-code` — `app → components → lib → db`; every mutation takes `userId`.
- `development/security` — cross-user scoping proven, not assumed.
- `components/data-grid`, `components/drawer-pattern`, `components/navigation`,
  `components/ux-principles`, `components/responsive` — the page, the editor, and getting to it.
