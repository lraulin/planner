# Standards applied — Finances CSV import + register

**Status: active**

- **Clean code** (`development/clean-code.md`): app → components → lib → db. Real logic in
  `src/lib/finances/**`; `src/app/finances/actions.ts` stays one line per action over
  `run` / `runQuery`. Every mutation takes `userId` first and scopes on it. Units in names —
  `amount` is money, `balanceAfter` is money; no bare numbers whose unit is guessable.
- **Migrations** (`database/migrations.md`): `db:generate`, read the SQL, `db:migrate`.
  Commit `.sql`, `meta/` snapshot and `_journal.json` **together**. New enum seeded with its
  full value set up front — `ALTER TYPE ... ADD VALUE` fails on Neon's pooler.
- **Testing** (`development/testing.md`): unit tests beside every pure module
  (`money`, `formats`, `fingerprint`); `*.integration.test.ts` for `import` and `mutations`,
  each including a second user who fails to read, change and delete the first user's rows.
  Finance queries also registered in `src/lib/db/crossUserReads.integration.test.ts`. No
  React component tests.
- **Data grid** (`components/data-grid.md`): one grid — the register is a column array plus a
  row slice over the shared `DataGrid`, not a new table. Account and date-window scope
  pickers go in the toolbar's `left` slot. Every user-visible preference persists through
  `useGridState` / `useSetting` in the module's own scope, never component `useState`.
- **Navigation** (`components/navigation.md`): one entry in `src/components/shell/modules.ts`
  (section `track`, `status: "built"`) plus an icon in `navIcons.tsx`. That is the only
  module list; five surfaces read it.
- **API** (`api/response-format.md`): the import is a multipart **route handler**, not a
  server action — multi-file uploads should not go through the React Flight serializer, the
  same rationale as the Achieve, Tomboy and RedNotebook imports. Returns
  `{ ok, created, skipped, warnings }` / `{ ok: false, error }`.
- **Dates** (`development/dates.md`): transaction and posted dates are calendar days stored
  as `date({ mode: "string" })`, not instants — no timezone encoding, no `startOfDay`.
- **UX** (`components/ux-principles.md`): import errors name the file and the row and say
  what to do (a renamed Chase export is told exactly what the filename must contain).
  Editable money and category cells commit on blur, never mid-keystroke.
- **Commits** (`development/commits.md`): one logical change each, imperative subject under
  72 chars, not Conventional Commits, body wherever the diff is not self-evident, and the
  `Spec: agent-os/specs/2026-08-12-1048-finances-csv-import-register` trailer. No AI
  attribution.
