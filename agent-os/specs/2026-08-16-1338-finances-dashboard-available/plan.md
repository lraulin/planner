# Finances Dashboard — available to spend

**Status: frozen / complete** (2026-08-16)
Spec folder: `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`

This is the as-built record. Further change opens a new delta-spec.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-15-1315-live-bank-sync/` — the synced balance leads for
  linked accounts, `balanceAsOf` is the provider's timestamp rather than the read time,
  `pending` is a real column, and there is no forced refresh.
- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — sign convention
  (positive is money into the account), integer cents, account identity.
- **Extends:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` — paycheck cadence
  detection and pay periods.
- **Extends:** `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/` and
  `agent-os/specs/2026-08-14-1104-unscheduled-bills/` — the declared-bill table this adds two
  columns to. `scheduled` stays orthogonal to `set_aside`: one says whether the date is
  knowable, the other whether the cost is accrued.
- **Supersedes:** `agent-os/specs/2026-08-15-1315-live-bank-sync/` — its
  "Available-to-spend / safe-to-spend / envelopes — the next Finances spec" deferral, **only**.
  Every other decision in that spec stands, and this one is built on top of them.

Insights is not superseded in any respect. It keeps every number it owns.

## Context

SimpleFIN sync now puts fresh balances and transactions in the register
(`2026-08-15-1315-live-bank-sync`, active). That spec deliberately stopped at the feed and named
this work as its successor, twice:

> "The 'available to spend before payday' view is a follow-on spec that should be designed
> against real fresh data rather than imagined ahead of it."
> Out of scope: "Available-to-spend / safe-to-spend / envelopes — the next Finances spec."

The roadmap agrees — `agent-os/product/roadmap.md` § Financial planning reads
`**Next:** Envelopes`, deferred since 2026-08-12 "until there is real spending data to design
them against". That data now exists.

Every finance page today answers a **retrospective** question. Register is what happened,
Insights is what life costs, Statements is whether the record is complete. Nothing answers the
question that actually changes behaviour on a Tuesday: **how much can I spend before the next
paycheck, and how many days is that.** This spec builds that page, MVP-scoped to accounts plus
one set-aside (rent), with the structure envelopes will later slot into.

## Decisions

**D1 — New page `/finances/dashboard`, labelled "Dashboard", first tab and the module default.**
Finances page order in `src/lib/navigation/pages.ts` becomes **Dashboard, Insights, Register,
Statements, Orders** — status first, then the analysis, then the detail behind it.
`isDefault: true` moves from `register` to `dashboard`; the registry allows exactly one, and
`pages.test.ts` asserts it.

> Caveat worth knowing rather than discovering: `moduleEntryRedirect` sends a bare `/finances`
> to the **remembered** page from the `shell` settings scope and only falls back to the default.
> An existing session that last sat on Register keeps landing on Register until Dashboard is
> visited once. Nothing is broken; that is the persisted-UI-state contract working.

**D2 — Available to spend = spendable cash − card debt − set-asides.**

```
availableCents =
    Σ balanceCents  where kind ∈ {checking, cash}          // spendable cash
  + Σ balanceCents  where kind = credit_card               // already negative → subtracts
  + Σ pending amounts on those accounts                    // outflows are negative
  − setAsideHeldCents                                      // D4/D5
```

Savings, investment, loan and other are **excluded** — money that is not "spend it this
fortnight" money. The card term is the deliberate part: a card charge does not touch checking
until the statement is paid, so a figure that ignores card balances overstates by exactly the
amount most easily overspent. The number is allowed to go negative and must render that way;
rounding a negative up to zero would be the one lie this page exists to stop telling.

Because the sign convention is uniform — positive is money into the account, for every kind —
every term is an addition. There is no branch on account kind anywhere in the arithmetic, only
in which accounts are selected.

**D2a — Pending rows are added only for accounts whose headline is a synced balance.**
`FinanceAccountRow.balanceCents` is already the three-tier headline (synced > statement-anchored

> ledger sum, `queries.ts`). SimpleFIN's `balance` is the posted balance, so pending rows must
> be added on top of it — but the statement-anchored and ledger tiers **already contain** every
> row on the account, pending included. Adding pending unconditionally double-counts exactly the
> accounts that have pending rows.

The guard is `syncedBalanceAsOf !== null`, which is already on the row type. Tested in both
directions, because the failure is invisible: the number is merely wrong, never absent.

D8a of the live-bank-sync spec forces this route. SimpleFIN's `available-balance` came back `0`
for every account including a checking account holding $571.45, and that spec says in terms that
the follow-on "has to derive that figure from the balance and pending rows, not from this field."

