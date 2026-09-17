# Houses — a house-shopping comparison grid in Library

**Status: active**
Spec folder: `agent-os/specs/2026-09-17-0853-houses-library-page/`

## Context

Lee is house shopping and needs one place to compare listings side by side — asking price,
size, beds/baths, the three has-it-or-not features that matter (fence, basement, garage), and
how far each one is from his parents' house at 5006 Valley Drive, Chesapeake Beach, MD 20732.
Grok should be able to fill it in from listings, which means MCP tools, not just a UI.

This is **deliberately disposable**. It is one table, one page, one set of agent tools, with no
edges into any other module — so when the house hunt ends it deletes in one commit. Nothing
here gets a second consumer, and nothing else in the app learns it exists.

**Correcting one premise in the request:** Library is not new — it is an existing module
(`/library`) with five pages (Contacts, Resources, Timeline, Jobs, Residences). This adds a
sixth page, **Houses**. That is strictly less work than a new module: no sidebar entry, no
icon, no module redirect.

Not reusing `residences` (`src/lib/residences/`), despite the name: that table records places
Lee _has lived_, with move-in/out dates and a landlord. Houses for sale is a shopping
comparison with price, status and a drive time. Different entity, different lifetime.

## Decisions

| Decision                  | Choice                                                                                                                                      | Why                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where it lives            | New `PageEntry` in the `library` array + `src/app/library/houses/`                                                                          | Library module already exists                                                                                                                                        |
| Pattern                   | Read-only grid columns, all editing in the drawer                                                                                           | Jobs/Resources precedent; ~25 fields belong in a drawer                                                                                                              |
| Drive time                | Nominatim geocode → OSRM route, server-side, cached on the row                                                                              | Free, no API key, no signup. `connect-src 'self'` forbids a browser call anyway                                                                                      |
| Status                    | `text` + CHECK + `const` tuple                                                                                                              | Repo's stated preference for a set that may gain a value; `ALTER TYPE … ADD VALUE` fails on Neon's pooler                                                            |
| Priority                  | Standard `priorityLetter` + `priorityRank` pair                                                                                             | `metrics` is the exact precedent for a flat catalog with priority                                                                                                    |
| Has-fence/basement/garage | **Nullable** boolean — yes / no / unknown                                                                                                   | "Not listed" is a real and common state when comparing listings; `false` would lie                                                                                   |
| MCP domain                | New `"houses"` domain                                                                                                                       | `"history"` (where residences live) is semantically wrong. Not `"library"` — that would imply it covers Contacts/Resources/Residences too, which stay where they are |
| Out of scope              | Find/search integration, saved views beyond "All Houses", photos, map view, a settings UI for the destination address, mobile-specific work | Disposable; desktop is the priority                                                                                                                                  |

## Acceptance criteria

- [ ] `/library/houses` page renders a grid + drawer following the standard pattern
- [ ] A house can be created, edited, and deleted; a second user cannot read/change/delete it
- [ ] Drive time and distance to 5006 Valley Drive, Chesapeake Beach, MD 20732 are computed
      automatically on save when the address changes, cached on the row, and retryable from the
      row menu on failure
- [ ] Priority (standard ABCD/rank) and status (Available/Not Interested/No Longer
      Available/Offer Made, default Available) are set from the grid/drawer
- [ ] Grok can list, read, create, update, and delete houses over MCP (`houses` domain)
- [ ] `npm run lint && npm run typecheck && npm test` pass, including the cross-user integration
      tests; `npm run smoke` and `npm run smoke:agent` pass after starting the dev server

## Changes from original plan

| #   | Change                                                                                        | Why                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Address columns are `state` (not `region`), with no `extendedAddress`/`country`/`countryCode` | The plan's own column list already named `state`, contradicting its "verbatim" claim against `contact_items` (which uses `region`); the explicit list is more specific and Houses is domestic-only, so it wins |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-09-17-0853-houses-library-page/` with `plan.md` (this file),
`shape.md`, `standards.md`, `references.md`. No `visuals/` — none provided.

## Task 2: Schema + migration

Add `houses` to `src/db/schema.ts`, modelled on `metrics` (schema.ts:1667) and `jobs`
(schema.ts:3953).

```ts
export const HOUSE_STATUSES = [
  "available",
  "not_interested",
  "no_longer_available",
  "offer_made",
] as const;
export type HouseStatus = (typeof HOUSE_STATUSES)[number];
```

Columns — `id` uuid pk, `userId` uuid FK cascade, then:

