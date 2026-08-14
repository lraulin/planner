# Standards applied — Declared recurring bills

**Status: frozen / complete** (2026-08-14)

- **Clean code** (`development/clean-code.md`): app → components → lib → db. All cadence
  arithmetic lives in `src/lib/finances/recurringBills.ts` as a pure module with no db
  import; `src/app/finances/actions.ts` stays one line per action over `run` / `runQuery`;
  every mutation takes `userId` first. The declared-bill type is threaded through
  `analytics.ts` as an optional parameter defaulting to empty rather than as a second set of
  parallel functions — one shared implementation per concern.
- **Testing** (`development/testing.md`): the cadence math is exactly the kind of pure logic
  where a wrong answer looks plausible, so `recurringBills.test.ts` sits beside it and pins
  the cases that would silently pass a naive implementation — a Feb 29 anchor, a month-end
  anchor, a 200-day near miss that must **not** be proposed. `mutations.integration.test.ts`
  is not done until a second user has tried to read, change and delete the first user's
  declared bill and failed at every step. **No React component tests.** After touching
  `mutations.ts` / `dashboardQueries.ts`, check for the Postgres skip warning — a green
  `test:unit` does not mean the database tests ran.
- **Migrations** (`database/migrations.md`): `db:generate`, read the SQL, `db:migrate`.
  Commit the `.sql`, the `meta/` snapshot and `_journal.json` **together**. No new enum is
  introduced — `cadence_months` is a smallint with a CHECK, which sidesteps the
  `ALTER TYPE … ADD VALUE` limitation on Neon's pooler recorded at `src/db/schema.ts:1923`
  and leaves room for a cadence nobody predicted.
- **Dates** (`development/dates.md`): the most load-bearing standard here. `transaction_date`
  is a calendar day stored as `date({ mode: "string" })`, and every cadence operation is
  month arithmetic on one. Keep `YYYY-MM-DD` strings, go through `fromDateKey` / `toDateKey`
  when day math is unavoidable, and **never `startOfDay`** on a calendar field — that is the
  Aug 1 → Jul 31 regression, and adding six months to a date is precisely where it would
  reappear. The suite pins `TZ`.
- **Security** (`development/security.md`): `finance_recurring_bills` is a new user-owned
  table, so both mutations scope by `userId` in the `where` clause rather than trusting an id
  from the client, following `setOneOff` (`src/lib/finances/mutations.ts:285`). The new read
  is registered in `src/lib/db/crossUserReads.integration.test.ts`.
- **UX principles** (`components/ux-principles.md`): the declaration is inline on the row it
  concerns — no modal for what is a two-field choice. The recurring panel must be able to
  change and remove a declaration; a wrong cadence with no way to fix it is worse than none.
- **Responsive** (`components/responsive.md`): the cadence select and its confirm are 44px
  tap targets and 16px text on the phone, or iOS zooms the page on focus — the rule
  `OneOffReview.tsx:92` already annotates for its event-name input.
