# Standards that apply

**Status: frozen / complete** (2026-08-13)

Analysis of how each standard governs this work, not a copy of it. The standards themselves
live under `agent-os/standards/` and remain the text of record.

---

## `development/dates.md`

The standard that shapes the storage decision, and the one place this spec makes a call it
must justify.

- **"Two kinds of value."** Everything in this feature is a **calendar day**. There is not a
  single instant in the domain — a job did not start at 9:04am, it started on a date. The only
  instants are `created_at` / `updated_at`, which are bookkeeping.
- **"Calendar-day columns: only the date half is meaningful."** The standard sanctions two
  encodings: timestamptz at UTC noon (nodes), or `date(…, { mode: "string" })` (finance). This
  spec takes the second. The reason is narrow and worth stating: with `mode: "string"` the
  stored value **is** the `YYYY-MM-DD` key, so there is no encode/decode round trip in which
  the Aug 1 → Jul 31 regression could occur. The bug class is designed out rather than guarded
  against. The nodes encoding exists because those columns sit beside true instants in the same
  row and the same forms; nothing here does.
- **"No date-fns / Day.js / Luxon."** Honoured. `daysBetweenKeys` from
  `src/lib/schedule/geometry.ts` is reused for the days-ago column; the Y/M/D breakdown is new
  integer arithmetic in `src/lib/timeline/elapsed.ts`.
- **"`startOfDay` / `addDays` in `dateMath.ts` are local wall-clock helpers."** This is why
  `addMonths` / `addYears` are _not_ used for the elapsed calculation, despite looking like
  exactly the right tool. Elapsed operates on key components, never on a `Date`.
- **"No business rule may depend on the server's `TZ`."** The elapsed columns take `todayKey`
  from `useToday()`, which is `null` on the server. Blank before hydration is the correct
  render, not a placeholder.
- **"Standalone exact values … format the canonical key through `useDateFormatter()`."** The
  Date column renders through `DateText`; sorting and filtering stay on the canonical key.
- **Testing requirement.** The standard names month-boundary cases as mandatory for
  date-branching logic. `elapsed.test.ts` covers a leap day and a month-end borrow for exactly
  that reason.

---

## `development/security.md`

- **"Per-user scoping is the core invariant."** Three new tables, three new mutation modules,
  every function taking `userId` first and proving ownership before writing. The `where` on
  every update and delete re-asserts `and(eq(t.id, id), eq(t.userId, userId))` rather than
  trusting an id that arrived from the client.
- **"Errors: messages we wrote are user-facing; messages the database wrote are not."** A
  cross-user delete throws the same "not found" a genuinely missing row throws — the deletion
  returning zero rows is the only signal, and it must not distinguish the two cases.
- Cascade on `user_id` so deleting an account takes the history with it.

---

## `development/testing.md`

- **"Pure logic in `src/lib/**` — always."** `elapsed.ts` and the pure
  `deriveChronology(events, jobs, residences)` both get adjacent tests. Deriving chronology
  rows is precisely the standard's "trickiest reasoning… where a wrong answer looks plausible":
  a null end date must yield one row and not two, and a job with neither date must yield none.
- **"Database mutations and queries — always, as `*.integration.test.ts`… not done until a
  second user tries to read, change, and delete the first user's row and fails at every
  step."** Three suites, three cross-user cases. Non-negotiable, and the reason `loadChronology`
  is split from `deriveChronology`: the derivation is testable without Postgres, so the
  integration test can stay focused on scoping.
- **"React components — no."** No tests for `TimelineView`, `JobsView`, `ResidencesView`, the
  drawers or the column modules. Verified in a browser instead.
- **"A green `npm run test:unit` does not mean the database logic passed."** Check for the skip
  warning after running; three new integration suites is exactly the change that would hide
  behind a stopped container.

---

## `development/clean-code.md`

- **"The layers, and which way dependencies point"** — `app → components → lib → db`. Routes
  hold `page.tsx` and a thin `actions.ts` over `run` / `runQuery`; components never touch the
  database; `src/lib/{jobs,residences,timeline}/` never imports from `src/app/`.
  `src/lib/timeline/chronology.ts` importing from `src/lib/jobs/queries.ts` is lib→lib and
  within the rule.