**D3 — Cash position ("true net") = checking + savings + cash − card debt.** The second
headline. Deliberately **not** `assetDebtAt()` from `analytics.ts` — that folds in investment and
loan for a net-worth reading over time, which is a different question from "what do I actually
hold right now". Both numbers stay on the page; the gap between them is the useful signal (cash
tied up in savings), so they are computed side by side rather than one derived from the other.

**D4 — Set-asides are a flag on declared recurring bills, not a new table.**
`finance_recurring_bills` already holds merchant, `cadenceMonths`, `expectedCents`, `anchorDate`
and `scheduled` per user, unique on `(userId, merchant)`. Two columns:

- `set_aside boolean not null default false` — accrue for this bill out of each paycheck.
- `due_day smallint` (1–31, nullable) — day of the period the charge is expected. Null keeps
  today's behaviour, where `nextDueDate` walks from the last charge.

A separate `finance_set_asides` table was rejected: it would duplicate merchant, cadence and
expected amount, and two tables would then answer "what does rent cost" — the exact ambiguity
`upsertRecurringBill`'s unique constraint exists to prevent. Rent is one flagged row today;
every other bill becomes a set-aside with one checkbox and no migration.

**D5 — Accrual, not a cliff.** The user's model, stated directly: half of rent set aside out of
each paycheck, until rent is actually paid.

```
paydaysPerCadence = max(1, round(26 × cadenceMonths / 12))   // monthly → 2, yearly → 26
perPaycheckCents  = round(expectedCents / paydaysPerCadence)
heldCents         = min(expectedCents, perPaycheckCents × paydaysSinceAccrualStart)
```

Accrual start is the last posted charge for that merchant, else `anchorDate`, else the first
payday on file. **`heldCents` drops to zero the moment the charge posts for the current period**
— that is what "until the rent is actually paid" means, and it is the behaviour that makes the
number trustworthy rather than a permanent tax on the headline.

"Has it posted this period" is `effectiveMerchant(row) === bill.merchant` on a row dated at or
after the current period start — the same merchant identity the bill was declared under, so a
description the bank wraps differently still matches. (`RENT:RAULIN RENT:RAULI` from the Capital
One export and `RENT:RAULIN` from the feed are one merchant; that equivalence already exists and
is not re-derived here.)

`paydaysPerCadence` counts paychecks, not days, for the same reason `cadence_months` is months:
a fortnight-derived divisor drifts, and a divisor of 2 for a monthly bill is what the user
actually described.

**D6 — Next payday is detected, with an override.** `detectIncome()` already finds biweekly
payday series by **cadence, not merchant name** — it survived an Endava → TrustedQA `DIR DEP` →
TrustedQA `PAYROLL` succession. The next payday walks forward from the newest payday by the
median observed gap until it passes today.

The override exists because detection is retrospective: a job change, or a sync a few days
behind, silently makes the headline wrong in the direction that matters. An anchor date plus
cadence-days pair in Settings wins when set, and the page **says which one it used** — a
projected date that reads as knowledge is worse than no date, the rule
`2026-08-14-1104-unscheduled-bills` established for propane.

Stored in a settings scope alongside the Insights view settings (`src/lib/settings/finances.ts`)
rather than as a users column: small, per-user, already server-seeded through
`loadSettingsForSession()`, and needs no migration.

**D7 — All arithmetic is pure and takes `today` as a parameter.**
`agent-os/standards/development/dates.md` rule 8: no business rule may depend on the server's
`TZ`. Every function in the new module takes a `todayKey: string`; the view supplies it from
`useToday()`, which returns `null` on the server and before hydration so the day count does not
flash a wrong value. Month arithmetic runs on `YYYY-MM-DD` parts via `shiftDateKeyMonths` and
`daysBetweenKeys`, never a `Date` round-trip.

**D8 — The page states what it cannot see.** Sync age (`bank_connections.lastSyncedAt`),
unmatched accounts, accounts with no live feed, and how many declared bills are not set-asides.
SimpleFIN has no forced refresh (D5c of the sync spec), so the page must say the data is as
fresh as the bank made it rather than imply a button conjures more.

### Out of scope

- Full envelopes: multiple funded categories, rollover, reallocation, per-envelope spending.
  This spec builds the set-aside primitive and the surface they will live on; it does not build
  the envelope model. That stays roadmap **Next**.
- Goals integration ("save for X, fund project Y") and AI advice on top of envelope history.
- Any scheduled or background sync. Refresh stays the manual button in Settings.
- Retiring or changing Insights, Register, Statements or Orders beyond their tab order.
- Charts. This page is numbers and short lists; Insights owns the charts.

## Acceptance criteria

- [x] `/finances/dashboard` renders and is the first Finances tab; order is Dashboard, Insights,
      Register, Statements, Orders.