- **Identity/link:** `nickname` text default `""`, `listingUrl` text default `""`,
  `streetAddress`, `city`, `state`, `postalCode` — text default `""`. A US-only shorthand of
  the `contact_items`/`residences`/`jobs` address shape, not verbatim: `state` (not `region`),
  and no `extendedAddress`/`country`/`countryCode` — this table is disposable and every house
  is domestic
- **Money:** `askingPriceCents` integer, `hoaFeeCents` integer (monthly),
  `propertyTaxCents` integer (annual) — all nullable
- **Size:** `squareFeet` integer, `beds` smallint, `baths` `numeric(3,1)` (2.5 baths is real),
  `yearBuilt` smallint, `lotAcres` `numeric(6,3)` — all nullable
- **Features:** `hasFence`, `hasBasement`, `hasGarage` — `boolean()`, **nullable**
- **Triage:** `status` text notNull default `"available"`,
  `priorityLetter` + `priorityRank` (smallint), `notes` text default `""`
- **Route cache:** `latitude`/`longitude` `numeric(9,6)`, `driveMeters` integer,
  `driveSeconds` integer, `routedAddress` text, `routeError` text — all nullable
- **Agent retry:** `externalSource`, `externalId` text
- `sortKey` text notNull (fractional index, like `metrics`), `createdAt`, `updatedAt`

Constraints:

```ts
check("houses_priority_letter_ranked",
  sql`(${table.priorityLetter} is null) = (${table.priorityRank} is null)`),
check("houses_status",
  sql`${table.status} in ('available','not_interested','no_longer_available','offer_made')`),
index("houses_user_sort_idx").on(table.userId, table.sortKey),
uniqueIndex("houses_external_ref_uq")
  .on(table.userId, table.externalSource, table.externalId)
  .where(sql`${table.externalId} is not null`),
```

`npm run db:generate` → **read the generated SQL** → `npm run db:migrate`. Commit the `.sql`,
`drizzle/meta/NNNN_snapshot.json` and the `_journal.json` entry **together**.

**`routedAddress` is the whole cache-invalidation mechanism.** It stores the normalized
address string the cached route was computed for; a route is stale exactly when
`routedAddress !== addressKey(row)`. No second table, no timestamp heuristics.

## Task 3: Drive-time geocoding and routing

The only non-boilerplate part. Follow `src/lib/url/pageTitle.ts` — the repo's precedent for
deriving a value from an external service: short timeout, size cap, **failure returns null and
the row saves anyway**. Keep the impure client thin; every decidable thing goes in a pure
tested module beside it (the `banksync/client.ts` + `mapping.ts` convention).

**`src/lib/houses/destination.ts`** — the target, as a constant with both the address _and_
its coordinates hardcoded:

```ts
/** Lee's parents' house. Coordinates resolved once via Nominatim rather than at runtime —
 *  it halves the failure surface of every route, and it moves roughly never. */
export const DRIVE_DESTINATION = {
  label: "Parents' house",
  address: "5006 Valley Drive, Chesapeake Beach, MD 20732",
  lat: 38.6..., lon: -76.5...,  // ← implementer: look this up once and paste it
} as const;
```

**`src/lib/houses/route.ts`** — pure, with `route.test.ts` beside it:

- `addressKey(house)` — normalized `"street, city, state zip"`; the value stored in
  `routedAddress`. Must be stable under whitespace and case changes, or every save re-routes.
- `parseNominatim(json: unknown)` → `{ lat, lon } | null`
- `parseOsrm(json: unknown)` → `{ meters, seconds } | null`
- `formatDriveTime(seconds)` → `"42 min"`, `"1 hr 5 min"`
- `formatMiles(meters)` → `"23.4 mi"`
- `needsRoute(row)` → `addressKey(row) !== row.routedAddress && addressKey(row) !== ""`

These are the functions that fail on a plausible mistake (a missing `routes[0]`, a
string-vs-number `lat`, a 59.6s rounding to `"60 min"`), so they carry the tests.

**`src/lib/houses/geo.ts`** — thin impure client, no tests (the `banksync/client.ts`
precedent):

- `geocode(address)` — `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=…`,
  `User-Agent: planner/1.0 (personal use; leeraulin@gmail.com)`, 4s `AbortSignal.timeout`.
  Nominatim's usage policy requires a real User-Agent and caps at 1 req/sec — a handful of
  houses is squarely within it, but do not batch-loop without a delay.
- `driveRoute(from, to)` — `https://router.project-osrm.org/route/v1/driving/{lon},{lat};{lon},{lat}?overview=false`,
  4s timeout.

Both return `null` on any non-200, timeout, or unparseable body.

**`refreshHouseRoute(userId, houseId)`** in `mutations.ts`: geocode → route → write
`latitude`/`longitude`/`driveMeters`/`driveSeconds`/`routedAddress`, or write `routeError`
with a short human sentence and leave the previous numbers alone. Called from `createHouse`
and `updateHouse` **only when `needsRoute()`**, and from an explicit action for retries.

