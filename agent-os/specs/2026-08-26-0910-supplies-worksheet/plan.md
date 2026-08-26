# Supplies — recurring-consumable cost worksheet

**Status: active**
Spec folder: `agent-os/specs/2026-08-26-0910-supplies-worksheet/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-14-1439-amazon-order-ingest/` — the boundary that a
  standalone finance surface owns its own tables and never writes `finance_transactions`.
  Supplies reads `amazon_order_items`; it adds one index to that table and changes nothing else.
- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — module ground
  rules: own tables carrying their own `userId`, the shared `DataGrid`, no second hierarchy.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` (active) — envelopes are rows on
  `finance_budget_categories` behind a `kind` discriminator. Supplies references an envelope
  read-only and never writes one.
- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` — one registry entry per page,
  shell-owned page bar, `isDefault` untouched.
- **Supersedes:** nothing.

## Context

Lee keeps a spreadsheet that prices out recurring consumables — cat food, energy drinks,
toothpaste — to answer "what does this actually cost me per year, and am I buying it from
the right place?" He wants it in the app.

Three things it must do that the spreadsheet does badly or not at all:

1. **Compare offers.** Different vendors, brands and pack sizes for the same thing. The
   spreadsheet is flat, so a comparison row is indistinguishable from a real expense and
   double-counts in the total.
2. **Handle items with no countable daily rate.** Toothpaste, Scalpicin. You cannot
   estimate "units per day"; you can estimate "one tube lasts about 45 days".
3. **Not be re-typed from scratch.** The Amazon order history already in the database
   (3,393 retail line items, per-item ASIN / product name / quantity / unit price / order
   date) knows what he rebuys and how often.

**Explicitly not connected to the budget.** Attributing a Walmart charge across envelopes
needs split transactions, which is friction that would kill the habit. This writes nothing
into the budget and does not affect Ready to Assign.

Verified against the CSV he supplied: the `Cost Biweekly` column is internally consistent
in both rows (`units/day × 14 ÷ qty × cost per order`), but `Cost Per Month` and
`Cost Per Year` are not — row 2's `$62.85/mo` is roughly half its own biweekly doubled,
because the sheet derives year from month × 12 rather than from a daily rate. This spec
recomputes every period from cost-per-day rather than reproducing that drift.

## Decisions

### D1. Item owns consumption; option owns price

The model correction that makes everything else fall out. One `finance_supply_items` row
per thing consumed (`Canned Cat Food`, `4 cans/day`), with N `finance_supply_options`
beneath it — each an offer (`Fancy Feast · Walmart · 42ct · $38.97`). Exactly one option
per item is marked `in_use` and drives the totals; the rest sit there purely as price
comparison and never touch a total.

The consumption rate lives on the **item**, never on the option, so switching to a
different pack size never means re-typing how fast you go through it. Pack size affects
cost only.

### D2. Two rate bases, exactly one populated, enforced by the database

- `units_per_day` basis → `units_per_day_milli` (thousandths; `4/day` = `4000`)
- `days_per_unit` basis → `days_per_unit_tenths` (tenths of a day; `45 days` = `450`)

`days_per_unit` is **days one unit lasts**, not days one purchase lasts — so it stays a
property of the item and is unaffected by pack size, same as D1. A 3-pack of tubes at 45
days/tube simply lasts 135 days. The other value is derived for display and shown greyed.

A `CHECK` constraint enforces that the basis and the populated column agree and the other
is `NULL`, so "exactly one is set" cannot rot into an application-code rule.

### D3. Group label and envelope link are two different fields

