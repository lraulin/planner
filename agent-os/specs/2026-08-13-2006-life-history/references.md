# References for Life history — Timeline, Jobs, Residences

## Governing specs

### `agent-os/specs/2026-08-13-0845-module-consolidation/`

- **Relationship:** Extends.
- **Relevant decisions:** Library is Contacts + Resources, "reference data you maintain rather
  than places you work". The sidebar is eight flat modules with no section headings. Both
  carry forward: this spec adds three Library pages and no ninth module.
- **Also relevant:** its Decision 4 notes there is no Categories page to build because
  `category` is free text, not a managed table. This spec follows that precedent for life
  event categories rather than establishing a lookup table.

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends.
- **Relevant decisions:** the Page tier between Module and View; one shell-owned page bar; the
  ≥2-page floor; `lastPage` stickiness; "a focused flow is not a page". Library goes from two
  pages to five with no change to the mechanism.

### `agent-os/specs/2026-08-12-1910-schedule-day-counts-agenda/`

- **Relationship:** Neither extends nor supersedes — cited to record a deliberate
  non-reuse.
- **Relevant decisions:** the Agenda grid's `daysLeft` column and its `daysLeftOf` /
  `daysLeftTitle` helpers. Timeline needs "how long ago" as a number and a duration, not "how
  soon" as prose. Same underlying `daysBetweenKeys`; different columns. Sharing them would
  produce one helper with a mode flag.

## Similar implementations

### Resources — the flat-catalog template

- **Location:** `src/lib/resources/{types,queries,mutations}.ts`,
  `src/app/library/resources/{page.tsx,actions.ts}`,
  `src/components/resources/{ResourcesView,resourcesColumns,ResourceDrawer}.tsx`
- **Relevance:** the closest existing analogue — a flat, user-owned, non-tree record type with
  full CRUD, living under Library.
- **Key patterns:** `useState(initialRows)` seeded from the server with a `seenServerRows`
  reconciliation; `useModuleViews`; rows mapped to `GridRow<T>` at `depth: 0`;
  `collectDistinctValues(columns, rows)`; `useNavigableIds` + `useMultiSelect`; `refresh()`
  through a `listXAction()` in a transition; create → action → open drawer; delete →
  `ConfirmDialog` → action. Not optimistic — actions then refresh.

### Contacts — the international address shape

- **Location:** `src/db/schema.ts:1818-1827` (`contact_items` address columns),
  `src/components/contacts/ContactDrawer.tsx`, `src/lib/contacts/itemKinds.ts`
- **Relevance:** the address column names to reuse verbatim on `jobs` and `residences`. They
  are already non-US-shaped because they came from Google People.
- **Key patterns:** `itemKinds.ts` as the model for a free-text field with a suggestion list
  (employment type, housing type, pay period) instead of a `pgEnum`. `BirthdayField` in
  `ContactDrawer.tsx` shows the partial-date approach this spec deliberately does **not** take.

### Finances — calendar days as `date({ mode: "string" })`

- **Location:** `src/db/schema.ts` (`finance_transactions`), `src/lib/finances/`
- **Relevance:** the precedent for storing a pure calendar-day column as a `YYYY-MM-DD` string
  rather than timestamptz-at-UTC-noon.
- **Key patterns:** also the model for `FINANCE_CATEGORIES` as a closed TypeScript constant —
  considered for life event categories and rejected in favour of free text.

### `catalogCapabilities` — the three verbs

- **Location:** `src/components/grid/catalogCommands.ts`
- **Relevance:** Jobs and Residences are exactly the "flat catalog with make / open / delete"
  case it was extracted for. Timeline uses it too, with `deleteDisabled` carrying the reason a
  derived row cannot be deleted.
- **Key patterns:** one call wires the toolbar, menu bar, ⌘K palette and right-click row menu
  together — which is what `components/navigation.md` requires of any shipped command.

### Date helpers

- **Location:** `src/lib/schedule/geometry.ts` (`daysBetweenKeys`, `toDateKey`, `shiftDateKey`),
  `src/lib/dateMath.ts` (local wall-clock only), `src/components/date/DateText.tsx`,
  `src/components/grid/useToday.ts`
- **Relevance:** `daysBetweenKeys` is the days-ago column. `DateText` is how a day key renders
  in a cell, picking up the user's format preference. `useToday()` returning `null` on the
  server is why the computed columns are blank before hydration rather than wrong.
- **Do not use:** `addMonths` / `addYears` from `dateMath.ts` for the elapsed calculation —
  they are local wall-clock helpers. The Y/M/D breakdown is integer component arithmetic.

## Navigation registries

- `src/lib/navigation/pages.ts` — `PAGES.library` gains three entries. React-free on purpose so
  `pages.test.ts` can cover it.
- `src/components/shell/modules.ts` — unchanged; asserts at compile time that every `PAGES` key
  is a real module.
- `scripts/smoke.mjs` — walks `src/app` at runtime for `page.tsx`, so new routes are covered
  without editing a list.