Worst case a Save waits ~8s on two hanging calls; typical is well under a second, and it only
happens when the address actually changed. `routeError` plus the manual retry command is what
makes the OSRM demo server's no-SLA acceptable.

## Task 4: Queries, mutations, and the integration test

`src/lib/houses/{types.ts,queries.ts,mutations.ts}` — copy the shape of
`src/lib/resources/` and `src/lib/jobs/`.

- `types.ts` — `HouseDetail`, `HouseListRow` (adds derived `pricePerSqft`, `driveMinutes`,
  `driveMiles`), `HouseInput` (partial patch; `undefined` means "leave alone")
- `queries.ts` — `listHouses(userId)`, `getHouseDetail(userId, houseId)`.
  **`pricePerSqft` is computed at read time, not stored** — derived values are computed unless
  there is a named single writer.
- `mutations.ts` — `createHouse`, `createHouseOnce` (keyed on `externalSource`/`externalId`),
  `updateHouse`, `deleteHouse`, `refreshHouseRoute`. `userId` first on every one; every `where`
  is `and(eq(t.id, id), eq(t.userId, userId))`.

**`src/lib/houses/mutations.integration.test.ts` is not done until a second user has tried to
read, change, and delete the first user's house and failed at all three.** Also register
`houses` in `src/lib/db/crossUserReads.integration.test.ts`.

## Task 5: Server actions and the page

- `src/app/library/houses/actions.ts` — `"use server"`, thin wrappers over `run`/`runQuery`
  from `src/app/actionResult.ts`: `createHouseAction`, `updateHouseAction`, `deleteHouseAction`,
  `listHousesAction`, `getHouseDetailAction`, `refreshHouseRouteAction`.
- `src/app/library/houses/page.tsx` — `export const dynamic = "force-dynamic"`,
  `getCurrentUserId()`, `listHouses(userId)`, `<AppShell active="library">` wrapping
  `<Suspense>` + `<HousesView>`. The `Suspense` is mandatory — `HousesView` uses
  `useViewStateUrl()` → `useSearchParams()`.
- Register the page in `src/lib/navigation/pages.ts`, in the `library` array (after
  `residences`), **without `isDefault`** — Contacts keeps that:

```ts
{ id: "houses", label: "Houses", segment: "houses", status: "built",
  keywords: "house hunting home buying real estate listing for sale price beds baths" },
```

That one entry gets the page bar tab, the `go.library.houses` palette command and the
module redirect for free.

## Task 6: Columns, drawer, view

**`src/components/houses/housesColumns.tsx`** — `HOUSES_COLUMN_IDS` tuple + `ColumnDef[]`,
copying `resourcesColumns.tsx` / `metricsColumns.tsx`. Every column read-only; editing is the
drawer. Every `width` a definite CSS length — **never `fr` or `minmax`**; `buildGridTemplate`
appends the single trailing filler track and a second elastic one reintroduces the inverted-
resize bug.

Order (most default-visible first; the long tail marked `compact: "hidden"` so the phone row
stays legible):

| id                                                                  | Notes                                                                                                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `priority`                                                          | `priorityColumn()` from `components/grid/commonColumns.tsx` — `LetterRankCell`, `filterKind: "priority"`, `sortValue: priorityOrderValue(...)` |
| `status`                                                            | `filterKind: "enum"`, label map from `HOUSE_STATUS_LABELS`                                                                                     |
| `address`                                                           | `compact: "primary"`, links to `listingUrl` when set                                                                                           |
| `price`                                                             | `align: "right"`, `tabular`, `formatUsd` from `src/lib/finances/money.ts`                                                                      |
| `sqft`, `beds`, `baths`                                             | right-aligned, tabular                                                                                                                         |
| `pricePerSqft`                                                      | derived; right-aligned                                                                                                                         |
| `drive`                                                             | `formatDriveTime(driveSeconds)`, or a muted "—"; shows `routeError` in the `title`                                                             |
| `miles`                                                             | `formatMiles(driveMeters)`                                                                                                                     |
| `fence`, `basement`, `garage`                                       | ✓ / ✗ / blank for true / false / null. `filterKind: "enum"` with `filterLabel` → "Yes"/"No"/"Unknown"                                          |
| `yearBuilt`, `lotAcres`, `hoa`, `taxes`, `city`, `notes`, `updated` | `compact: "hidden"`                                                                                                                            |