- [x] Every account appears with its headline balance, its kind, and how fresh the number is
      (synced timestamp, statement close, or ledger sum).
- [x] Cash position matches checking + savings + cash − card debt, hand-checked against the
      accounts list on the same page. ($571.45 + $1,381.14 − $149.36 = $1,803.23)
- [x] The available-to-spend headline shows its own arithmetic — each term visible, not just the
      total — and renders correctly when negative. (−$686.96 with rent held)
- [x] A linked account's pending rows reduce available-to-spend exactly once (D2a); an unlinked
      account's rows are not double-counted. (unit tests both directions; live pending −$59.05)
- [x] Days-until-payday matches a hand count from the detected payday series, and the page names
      whether the date was detected or overridden. (3 days until 2026-08-19, detected)
- [x] Rent declared with `set_aside` reduces available-to-spend by one half-share per payday
      since the last rent charge, capped at the full amount. ($1,050 of $2,100, due 2026-08-31)
- [x] When a rent charge posts, the set-aside for that period drops to zero on the next render.
      (unit-tested; this period's rent has not posted yet, so the live page still holds $1,050)
- [x] A second user cannot read or write the first user's `set_aside` / `due_day` values.
- [x] `npm run test:unit` passes **including** the database tests (check for the skip warning).
      2566 unit + finance/settings integration, no skip.
- [x] `npm run smoke` passes with every route rendering, including the new one. (54/54)
- [x] Headline and day count readable at phone width (Chrome 390×844). Confirm on the deployed
      iPhone after this lands — see Follow-ups.

## Changes from original plan

| #   | Change                                                                                                                                                                 | Why                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No due-day field on the Insights recurring table. `due_day` is stored and used as the accrual fallback when a flagged bill has neither a last charge nor `anchorDate`. | The table was already at `min-w-[34rem]` after the hold-back checkbox. Rent — the only flagged bill — has charge history, so the next due date walks from the last post. An editor for a column nobody can see yet is a follow-up, not a blocker. |
| 2   | `setAsideHeld` does not return `paidThisPeriod`.                                                                                                                       | With the period start already being the last posted charge, the flag is true by construction and could only ever zero a figure that was about to be zero. One mechanism, not two.                                                                 |
| 3   | Accrual start is last charge, then `anchorDate`, then `dueDay`, then the first payday on file.                                                                         | D5 listed the first three as last charge / anchor / first payday. A freshly declared bill with a due day and no history would otherwise sit at zero until its first charge.                                                                       |
| 4   | Sync freshness uses `localDateKey` of the instant, not a UTC `toISOString().slice`.                                                                                    | `syncedBalanceAsOf` and `lastSyncedAt` are instants. The UTC day is the deploy-region bug `development/dates.md` exists to stop.                                                                                                                  |
| 5   | Insights labels the checkbox **Hold back**, next to the existing monthly **Set aside** column.                                                                         | That column already meant "monthly budget line" (annual / 12). Reusing the name for the flag would have given two answers to "what is set aside" on the same row.                                                                                 |
| 6   | `loadDashboard` is one composed read. The page does not `Promise.all` several loaders.                                                                                 | Accounts, pending, bills, paydays, bill charges and connections are slices of one position. Paydays and charges are derived server-side because they do not depend on "today".                                                                    |

## Follow-ups (new work — not amendments to this frozen spec)

- Confirm the headline and day count on the deployed iPhone.
- Hand-check the linked-account headlines against Capital One's and Chase's own apps. Settings already agrees with the dashboard (Chase −$89.58, Cap One −$59.78, checking $571.45, savings $1,381.14).
- A due-day editor on a flagged bill that has no charge history.
- Envelopes remain roadmap **Next**. This shipped the set-aside primitive and the surface, not the envelope model.

## Task 1 — Save spec documentation

This folder: `plan.md` (active), `shape.md`, `standards.md`, `references.md`. No `visuals/` —
none were provided.

## Task 2 — Schema: set-aside columns

- `src/db/schema.ts` — add `setAside` and `dueDay` to `financeRecurringBills`, with a CHECK on
  `due_day` between 1 and 31 mirroring the existing `cadence_months` CHECK.
- Generate the migration with the project's generate script — never hand-write it
  (`agent-os/standards/database/migrations.md`). Do not run `db:push`.
- `src/lib/finances/recurringBills.ts` — extend `DeclaredBill`; it mirrors the columns.

## Task 3 — Pure arithmetic: `src/lib/finances/available.ts` + `available.test.ts`

New module, no database import, everything taking `todayKey`. This is where the reasoning lives,
so this is where the tests are.

- `cashPosition(accounts)` → `{ spendableCents, savingsCents, cardDebtCents, netCents }` (D3).
- `nextPayday(paydays, override, todayKey)` → `{ dateKey, daysAway, source }`.
- `setAsideHeld(bill, paydays, charges, todayKey)` →
  `{ perPaycheckCents, heldCents, paidThisPeriod, periodStartKey }` (D4, D5).
- `availableToSpend(accounts, pendingRows, setAsides)` → the total **plus its terms**, so the UI
  renders the arithmetic rather than restating it (D2, D2a).

Tests that would fail on a plausible mistake, not restatements of the code:

- Pending double-count: one account modelled as synced and once as statement-anchored; the
  synced case adds pending, the other does not.
- Card sign: a `credit_card` row at −$301 must _reduce_ available and _reduce_ net. An inverted
  sign here is the highest-consequence single-character error on the page and looks entirely
  plausible either way.
- Set-aside caps at `expectedCents`, and returns 0 for a period whose charge has posted.
- `paydaysPerCadence`: monthly → 2, quarterly → 7, yearly → 26.
- Payday projection across a month boundary and across a detected gap; override wins and reports
  its source.
- Empty history: no paydays, no bills, no accounts — every function returns a defined shape
  rather than `NaN`.

## Task 4 — Reads: extend `src/lib/finances/dashboardQueries.ts`

`loadDashboard(userId)` — accounts via the existing `listAccounts(userId)` (already computes the
three-tier headline and `syncedBalanceAsOf`; do not reimplement), pending rows, declared bills
with the new columns, the income rows payday detection needs, and connection freshness
(`lastSyncedAt`, `unmatchedAccountCount`, `reauthRequiredAt`) — **never** the access URL.

`userId` first, scoped in the `where`, plain typed `…Cents: number` return shapes. Integration
test with a second user attempting to read the first user's dashboard.

## Task 5 — Settings: payday override

`src/lib/settings/finances.ts` gains a payday scope
(`{ anchorDate: string | null, cadenceDays: number | null }`), parsed with the existing helpers;
scope id in `src/lib/settings/scopes.ts`. Fields in the Finances area of `/settings`, near
`BankSyncPanel`.

## Task 6 — Set-aside UI on declared bills

Extend the existing declaration surface rather than adding a second one:
`src/components/finances/insights/RecurringTable.tsx` gains a set-aside control and a due-day
field; `upsertRecurringBill` carries them through. Integration test covering the cross-user case
on the new columns.

## Task 7 — The page

- `src/app/finances/dashboard/page.tsx` — server component, `force-dynamic`,
  `getCurrentUserId()` → `Promise.all([...])` → `<AppShell active="finances">` → one client view.
  Exactly the shape of `src/app/finances/insights/page.tsx`.
- `src/components/finances/dashboard/DashboardView.tsx` — `"use client"`, `useToday()`, one
  `useMemo` over the pure module. No arithmetic in the component.
- Reuse `Panel`, `StatTile`, `StatRow`, `PanelEmpty` and `formatUsd`. No new UI primitives, no
  chart library, no `Intl` currency formatter.
- Layout, top to bottom: available to spend (headline + every term + days until payday with its
  provenance); cash position; accounts; set aside; what this cannot see.
- Mobile first: the headline and day count legible at phone width without scrolling.

## Task 8 — Navigation

- `src/lib/navigation/pages.ts` — insert `dashboard`, reorder, move `isDefault` off `register`.
- `src/lib/navigation/pages.test.ts` — update the finances expectations.
- `src/app/finances/page.tsx` — its docstring claims Register is the only built page. Already
  stale before this change; correct it while here.
- Confirm the command palette picks the page up through the registry rather than needing its own
  entry.

## Task 9 — Verify, freeze, update roadmap

Done. Lint, typecheck, 2566 unit tests, finance/settings integration tests, smoke (54/54),
browser at 1280×800 and 390×844. Roadmap already records the ship. iPhone-on-device is a
follow-up after push.

## As built

| Piece           | Where                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| Arithmetic      | `src/lib/finances/available.ts` + `available.test.ts`                             |
| Reads           | `loadDashboard` in `src/lib/finances/dashboardQueries.ts`                         |
| Columns         | `finance_recurring_bills.set_aside`, `due_day` — migration `0045`                 |
| Payday override | `payday` settings scope; `PayCadencePanel` on Settings → Connections              |
| Hold-back       | checkbox on `RecurringTable`; `upsertRecurringBill` carries `setAside` / `dueDay` |
| Page            | `/finances/dashboard` → `DashboardView` (one `useMemo`, `useToday`)               |
| Nav             | `pages.ts` — Dashboard first and `isDefault`                                      |
