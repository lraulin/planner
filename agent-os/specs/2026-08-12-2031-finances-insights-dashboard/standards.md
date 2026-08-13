# Standards applied — Finances insights dashboard

**Status: frozen / complete** (2026-08-13)

- **Clean code** (`development/clean-code.md`): app → components → lib → db. All
  classification and analytics logic lives in `src/lib/finances/**` as small pure modules;
  `src/app/finances/actions.ts` stays one line per action over `run` / `runQuery`. Every
  mutation takes `userId` first and scopes on it. No speculative generality — the rules
  engine is a list and a matcher, not a plugin system.
- **Testing** (`development/testing.md`): this spec is mostly pure logic, which is exactly
  where a wrong answer looks plausible, so every module under `classify/` and
  `analytics.ts` gets a `*.test.ts` beside it. `reclassify` and the dashboard queries get
  `*.integration.test.ts` including a second user who fails to read, change and delete the
  first user's rows. New queries are registered in
  `src/lib/db/crossUserReads.integration.test.ts`. **No React component tests.** After
  changing `mutations.ts` / `queries.ts`, check for the Postgres skip warning — a green
  `test:unit` does not mean the database tests ran.
- **Migrations** (`database/migrations.md`): `db:generate`, read the SQL, `db:migrate`.
  Commit `.sql`, the `meta/` snapshot and `_journal.json` **together**. `finance_flow_kind`
  is seeded with its full value set on creation — `ALTER TYPE … ADD VALUE` fails on Neon's
  transaction-mode pooler, the reason already recorded at `src/db/schema.ts:1923`.
- **Dates** (`development/dates.md`): `transactionDate` is a calendar day stored as
  `date({ mode: "string" })`. Pay-period boundaries, gap arithmetic and bucketing keep
  `YYYY-MM-DD` strings and go through `fromDateKey` / `toDateKey` when day math is
  unavoidable. Never `startOfDay` on a calendar field — that is the Aug 1 → Jul 31
  regression. The suite pins `TZ`.
- **Security** (`development/security.md`): every new query and mutation takes `userId` and
  proves ownership before writing, following `requireTransaction` /`requireAccount` in
  `src/lib/finances/mutations.ts`. `reclassify` is a bulk write and therefore the most
  dangerous new surface — it must scope every statement by `userId`, not just the outer
  select.
- **Data grid** (`components/data-grid.md`): the register keeps the one shared `DataGrid`.
  New flow/one-off fields become real columns so they can be filtered and grouped;
  a group dimension must also be a column. Dashboard preferences (window, monthly vs
  pay-period) persist through `useSetting` in the module's own scope, never component
  `useState`.
- **Responsive** (`components/responsive.md`): charts need hover **and tap** tooltips —
  a hover-only tooltip is invisible on the device this gets validated on. 44px tap targets
  for the window and axis toggles.
- **UX** (`components/ux-principles.md`): the one-off review is a confirmation flow, not a
  silent bulk mutation. The drawer keeps bank-owned fields read-only; the new fields are
  user-owned and commit on blur.
- **Navigation** (`components/navigation.md`): the dashboard route is one entry in
  `src/components/shell/modules.ts` plus an icon in `navIcons.tsx`. That is the only module
  list; five surfaces read it.
- **Commits** (`development/commits.md`): one logical change each, imperative subject under
  72 chars, not Conventional Commits, a body wherever the diff is not self-evident, and the
  `Spec: agent-os/specs/2026-08-12-2031-finances-insights-dashboard` trailer. No AI
  attribution.
- **Dataviz skill**: loaded before writing chart code, for palette and mark conventions.
  Its palette is swapped for the app's existing theme tokens (`var(--rule)`,
  `fill-ink-muted`, `text-priority-a` for negative money) rather than introducing a second
  color system.