- **"One shared implementation per concern."** The reason this spec adds no new grid, no new
  drawer shell, and no new deep-link mechanism — see the navigation note below.
- **"No speculative generality."** Life events get four fields and no end date, because the
  chronology decision removed the need for one. Jobs and Residences get large field sets
  because a job application asks for all of them, not because they might be useful.

---

## `database/migrations.md`

- **"Never hand-write a migration without its snapshot."** `npm run db:generate`, read the
  generated SQL, then `npm run db:migrate`. Commit the `.sql`, `meta/NNNN_snapshot.json` and
  `_journal.json` in one commit.
- Enum growth is the trap this schema has to avoid: `ALTER TYPE … ADD VALUE` fails on Neon's
  transaction-mode pooler, which is why employment type, housing type and pay period are
  `text` with a suggestion list rather than `pgEnum`. Each is an open vocabulary that will grow.

---

## `components/data-grid.md`

- **"The one shared DataGrid."** All three pages use it with `ColumnDef` arrays and no new grid
  code. Timeline is flat (`depth: 0`), so the hierarchy machinery is simply unused.
- **"The column funnel is a set filter."** This is what Lee's "categories so I can filter them"
  resolves to, and why free-text categories are sufficient: the funnel lists **the values the
  column actually holds**, each with a row count. Derived rows contribute `Work` and `Home` to
  that list on the same footing as typed values, with no vocabulary to maintain.
- **"Filtering, searching and grouping act on _defined_ columns, not visible ones."** The Notes
  column stays searchable when hidden — which matters here, since notes are where the detail
  that makes a date findable ends up.
- **"Every user-visible grid preference goes into the `grid:{tabId}` scope through the single
  `patch` in `useGridState` — never into component `useState`."** Column set, widths, sorts,
  filters and density for all three grids. The standard names the exact failure mode of
  ignoring it: a grid that resets itself on every visit.
- **"A view's defaults are `GridDefaults`."** Timeline's date-ascending default sort is a
  declared default, not a hardcoded sort the user cannot change.
- **"`rowMenu` takes a nullable row."** How Timeline varies its verbs per row — a derived row's
  Delete is disabled with a reason rather than absent.
- **"Testing."** The grid itself is not re-tested; the pure helpers behind the columns are.

---

## `components/navigation.md`

- **"Pages live in one registry too."** Three entries in `PAGES.library`. Library goes from two
  pages to five; the bar already exists, so nothing about the mechanism changes.
- **"A page is a URL."** Real routes, real `<Link>`s, Back works, reload holds.
- **"A focused flow is not a page."** No `[id]` sub-routes here — every record opens in a drawer
  on its own page, so the subtree rule has nothing to catch.
- **"A command declares its own placement"** and **"a command without a menu is not shipped"**.
  `catalogCapabilities` satisfies both in one call for all three pages, wiring toolbar, menu
  bar, ⌘K and right-click together.
- **"Unavailable is disabled with the specific reason, never absent."** Directly governs the
  derived-row case on Timeline: Delete stays visible and disabled, titled "Edit this on the
  Jobs page". Hiding it would leave the user unable to tell whether the command exists.
- **"The palette must be complete."** Free — `useGlobalCommands` generates `Module: Page`
  entries from the registry, so the `keywords` on each page entry are the only authored part.

---

## `components/drawer-pattern.md` and `components/ux-principles.md`

- **"Use drawers for complex forms"** / **"Inline editing for grid-visible fields."** This pair
  decides the split. Jobs and Residences have twenty-plus fields each and get drawers with
  `DrawerFooter` Cancel | Save | Save & Close and unsaved-changes on leave. Life events have
  four fields and get inline editing only — a drawer for a title, a date, a category and a note
  is ceremony, and the standard's own decision guide points the other way at that size.
- **"Tabs organise sections within a form."** Jobs: Position | Employer | Supervisor | Notes.
  Residences: Address | Tenancy | Notes.
- **"Minimise required fields"** and **"allow partial saves."** Nothing is required beyond a
  date on a life event. A half-remembered job with only an employer name and a start date must
  save, because that is the state a memory arrives in.
- **"Date/decimal commit on blur."** Applies to the inline date and the pay/rent fields.

---

## Standards this work does **not** change

None. Every rule above is applied as written; this spec adds three pages inside mechanisms that
already exist and amends no standard.