**`src/components/houses/HouseDrawer.tsx`** — `Drawer` / `DrawerHeader` / `FormTabs` /
`DrawerLeaveGuard` / `DrawerFooter` from `src/components/detail/`, fields from
`detail/fields.tsx` (`MoneyField`, `NumberField`, `SelectField`, `CheckboxField`,
`PriorityField`, `TextArea`). Never hand-roll the footer buttons. Two tabs: **Details**
(address, link, price, size, features, status, priority) and **Notes**.

The three nullable booleans need a three-state control, not `CheckboxField` — use
`SelectField` with Yes / No / Unknown. If that reads badly in practice, say so in this spec's
**Changes from original plan** rather than quietly making them two-state.

**`src/components/houses/HousesView.tsx`** — copy `ResourcesView.tsx` and swap nouns:
`useModuleViews({ moduleId: "houses", builtIn: [{ id: "all", label: "All Houses" }], … })`,
`useNavigableIds`, `useMultiSelect`, `collectDistinctValues`, `catalogCapabilities`
(New house / Open house / Delete), `rowMenuFor`, `GridToolbar`, `DataGrid`, `ConfirmDialog`.
Pass `allColumns={housesColumns}` so filters reach hidden columns.

Add **"Recalculate drive time"** to the row menu, calling `refreshHouseRouteAction` then
`refresh()`. This is the retry path for a failed geocode.

All view state — sorts, search, group-by, density, widths, advanced filter — goes through
`gridState` from `useModuleViews`. **No plain `useState` for view state.**

## Task 7: MCP tools (new `houses` domain)

Follow `agent-os/specs/2026-08-18-1444-history-agent-tools/plan.md`, which is effectively the
template. Five tools: `list_houses`, `get_house`, `create_house`, `update_house`,
`delete_house`.

1. **`src/lib/agent/contracts.ts`** — add `houseSummarySchema` / `houseDetailSchema` and the
   five input/output pairs. Inputs are `z.strictObject`; `create_house` uses
   `retryableObject(houseInputFields)` so a retried Grok call keyed on
   `externalSource` + `externalId` (e.g. `"zillow"` + the zpid) replays instead of duplicating.
   Add `"houses"` to the `list_tools` domain enum.
2. **`src/lib/agent/tools.ts`** — add `"houses"` to `AgentToolDomain` and to the domain cast in
   `listTools()`; add five `defineTool(...)` entries with `domain: "houses"`,
   `exposure: "domain"`, real `summary`/`useWhen`/`avoidWhen`/`returns`, and effects
   `read` / `keyedWrite` / `write` / `destructiveWrite`; add `create_house` to the
   `externalSource`/`externalId` pairing check; add every new field name to
   `fieldDescriptions` (`tools.test.ts` fails on an empty description).
3. **`src/lib/agent/houseTools.ts`** — `(userId, args)` handlers calling only
   `src/lib/houses/{queries,mutations}`. Never the DB directly, never a server action.
   Not-found is `throw new AgentError("not_found", …)`.
4. **`src/lib/agent/mcp.ts`** — extend the `instructions` string in `initializeResult()` so
   Grok is told the domain exists and what it is for.
5. **`npm run agent:docs`** to regenerate `docs/agent-api.md`. Never hand-edit it;
   `agent:docs:check` is the CI drift guard.
6. Additive only — **do not bump `AGENT_CONTRACT_VERSION`** (finance and history set that
   precedent).

Tests: `src/lib/agent/houseTools.integration.test.ts` (round-trip, keyed replay, second-user
isolation — the `historyTools.integration.test.ts` template), plus the five names added to the
`REQUIRED` list in `mcp.test.ts` and the per-domain list in `tools.test.ts`.

## Task 8: Verify, freeze, roadmap

Verification, in order:

1. `npm run lint && npm run typecheck`
2. `npm test` — and **check for the Postgres skip warning**; `test:unit` passing does not mean
   the integration tests ran. `npm run db:up` first if Docker is cold.
3. `npm run db:up && npm run dev`, then **`npm run smoke`** — nothing in the gate above
   executes a `"use server"` module or renders a route, and this section adds six of them.
4. `npm run smoke:agent`, plus one real `tools/call` through `scripts/call-tool.sh` for
   `create_house` and `list_houses`.
5. **In the browser:** create a house, paste a real address, save, confirm a drive time
   appears; edit the address, confirm it re-routes; type nonsense into the address, confirm the
   row still saves and the drive cell shows the error in its tooltip and "Recalculate drive
   time" retries it. Sort by price and by priority; hide and show columns.
6. Push to `master` and check it on the phone — deployed is where this gets validated.

Then freeze: `**Status: frozen / complete** (date)` on `plan.md` and `shape.md`, fill in
**Changes from original plan**, and add a Library line to `agent-os/product/roadmap.md`.