This answers Lee's note about wanting to use the worksheet to _reorganise_ the budget
("maybe I can get all my pet stuff from Chewy, then... a separate Pets category instead of
including it in groceries").

- `group_label` — free text, how you slice the worksheet. You must be able to name a group
  **before** the envelope exists.
- `envelope_id` — nullable FK to `finance_budget_categories`, which envelope pays for it
  _today_. Read-only comparison target.

These are genuinely different concepts, not a duplicated one: the payoff is a group header
reading **"Pets — est. $1,355/yr · currently funded from Groceries"**, which is exactly the
signal that Pets should become its own envelope. A single field cannot say that. Matching
envelope by name string is rejected — `CLAUDE.md` names that pattern specifically.

### D4. Cost per unit is derived, never stored

`$38.97 ÷ 42 = $0.9279` is fractional cents. Per `src/lib/finances/money.ts`, money is
integer cents; a stored `$0.93` would make columns stop summing. Cost per unit is computed
for display at 3–4 decimal places and never persisted.

### D5. Each period rounds independently from cost-per-day

`biweekly = round(costPerDay × 14)`, `monthly = round(costPerDay × 30.4375)`,
`yearly = round(costPerDay × 365.25)` — using `365.25 / 12`, not `month × 12`. Consequence:
`monthly × 12 ≠ yearly` by a few cents. Accepted and asserted in a test, because the
alternative is the drift already in the CSV. Footer totals are the **sum of the displayed
row values**, so the column visibly adds up.

### D6. Amazon suggestions are a prefill, never a sync

`Suggest from Amazon` proposes rows; nothing auto-creates, nothing back-fills later. The
suggested consumption rate is `totalUnits ÷ observedSpanDays`, which is an estimate the
user is expected to correct. `asin` is stored on the option so re-suggesting can recognise
what already exists rather than duplicating it.

## Acceptance criteria

- [ ] `/finances/supplies` renders, appears in the Finances page bar as **Supplies**.
- [ ] Both CSV rows can be entered and produce a defensible biweekly figure matching the
      sheet's `Cost Biweekly` ($51.96 and $55.21).
- [ ] A toothpaste-style item can be entered with only "one tube lasts 45 days" and no
      units-per-day, and shows a monthly cost.
- [ ] A second offer added to an item shows cost-per-unit and Δ% against the in-use offer,
      and does **not** change the item's totals or the grand total.
- [ ] Marking a different offer in-use changes the totals; the database refuses two in-use
      offers on one item.
- [ ] Group headers subtotal; the footer shows a grand total per period.
- [ ] A group whose items link to an envelope shows the envelope's budgeted amount beside
      the estimate.
- [ ] `Suggest from Amazon` lists repeat purchases with an inferred interval, and accepting
      one creates an item + in-use option prefilled with pack size and price.
- [ ] A second user cannot read, change or delete the first user's items or options.
- [ ] `npm run test`, `lint`, `typecheck`, `build`, and `npm run smoke` all pass.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Pure code polish
is omitted.

| #   | Change                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `offerComparison(inUse, candidate, rate)` takes the item's rate as a third argument.                                                   | The signature in Task 3 returns `yearlyDeltaCents`, which cannot be computed from two offers alone — a per-unit difference only becomes a yearly figure once you know how many units a year.                                                                                                                                                                                         |
| 2   | Added a **Group** and a **Funded from** column to the grid.                                                                            | D3 makes both editable facts of an item, and there is no detail drawer in this spec (see `standards.md`, "Deliberately not applied"). Without them the two fields the decision is _about_ would be unreachable in the UI.                                                                                                                                                            |
| 3   | **Units/mo** is off by default, reachable from Show Fields.                                                                            | Fourteen columns overflow a laptop, and an overflowing grid makes the trailing column's cells diverge from its header. It is also the one column that restates Rate in other units rather than carrying a fact of its own.                                                                                                                                                           |
| 4   | Group headers name an envelope only when **every** item in the group shares one.                                                       | Mixed funding is the case the page exists to surface; printing one of two envelopes would report it as settled.                                                                                                                                                                                                                                                                      |
| 5   | Every mutation that accepts an `envelopeId` proves the envelope belongs to the caller.                                                 | The FK alone would let one user point an item at another user's envelope and read its name and assigned amount back off the worksheet. Not in the plan; found while writing the isolation tests.                                                                                                                                                                                     |
| 6   | The Orders row action creates the item directly (`addSupplyFromAmazonItemAction`) rather than opening the suggestion dialog prefilled. | The dialog is a list of candidates; prefilling it with one row would be a list of one. The action runs the same ASIN-scoped aggregate, so the rate still comes from the whole purchase history, then lands on the worksheet where the estimate is visible and correctable. One order gives no span, so it falls back to a visible 30-days-per-unit placeholder rather than refusing. |
| 7   | `listAmazonRepeatPurchases` takes an optional `asin`.                                                                                  | So the row action above aggregates one product instead of every product to find one.                                                                                                                                                                                                                                                                                                 |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-26-0910-supplies-worksheet/` with `plan.md` (this, **Status:
active**, with an empty _Changes from original plan_ table), `shape.md`, `standards.md`,
`references.md`.

`references.md` should record the governing specs found during shaping:

- `2026-08-14-1439-amazon-order-ingest/` — **Extends.** The precedent for a standalone
  finance surface with its own tables that deliberately does not write
  `finance_transactions`. Supplies takes the same boundary and reads its tables.
- `2026-08-12-1048-finances-csv-import-register/` — **Extends.** Module ground rules: own
  tables with own `userId`, shared `DataGrid`, no second hierarchy.
- `2026-08-23-2313-one-budget/` (active) — **Extends, read-only.** Envelope rows live on
  `finance_budget_categories` behind a `kind` discriminator; Supplies references but never
  writes them.
- `2026-08-13-0747-module-pages/` — **Extends.** How a page is added to a module.
- Supersedes nothing.

Note in `shape.md` that this is **net-new roadmap intent** — grepping `agent-os/` for
`worksheet` / `calculator` / `unit cost` returns nothing. It lands nearest the roadmap's
_"purpose, not vendor"_ and _itemized receipts_ thread under § Financial planning.

Standards that apply (`agent-os/standards/`): `database/migrations`,
`development/clean-code`, `development/security`, `development/testing`,
`development/commits`, `components/data-grid`, `components/navigation`,
`components/ux-principles`, `components/modal-pattern`, `components/responsive`.

## Task 2: Schema and migration

In `src/db/schema.ts`, after the Amazon tables (~line 3340):

```ts
export const SUPPLY_RATE_BASES = ["units_per_day", "days_per_unit"] as const;
export type SupplyRateBasis = (typeof SUPPLY_RATE_BASES)[number];
```

**`financeSupplyItems`** → `finance_supply_items`: `id`, `userId`, `name` (non-empty
check), `groupLabel` text default `''`, `envelopeId` uuid null → `financeBudgetCategories`
`onDelete: "set null"`, `unitLabel` text default `''`, `rateBasis`
`text().$type<SupplyRateBasis>()` default `units_per_day`, `unitsPerDayMilli` integer null,
`daysPerUnitTenths` integer null, `notes`, `createdAt`, `updatedAt`.

Constraints — the `rate_set` check is the load-bearing one:

```ts
check("finance_supply_items_rate_set", sql`
  (${table.rateBasis} = 'units_per_day'
     and ${table.unitsPerDayMilli} is not null and ${table.unitsPerDayMilli} > 0
     and ${table.daysPerUnitTenths} is null)
  or
  (${table.rateBasis} = 'days_per_unit'
     and ${table.daysPerUnitTenths} is not null and ${table.daysPerUnitTenths} > 0
     and ${table.unitsPerDayMilli} is null)`),
```

plus a `rate_basis in (...)` check (text + check, not `pgEnum` — the schema's stated reason
is that `ALTER TYPE … ADD VALUE` fails on Neon's transaction-mode pooler), and indexes on
`(userId, groupLabel)` and `(userId, envelopeId)`.

**`financeSupplyOptions`** → `finance_supply_options`: `id`, `userId`, `itemId` →
`financeSupplyItems` cascade, `brand`, `vendor`, `qtyPerItem` integer default 1 (`> 0`
check), `costPerOrderCents` integer (`>= 0` check), `inUse` boolean default false,
`pricedOn` date `{ mode: "string" }` null, `asin` text default `''`, `notes`, timestamps.

The one-in-use rule is a **partial unique index**, following the existing precedent at
`src/db/schema.ts:459`:

```ts
uniqueIndex("finance_supply_options_item_in_use_uq")
  .on(table.userId, table.itemId)
  .where(sql`${table.inUse}`),
```

Also add the index the suggestion query needs, which does not exist today:

```ts
index("amazon_order_items_user_asin_idx").on(table.userId, table.asin),
```

Export `$inferSelect` / `$inferInsert` types at the bottom of the file. Then
`npm run db:generate`; commit the `.sql`, the snapshot and the `_journal.json` entry
together per `agent-os/standards/database/migrations.md`.

## Task 3: Pure cost math — `src/lib/finances/supplies/cost.ts` + `cost.test.ts`

No database, no React. Constants `DAYS_PER_YEAR = 365.25`, `DAYS_PER_MONTH = 365.25 / 12`,
`DAYS_PER_BIWEEK = 14`.

```ts
export type SupplyRate =
  | { basis: "units_per_day"; unitsPerDayMilli: number }
  | { basis: "days_per_unit"; daysPerUnitTenths: number };
export type SupplyOffer = { qtyPerItem: number; costPerOrderCents: number };

export function unitsPerDay(rate: SupplyRate): number; // rate alone — see D1
export function daysPerUnit(rate: SupplyRate): number;
export function costPerUnitCents(offer: SupplyOffer): number; // fractional, display only
export function costPerDayCents(rate: SupplyRate, offer: SupplyOffer): number;
export function supplyTotals(
  rate,
  offer,
): {
  costPerUnitCents;
  unitsPerMonth;
  daysPerUnit;
  biweeklyCents;
  monthlyCents;
  yearlyCents; // each rounded independently (D5)
};
/** Cost-per-unit delta of a candidate against the in-use offer. */
export function offerComparison(
  inUse: SupplyOffer,
  candidate: SupplyOffer,
): {
  deltaPerUnitCents: number;
  deltaPercent: number;
  yearlyDeltaCents: number;
};
```

Tests worth writing (each fails on a plausible mistake): both CSV rows reproduce
`$51.96` / `$55.21` biweekly; `days_per_unit` with `qtyPerItem = 1` and with `qtyPerItem = 3`
give the **same** cost-per-day (proves D1's orthogonality); `monthly × 12 !== yearly` is
asserted, not accidental; `costPerUnitCents` stays fractional (`0.9279…`, not `0.93`);
`offerComparison` signs are right for a cheaper and a dearer candidate.

## Task 4: Amazon pack-size parsing — `packSize.ts` + `packSize.test.ts`

`parsePackCount(productName: string): number | null` over Amazon's raw titles: `42 Count`,
`(Pack of 12)`, `12-Pack`, `24 ct`, `Case of 6`. Must **not** match volume/weight
(`12 oz`, `16.9 Fl Oz`, `3.4 Ounce`) — the test file is where that gets pinned down, using
real titles pulled from `amazon_order_items`.

## Task 5: Queries, suggestions, mutations

`src/lib/finances/supplies/queries.ts`

- `listSupplyItems(userId)` — items + their options + the linked envelope's name and
  current-month budgeted amount, in one pass. Do **not** reuse
  `src/lib/amazon/queries.ts#listAmazonItems` — it loads every row unpaginated.
- `listAmazonRepeatPurchases(userId, { minOrders = 3 })` — dedicated
  `group by asin` aggregate: `count(distinct amazon_order_id)`, `sum(quantity)`,
  `min/max(order_date)`, latest `unit_price` and `product_name`,
  `bool_or(subscribe_and_save)`. Filter to retail, non-empty `asin`, non-cancelled
  `order_status`. Include rows that are Subscribe & Save even below `minOrders` — it is a
  ready-made "this is recurring" flag.

`src/lib/finances/supplies/suggestions.ts` + `.test.ts` (pure — takes rows, returns
prefills): `unitsPerDay = totalQuantity × packCount ÷ spanDays`, where
`spanDays = lastOrderDate − firstOrderDate`. When `parsePackCount` returns null, fall back
to the `days_per_unit` basis with `spanDays ÷ totalQuantity`. Skip rows with `spanDays <= 0`.

`src/lib/finances/supplies/mutations.ts` — CRUD for both tables plus
`setSupplyOptionInUse`. Follow `src/lib/finances/tags/mutations.ts` exactly: `userId` first
parameter, a `requireSupplyItem` / `requireSupplyOption` ownership probe that throws a
human sentence before any write, `userId` repeated in the update `where`, partial
`…Edit` types with spread guards, `updatedAt: new Date()`. No zod — this feature area
validates by hand and throws sentences.

`setSupplyOptionInUse` must clear the sibling and set the new one **in one transaction**,
or the partial unique index will reject the intermediate state.

## Task 6: Server actions

Append to `src/app/finances/actions.ts`, one-liners over `run` / `runQuery` from
`src/app/actionResult.ts`: create/update/delete for items and options,
`setSupplyOptionInUseAction`, `listAmazonSupplySuggestionsAction` (`runQuery`),
`createSupplyItemFromSuggestionAction` (`runWithData`).

Inline-edit actions pass `{ revalidate: [] }` — a layout revalidate discards client grid
state, the same reason `updateTransactionAction` does it.

## Task 7: UI

`src/components/finances/supplies/SuppliesView.tsx` (`"use client"`) on the shared
`DataGrid` (`src/components/grid/DataGrid.tsx`), item rows with option child rows.

- Columns: Name/Brand · Vendor · Qty · Cost/Order · $/unit · Rate · Units/mo · Biweekly ·
  Monthly · Yearly · Δ vs in-use.
- Money cells copy the editable-cell pattern at
  `src/components/finances/budget/budgetColumns.tsx:50-80` — uncontrolled input,
  `key={…Cents}` to re-seed, select-all on focus, commit on blur, Enter blurs / Escape
  reverts.
- Group by `groupLabel`; group headers carry subtotals and, when the group's items share an
  envelope, `est. $X/mo · budgeted $Y/mo`. Footer carries the grand total.
- The in-use option is a radio-style toggle in the child row.
- `SuggestFromAmazonDialog` built on `src/components/detail/ModalShell` per
  `components/modal-pattern.md`, listing repeat purchases with order count, inferred
  interval and latest price, each with an Add button.
- Below `md`, list + full-screen sheet per `components/responsive.md`.

`src/app/finances/supplies/page.tsx` — `force-dynamic`, `getCurrentUserId()`,
`Promise.all` of the queries, `<AppShell active="finances">`, a leading doc comment saying
what question the page answers (every finance page has one).

Add a row action on the Orders grid (`src/components/amazon/amazonColumns.tsx`) that opens
the same dialog prefilled from that Amazon item — that is the natural discovery path.

## Task 8: Navigation

One `PageEntry` in `src/lib/navigation/pages.ts` (the `finances:` array at line 233),
placed after `budget`:

```ts
{ id: "supplies", label: "Supplies", segment: "supplies", status: "built",
  keywords: "worksheet calculator unit cost price per compare vendor brand pack size consumables estimate" },
```

Update the ordered-id assertion in `src/lib/navigation/pages.test.ts:61`. Check
`src/components/shell/globalCommands.ts` (`GO_KEYWORDS.finances`) — per
`components/navigation.md`, a command without a menu is not shipped. `modules.ts` needs no
change; it exposes pages rather than listing them. `scripts/smoke.mjs` discovers routes
from the filesystem, so nothing to update there.

## Task 9: Tests

- Pure: `cost.test.ts`, `packSize.test.ts`, `suggestions.test.ts` (Tasks 3–5).
- `src/lib/finances/supplies/mutations.integration.test.ts` — gated with
  `databaseReachable()` / `warnDatabaseSkipped()`, and carrying the isolation block
  modelled on `src/lib/finances/mutations.integration.test.ts:206-260`: a second user must
  fail to **read, change and delete** items _and_ options, must fail to flip `inUse` on
  another user's option, and must fail to attach an option to another user's item.
- Also assert the partial unique index actually rejects a second `in_use` option, and that
  the `rate_set` check rejects a `units_per_day` row carrying `daysPerUnitTenths`. Those
  are database guarantees; a test that only exercises the mutation proves nothing about
  them.
- `queries.integration.test.ts` — `listAmazonRepeatPurchases` scopes by user and excludes
  cancelled orders.

## Task 10: Verify, freeze spec, update roadmap

- `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- Confirm the DB tests actually ran — `test:unit` silently skips them when Postgres is
  down (`npm run db:up` first).
- `npm run dev` then `npm run smoke` — required after touching `src/app/**`.
- Drive the page in a browser (`/run-planner`): enter both CSV rows, add a comparison
  offer, switch which one is in use, add a `days_per_unit` item, run the Amazon dialog
  against real order data.
- Push to `origin/master` — mobile validation happens on the deployed iPhone.
- Freeze: `**Status: frozen / complete** (date)` on `plan.md` and `shape.md`, complete the
  _Changes from original plan_ table, move leftovers to _Follow-ups_.
- Add a bullet under § Financial planning in `agent-os/product/roadmap.md` — this is
  net-new roadmap intent, not a listed item being closed.

---

**Standing rule while this spec is active:** material changes to requirements, design or
scope — including feedback on what gets built — go into `plan.md` / `shape.md` plus a row
in _Changes from original plan_. Pure implementation detail does not.

## Deliberately out of scope

- Any write into the budget, split transactions, or matching supply items to
  `finance_transactions`. Named as future work in `references.md`.
- Price history. An option carries one current price and a `pricedOn` date.
- Non-consumable one-off purchases.
- Automatic re-sync of prices from later Amazon imports (D6).
