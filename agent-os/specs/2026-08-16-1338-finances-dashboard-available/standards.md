# Standards for Finances Dashboard — available to spend

**Status: frozen / complete** (2026-08-16)

The following standards apply to this work. Full content, copied so this folder stays a
self-contained record of what governed the work at the time.

---

## development/dates

# Date and time handling

This app is calendar-day heavy (plans, deadlines, shelves, day pages) with a smaller set
of true instants (created/updated, completion history, appointments). Getting the two kinds
mixed is how completed dates show as the wrong day after a save.

Domain meanings of the four node dates live in `product/date-model.md`. This file is the
**mechanics**: storage, keys, UI, and tests.

Stack: Next.js + TypeScript + Drizzle + Postgres. No date-fns / Day.js / Luxon — keep
helpers in `src/lib/schedule/geometry.ts` and `src/lib/dateMath.ts`.

## Two kinds of value

| Kind             | Means                      | Examples                                                                                                            | Store / compare as                                             |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Calendar day** | A date with no time of day | deadline, deferred, target start/end, actual start, date completed, day page `day`, note date, all-day Google dates | **UTC noon** of that day in `timestamptz`; key via `toDateKey` |
| **Instant**      | A real moment in time      | `created_at`, `updated_at`, `nodes.completed_at`, `task_completions.completed_at`, timed appointments               | `timestamptz`; compare as instants                             |

Never use one kind’s helpers for the other.

## Why UTC noon (not local midnight)

**Regression this encoding exists to prevent (Lee, 2026-08):** set Date completed to
**Aug 1** → save → field showed **Jul 31**. Target start/deferred correctly went to Aug 8.

What happened:

1. Browser in US Eastern stored **local midnight** Aug 1 → `2026-08-01T04:00:00.000Z`
2. Server process in **UTC** ran `startOfDay` → `2026-08-01T00:00:00.000Z`
3. Browser read with **local** getters → evening of **Jul 31**

So calendar days are encoded as **UTC noon of the intended `YYYY-MM-DD`**. Then `toDateKey`
(UTC date components) returns the same key on every machine. Do **not** “fix” with
`startOfDay` on the server — that is process-local and reintroduces the bug.

“Is it still Tuesday **for me**?” is different — that uses **`localDateKey`** / `useToday`
(wall clock of an instant).

## Core rules

1. **Postgres timestamps are timezone-aware** (`timestamptz`).
2. **Every calendar-field write** goes through `fromDateKey` / `asCalendarDay` / `recordDate`
   (detail) — never raw `startOfDay`, never process-local midnight.
3. **Every calendar-field read** for display/compare uses `toDateKey` (UTC components of the
   stored encoding).
4. **Never `new Date("YYYY-MM-DD")`** (UTC midnight) and never process-local
   `new Date(y, m - 1, d)` in shared server/client code.
5. **Never `date.toISOString().slice(0, 10)` ad hoc** — call `toDateKey` or `localDateKey`.
6. **Bare `YYYY-MM-DD` strings** (day page URLs, day keys) are labels; shift with
   `shiftDateKey` / `daysBetweenKeys`.
7. **Instants stay instants** until display (`completedAt` history vs `dateCompleted` day).
8. **No business rule may depend on the server’s `TZ`.** Pass `today: string | null` into
   pure helpers. UI “today” is `localDateKey` on the client.

## Canonical helpers

| Need                           | Use                                                    |
| ------------------------------ | ------------------------------------------------------ |
| Stored calendar Date → day key | `toDateKey` (UTC components)                           |
| Day key → stored Date          | `fromDateKey` (UTC noon)                               |
| Normalize any Date → calendar  | `asCalendarDay` (= `fromDateKey(toDateKey(…))`)        |
| Wall-clock day of an instant   | `localDateKey`                                         |
| “Today” in the UI              | `useToday()` → `localDateKey(new Date())` or `null`    |
| Add days then store calendar   | `asCalendarDay(addDays(…))` (see recurrence)           |
| Whole days between keys        | `daysBetweenKeys`                                      |
| Date input                     | `DateField` — `toDateKey` display, `fromDateKey` write |

`startOfDay` / `addDays` in `dateMath.ts` are **local wall-clock** helpers for appointment
_times_ and intermediate math. After stepping a **calendar** field, re-encode with
`asCalendarDay` before writing.

## Database

- Prefer `timestamptz` for every timestamp column.
- Calendar-day columns: only the date half is meaningful; writers store **UTC noon**.
- Instant columns store the true moment.
- Record dates (`actual_start_date`, `date_completed`): never in the future; clamp on write.
  See `product/date-model.md`.

## Forms and detail drawer

- `DateField` shows `toDateKey(value)` and writes `fromDateKey(picked)`.
- Plan dates on `nodes` (deadline, deferred, target start/end) are re-encoded with
  `asCalendarDay` on save.
- **Record** fields: `max={localDateKey(new Date())}`; server uses `recordDate`.
- Completing a task stamps `date_completed` with `asCalendarDay(at)`, not `startOfDay(at)`.
  Recurrence moves plan dates with `asCalendarDay` after `addDays`.

## Display and grids

- Grid date columns: `toDateKey(date)`.
- Overdue / “today” comparisons: field’s `toDateKey` vs `useToday()` (`localDateKey`).
- Standalone exact values (grid cells, compact rows, filter labels, linked-record dates):
  format the canonical key through `useDateFormatter()` in components, or pass the user's
  `DateFormatId` into pure `src/lib/**` helpers. The Achieve-compatible default is
  `M/D/YYYY`.
- `formatDateKey` reads written `YYYY-MM-DD` components and uses a closed English preset
  catalogue. It never parses the key as an instant and invalid keys render blank.
- Formatting is presentation only. Sorting, filtering, comparisons, native date inputs,
  route keys, and stored values remain canonical `YYYY-MM-DD`.
- Long values keep their existing column tracks and truncate with a full-date tooltip.
  Partial formats also expose the full date on hover.
- Contextual calendar labels keep their own purpose-specific format: day and week headings,
  ranges, mini-month labels, chart axes, timestamps, and planning prose do not follow the
  standalone preference.

## Testing (required regressions)

Calendar fixtures: `fromDateKey("2026-08-01")`. Assert with `toDateKey`. Do **not** assert
`getHours() === 0` (values are UTC noon).

**The suite runs in a pinned zone** — `TZ: "America/New_York"` in `vitest.config.ts`. Some
tests are _about_ local wall clock (the DST spring-forward in `recurrence.test.ts`, the
Aug 1 → Jul 31 story below) and only mean anything in a named zone; the rest must not care.
That is the point of the pin: a test that changes its answer with the machine's zone is
either testing the wrong thing or using a local-midnight fixture where the standard above
says `fromDateKey`. Do not remove it to "fix" a failure — the pin is what makes CI, a Vercel
build (UTC) and a laptop agree.

Must keep green:

1. **Round-trip:** `toDateKey(fromDateKey(k)) === k` for several keys.
2. **Aug 1 / Jul 31:** encoding survives “server UTC + client Eastern” story (see
   `geometry.test.ts` and detail mutation integration tests).
3. **Complete-via-date + regenerate:** complete on day D → `dateCompleted` key is D, deferred
   / target start are D+interval (not D−1).
4. **No re-cycle** when the same calendar day is re-saved on a recurring task.

## Common pitfalls

| Pitfall                                                                     | Why it hurts                                                           | Do instead                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `startOfDay` on calendar fields on the server                               | Server TZ rewrites the day (Aug 1 → Jul 31)                            | `asCalendarDay` / `fromDateKey`                                          |
| Local midnight encoding                                                     | Client TZ ≠ server TZ                                                  | `fromDateKey` (UTC noon)                                                 |
| Local getters for stored field keys                                         | Off-by-one after evening / SSR                                         | `toDateKey` (UTC)                                                        |
| `localDateKey` for stored deadlines                                         | Wrong near zone boundaries                                             | `toDateKey`                                                              |
| `toDateKey(new Date())` for picker max / “today” UI                         | UTC “today” on the server                                              | `localDateKey` / `useToday`                                              |
| Asserting `getHours() === 0` on calendar fields                             | Fails; stored as UTC noon                                              | `toDateKey` / `getUTCHours() === 12`                                     |
| `setHours` / `setMinutes` on the server to place a Time Chart `startMinute` | Vercel is UTC, so a 9am block becomes 5am Eastern against appointments | `floatingDateTime` on the day key; `parseFloatingDateTime` on the client |

## Where things live

| Concern                       | Location                                            |
| ----------------------------- | --------------------------------------------------- |
| Day keys, calendar encoding   | `src/lib/schedule/geometry.ts`                      |
| Local wall-clock arithmetic   | `src/lib/dateMath.ts`                               |
| DateField                     | `src/components/detail/fields.tsx`                  |
| Today hook                    | `src/components/grid/useToday.ts`                   |
| Standalone display formats    | `src/lib/dateFormat.ts`, `SettingsProvider.tsx`     |
| Detail save / record dates    | `src/lib/detail/mutations.ts`                       |
| Completion + recurrence moves | `src/lib/tree/mutations.ts`, `src/lib/recurrence/*` |
| Domain meanings               | `agent-os/standards/product/date-model.md`          |

---

## development/clean-code

# Clean code

Most of the code here is written by an agent and reviewed by one person in a hurry. That
changes what "clean" is for. It is not craftsmanship for its own sake — refactoring is
cheap now, so the old argument from cost is weaker. What is expensive is **review** and
**being wrong in a plausible-looking way**.

So the principles that survive are the ones that make code (a) easy to skim and trust in a
diff, and (b) safe for an agent to change one part of without breaking a distant part.
Names, small units, hard boundaries, boring consistency, and testability. Everything below
is one of those five wearing a different hat.

## The layers, and which way dependencies point

This is the highest-value rule in the file. It is what lets an agent work inside
`src/lib/fitness/` without touching the schedule.

```
src/app/**          routes, pages, and actions.ts — thin
  ↓
src/components/**   presentation and interaction
  ↓
src/lib/<domain>/   the real logic: pure modules, queries.ts, mutations.ts, types.ts
  ↓
src/db/             Drizzle schema and the client
```

Concretely:

- **`src/lib/**` never imports from `src/app/**`.** It does not know it is in a web app.
  It imports `@/components` only for a shared _type_ (a column shape), never a component.
- **Components never touch the database.** They may `import type` from `@/db/schema` and
  from a `mutations.ts` (a patch type is part of the contract), but the `db` client itself
  stops at `src/lib`. Components mutate by calling a server action.
- **`actions.ts` is a wrapper, not a place for logic.** It resolves the user, delegates to
  `src/lib`, revalidates, and shapes the result. `src/app/fitness/actions.ts` is the
  reference: one `run()` helper, one line per action. If an action grows a branch, the
  branch belongs in `src/lib`.
- **Every mutation takes `userId` as its first argument and scopes on it.** No exceptions,
  no ambient current-user lookup inside `src/lib`. See `development/testing.md` for why
  this is also a testing rule.

When a change wants to cross a layer the wrong way, that is the signal to stop and move
logic down, not to add an import.

## Names

Name the concept, not the mechanics. The file names in `src/lib/tree/` are the standard to
hold: `completionCascade.ts`, `shelving.ts`, `owningProject.ts`, `nextActions.ts`. Each one
tells you what domain question it answers before you open it.

- A module is named for the idea it owns, and its test is `<same>.test.ts` beside it.
- Functions read as what they return or do — `matchesFilter`, `flattenLevels`,
  `requireExercise`. `handle`, `process`, `doUpdate` are not names.
- Booleans read as assertions: `isShelved`, `hasChildren`.
- Say the unit when there is one: `weightLb`, `delaySeconds`, `dateKey` — never a bare
  `date` for something that is actually a calendar day string. See `development/dates.md`.
- Match the surrounding spelling, including the British `normalise`/`normaliseEquipment`
  already in `src/lib/fitness/`. Consistency beats your preference.

Good names are also the cheapest prompt engineering available: an agent continues the
patterns it can see, and ambiguous names are what make it invent a second, conflicting one.

## Small units, one reason to change

Pure logic goes in `src/lib/<domain>/` as a small module with a single job, and gets a
sibling test. `src/lib/fitness/` shows the grain: `plates.ts`, `bars.ts`, `restTimer.ts`,
`weightStep.ts` — each a concept, each a few dozen lines, each testable without a database
or a render.

- If a component holds a calculation, a comparison, or a rule with an edge case, that
  belongs in `src/lib`. The component keeps the wiring.
- If a function needs a comment to explain its second half, that half is a function.
- Split by _reason to change_, not by size. `queries.ts` and `mutations.ts` stay separate
  even when both are long, because they change for different reasons.

## Consistency over cleverness

There is one of each thing here. Use it; do not build a second one.

| Concern              | The one implementation                                                      |
| -------------------- | --------------------------------------------------------------------------- |
| Tabular anything     | `DataGrid` (`src/components/grid/`) — see `components/data-grid.md`         |
| Centered dialog      | `ModalShell` (`src/components/detail/`) — see `components/modal-pattern.md` |
| Record editing       | `Drawer` + `DrawerFooter` — see `components/drawer-pattern.md`              |
| Views and commands   | the registries in `src/components/shell/` — see `components/navigation.md`  |
| Server action result | `run()` / `runQuery()` / `ActionResult` in `src/app/actionResult.ts`        |
| HTTP responses       | `{ ok, data }` / `{ ok, error }` — see `api/response-format.md`             |
| Calendar dates       | `fromDateKey` / `toDateKey` — see `development/dates.md`                    |

A second grid or a bespoke dialog is not a local decision; it is a permanent tax on every
future change and a fork in the pattern an agent will learn from. If the shared component
genuinely cannot do the job, extend the shared component.

The same holds inside a file: copy the error-handling, the import order, and the argument
order of the code next to it, even where you would have chosen differently on a blank page.

## Explicit over implicit; simple over general

- Make data flow visible. Prefer a passed argument to a context lookup, a returned value to
  a mutated parameter, one `if` to a lookup table of one entry.
- **No speculative generality.** Do not add an options object, a strategy parameter, or a
  `<T>` for a second caller that does not exist. When the second caller arrives, generalise
  then — the diff is small and the shape will be right, which it would not have been.
- Comments explain _why_, and are worth writing exactly where the reasoning is non-obvious:
  the header comment in `src/lib/fitness/mutations.ts` ("history rows never cascade from the
  outline") is the model. Comments that restate the code are noise that goes stale.
- Where a rule is deliberately not enforced, say so and say why — the
  `no-unnecessary-condition` note in `eslint.config.mjs` is the model. A future agent will
  otherwise "fix" it.

## Testability

Design so the tricky part can be tested without a browser: pure function in, value out.
That is the practical reason logic lives in `src/lib`. What to test and what to skip is
`development/testing.md` — do not duplicate it here.

## DRY, judiciously

Deduplicate a **business rule** — a rule that must change in one place or be wrong. Priority
ordering, shelving semantics, date encoding: one implementation, always.

Tolerate duplicate _shape_. Two components with similar JSX, two queries with a similar
`where`, are not a violation. Extracting them early produces an abstraction with a boolean
parameter, which is worse than the copy and harder to unpick later. Two occurrences is a
coincidence; three with the same reason to change is a pattern.

## When an agent writes it

- **Small, reviewable diffs.** A change that touches one domain folder gets read properly;
  a 40-file change gets skimmed and merged on faith.
- **Review agent output like a junior's:** run `npm test`, `npm run lint`, and the
  typecheck, and read the diff. Confident, plausible, and wrong is the failure mode.
- **New abstractions, new dependencies, and new shared components need a reason stated in
  the PR or the spec.** Deleting a guard, a check, or a test to make something pass needs a
  louder one.
- **Load the relevant standards before writing** (`/inject-standards`). Stated constraints
  are what keep generated code inside the guardrails.
- Put human effort into the expensive parts — layer boundaries, the data model, the
  `userId` scoping, domain rules — and let the agent do the mechanical work inside them.

---

## development/security

# Security

This file exists because real bank data landed in the app on 2026-08-12. The application
layer already scoped every finance read and write by `userId`; what it did not have was a
written rule for the next agent that touches auth, a mutation, or a header. The
hardening that prompted this file is
`agent-os/specs/2026-08-12-1316-security-hardening-and-standard/`.

## Per-user scoping is the core invariant

Every mutation takes `userId` as its first argument and **proves ownership before
writing**. An `UPDATE … WHERE id = ? AND user_id = ?` that matches nothing looks exactly
like a successful no-op, so a dropped `userId` is invisible unless something checks.
`requireTransaction` / `requireAccount` in `src/lib/finances/mutations.ts` are the
pattern: load the row scoped to the caller, throw if it is missing, then write.

A database test is not done until a second user has tried to read, change, and delete
the first user's row and failed at every step. That is also in
`development/testing.md`; it is restated here because it is a security rule that happens
to be enforced by tests, not a testing preference.

When you add a query module, register it in
`src/lib/db/crossUserReads.integration.test.ts`. That file is the repo-wide sweep for a
dropped `userId`. A new `listX` that only ever runs in a one-user test will not catch
itself.

## The auth gate is server-side; the proxy is not the gate

`src/proxy.ts` checks cookie _presence_ so guests never see the app chrome. The
authority is `getCurrentUserId()` inside each page and action, which validates the
session. That redundancy is the point. Next's middleware-bypass CVE class
(CVE-2025-29927) was a non-event here because a request that skipped the proxy still
had no session and no user.

Do not "simplify" this by making the proxy the only check. Do not narrow the matcher
to skip prefetches: that matcher is the auth gate as well as the header pass.

## Three identities stay separate

From `src/lib/auth/identity.ts`:

1. **Session user** — a human at `/login`.
2. **Dev user** — who the local bypass serves. Default `test@example.com`. Never an
   owner account by default.
3. **Agent user** — who a valid `PLANNER_AGENT_API_KEY` maps to. Required in
   production; no fallback to a real account.

These were one function until the local bypass started running as the account linked to
a real Google Calendar. Unconfigured defaults must resolve to a test address or throw,
never to real data. The two independent gates on the bypass itself are in
`src/lib/auth/dev-bypass.ts` — it is inert in a production build even if the env var
is set.

## Secrets

- Environment only. `.env*` is gitignored except `.env.example`.
- Fail closed when a required secret is unset. The agent Bearer key is the model:
  missing key → `internal`, not open access. See `api/agent-auth.md`.
- Timing-safe comparison for any shared secret, and hash first so length does not leak.
- Never log an `Authorization` header or a password.

## Errors: messages we wrote are user-facing; messages the database wrote are not

Deliberate throws (`new Error("Transaction not found.")`) are the inline validation the
drawers render. Driver errors are not. `postgres` quotes table, column, and constraint
names, and a constraint violation can quote the offending **row values** — which for
the finance tables is a bank description and an amount. Connection failures embed the
database host.

The tell is a `code` property, or `name === "PostgresError"`. Nothing this codebase
throws on purpose has a `code`. The check lives in `src/lib/security/safeError.ts` and
runs at every client boundary: `actionErrorMessage` in `src/app/actionResult.ts`, and
the import/export route catches. Log the real error before replacing it, or the next
Neon timeout becomes "Something went wrong." with no way to find out why.

Do not start a `UserFacingError` hierarchy to "do this properly." One hundred and fifty
deliberate sentences would have to be reclassified, and a missed one would become
"Something went wrong." The leak class that matters is the one nobody wrote.

## Headers and CSP

Static headers live in `next.config.ts`: `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`. The Content-Security-Policy is **not** there —
it carries a per-request nonce, generated in `src/proxy.ts` and built by
`src/lib/security/csp.ts`.

The nonce must be set on the **request** and the **response**. Next.js extracts it by
parsing the CSP off the request, which is how framework and bundle script tags get it
without a single `<script>` being touched. Setting it only on the response ships a
policy whose nonce nothing on the page carries — a blank screen, not a soft failure.

Two constraints that will look like mistakes:

- **No nonce in `style-src`.** A nonce present in a directive makes the browser ignore
  `'unsafe-inline'` in that same directive. FullCalendar positions every event with an
  inline `style` attribute; a nonce here breaks the calendar while looking stricter.
- **`'unsafe-eval'` is development only.** React uses `eval` to rebuild server stacks
  in the browser. Neither React nor Next.js evals in a production build.
  `upgrade-insecure-requests` is production only for the same reason:
  `http://localhost:3047` must keep working.

**Do not set HSTS.** Vercel already sends
`max-age=63072000; includeSubDomains; preload` on `.vercel.app`, and that domain is on
the browser preload list. A hand-rolled value would risk overriding a
preload-qualified one with a weaker one.

## Rate limiting

Better Auth's in-memory sign-in limit (3 per 10s) is adequate against a 36-character
password from a manager, with public sign-up disabled. Database-backed storage would
buy DoS/cost control at the price of a table and a write per auth request on Neon's
free tier.

Revisit when any of these become true: a second human user, public sign-up, or a
password that is not from a manager.

`minPasswordLength` is 16 in both `src/lib/auth/server.ts` and
`src/lib/auth/provision.ts`. The provision copy exists because a script that hashed a
short password would write a row Better Auth then refused to sign in.

## Dependencies

Patch `next` promptly — it is the runtime surface. Dev-only transitives
(`drizzle-kit`, `esbuild`, unused `sharp` via `next/image`) are low priority.
Dependabot (`.github/dependabot.yml`) opens the PRs weekly, grouped by
production/development minor+patch. Majors stay ungrouped so they get read.

## Markdown

`rehype-raw` stays out of `react-markdown`. Notes are a stored-XSS surface if HTML in
a note becomes executable. See `src/components/notes/MarkdownPreviewBody.tsx`.

---

## development/testing

# Testing

This is a personal project with one developer and no users to page at 3am. Tests here are
not a quality ritual and not a coverage target — they are a **tripwire**. Their job is to
notice when something quietly stops working: a refactor that drops a `userId` from a
`where` clause, a date helper that shifts by an hour across DST, an agent that "fixes" a
bug by deleting the guard that caught it.

That purpose sets the bar. A test earns its place if it would **fail loudly on a plausible
mistake**. If breaking the code would not break the test, the test is decoration.

## What gets tested

**Pure logic in `src/lib/**` — always.** Recurrence expansion, sort keys, tree slicing,
date geometry, filters. These are cheap to test, hold the trickiest reasoning in the
codebase, and are exactly where a wrong answer looks plausible. Adjacent `foo.test.ts`.

**Database mutations and queries — always, as `*.integration.test.ts`.** Every one of these
takes a `userId` and is expected to scope by it. Prove it: a mutation suite is not done
until it has a case where **a second user tries to read, change, and delete the first
user's row and fails at every step**. A dropped `userId` is one of the easiest mistakes to
make and is completely invisible when you only ever test with one user.

**React components — no.** There is no testing-library setup and adding one is not
currently worth it. The bug class that actually bit this codebase in components was
unhandled promise rejections, and that is caught by the type-aware ESLint rules
(`no-floating-promises`, `no-misused-promises`) far more cheaply than by rendering tests.
If a component grows real logic, extract it to `src/lib/**` and test it there.

**Server actions in `src/app/**/actions.ts` — no.** They are thin wrappers that resolve
the user and delegate. Test what they delegate to.

## What a good test looks like here

- **Name the invariant, not the mechanics.** `"does not let one user rename another's
chart"` survives a rewrite. `"calls db.update with the right args"` does not.
- **Pin behaviour that is easy to get subtly wrong**, and say why in a comment when the
  expected value is non-obvious — DST boundaries, end-of-month clamping, inclusive vs
  exclusive range ends, "end after N occurrences" when the window starts later.
- **Prefer real values over mocks.** Integration tests use the real Postgres from
  `npm run db:up`, each under a freshly created user, cleaned up in `afterAll`. Do not mock
  Drizzle — a mocked query proves nothing about the query.
- **Cover the boundary, not every value.** One test for "interval 0 floors to 1" beats six
  tests for intervals 1 through 6.

## What not to write

- Snapshot tests. They pass whatever the code does, which is the opposite of a tripwire.
- Tests that restate the implementation line by line. When the code changes they change
  with it and never catch anything.
- Tests for framework or library behaviour. Drizzle and Vitest are already tested.
- Tests for trivial pass-throughs, getters, or type-only modules.

## When adding a feature

1. Put the real logic in `src/lib/**`, not in the component.
2. Write the pure tests alongside it. If the logic branches on dates, include a DST or
   month-boundary case. Calendar fixtures use **`fromDateKey("2026-08-01")`** and assert
   with **`toDateKey`** — never `new Date("2026-08-01")`, never `getHours() === 0` (stored
   as UTC noon). Keep the Aug 1→Jul 31 regression covered — see `development/dates.md`.
3. If it touches the database, add an `*.integration.test.ts` — including the cross-user
   case.
4. Run `npm test`. The pre-commit hook runs the unit tests and pre-push runs everything,
   but do not make the hook the first time you find out.

## Mechanics

|                        |                                                                   |
| ---------------------- | ----------------------------------------------------------------- |
| Unit tests             | `foo.test.ts` beside `foo.ts`, no database, must stay hermetic    |
| Integration tests      | `foo.integration.test.ts`, real Postgres, one fresh user per test |
| Run everything         | `npm test`                                                        |
| Run only the fast ones | `npm run test:unit`                                               |

Integration tests **skip loudly** when Postgres is unreachable, so a stopped container
never blocks a commit — see `src/lib/testing/database.ts`. That means a green
`npm run test:unit` does **not** mean the database logic passed. Check for the skip
warning before trusting a green run on a change that touched `src/lib/**/mutations.ts` or
`queries.ts`.

---

## database/migrations

# Migrations

Drizzle, `drizzle/` for the SQL, `drizzle/meta/` for the snapshots it diffs against.

## Changing the schema

```sh
# 1. edit src/db/schema.ts
npm run db:generate     # writes drizzle/NNNN_name.sql + meta/NNNN_snapshot.json + journal entry
# 2. read the generated SQL before trusting it
npm run db:migrate      # applies it locally
```

Commit the **`.sql`, the snapshot, and the `_journal.json` entry together**. They are one
change; a commit with two of the three is the bug described below.

## Never hand-write a migration without its snapshot

`db:generate` diffs the _last snapshot_ against `schema.ts`. Drop one and the next generate
diffs from a stale baseline, emits SQL that re-creates things that already exist, and has to
be hand-written too — which drops another snapshot. **One omission poisons every migration
after it.**

That is not hypothetical: `0004` (commit `566a565`) shipped a `.sql` and a journal entry
with no snapshot, `0005`–`0008` were then all hand-written, and `db:generate` was unusable
for five migrations. `0007` made it worse by adding a snapshot that was the `0003` schema
re-stamped with new ids — a _wrong_ snapshot is worse than a missing one, because drizzle
believes it.

If you genuinely must hand-write SQL that `generate` cannot express (a backfill, a
data-preserving column swap), still regenerate the snapshot afterwards so the chain stays
intact.

**Current state:** repaired as of `0008`. Snapshots `0004`–`0006` are absent and `0007` is
wrong; they are left as history. Only the newest snapshot matters for diffing, and that one
is correct — `db:generate` works and reports "No schema changes" against a clean tree.

## Hand-written SQL, when unavoidable

Statements are separated by a breakpoint marker, and a column swap keeps the data:

```sql
ALTER TABLE "appointments" ADD COLUMN "check_state" "appointment_check" DEFAULT 'open' NOT NULL;--> statement-breakpoint
UPDATE "appointments" SET "check_state" = CASE WHEN "completed" THEN 'done'::"appointment_check" ELSE 'open'::"appointment_check" END;--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "completed";
```

Add the column, backfill it, then drop the old one — never drop first.

## Connections

Migrations run over **`DIRECT_DATABASE_URL`**, never the pooler
(`drizzle.config.ts` falls back to `DATABASE_URL`). Neon's pooled endpoint is
transaction-mode, where DDL like `ALTER TYPE ... ADD VALUE` fails with an unhelpful error.
Locally the two are the same string.

## Production

`npm run build` runs `scripts/migrate-on-deploy.mjs` before `next build`, so schema and code
ship together — a past deploy shipped code querying tables Neon did not have yet.

It is gated hard on `VERCEL_ENV === "production"`. **Preview deployments share the one Neon
database**; without the gate, a push to any branch could reshape production's schema. A
failed migration fails the build rather than deploying code whose tables do not exist.

## `db:push` — local scratch only

`db:push` writes `schema.ts` straight to a database and produces **no migration file**, so
the files and the database silently diverge. Fine for trying a shape on your own Docker
Postgres; never against Neon, and never as the thing that ships. The change is not real
until `db:generate` has produced a migration.

## `db:seed` is destructive

It **deletes the dev user's nodes, appointments and time charts** before inserting. Never
run it to refresh a database someone is using. To exercise it, point it at a scratch
database — an exported `DATABASE_URL` beats `--env-file`:

```sh
docker exec planner-postgres psql -U planner -d postgres -c 'CREATE DATABASE planner_seedcheck'
export DATABASE_URL="postgresql://planner:planner@localhost:5432/planner_seedcheck"
npx drizzle-kit migrate && npm run db:seed
```

---

## components/navigation

# Navigation & Commands

> For the philosophy these rules serve, see `ux-principles.md`. For how each surface
> reshapes below the breakpoint, see `responsive.md`.

Achieve Planner reached all sixteen of its views through the **Go** menu, and kept only the
ones you had opened as tabs. We inherited the tabs without the Go menu, so every view had to
be a permanent tab and the eleventh was already too many.

Six surfaces now, each answering a different question.

| Surface                      | Question it answers              | Role                              | Where                           |
| ---------------------------- | -------------------------------- | --------------------------------- | ------------------------------- |
| **Sidebar** (`⌘K` to search) | "Where can I go?"                | Visual catalog of destinations    | Desktop, always                 |
| **Page bar**                 | "Where else can I go _in here_?" | Destinations inside this module   | Above the toolbar, both layouts |
| **Menu bar**                 | "What can I do here?"            | **Complete catalog of commands**  | Every destination's command row |
| **Commands panel**           | "…show me all of it at once"     | The same tree left open           | Desktop, opt-in, remembered     |
| **Row context menu**         | "What can I do to _this_ row?"   | Narrow, row-scoped subset         | Right-click / long-press a row  |
| **Command palette** (`⌘K`)   | "What can this app do?"          | Searchable overlay + Go-to extras | Desktop, on demand              |

The menu bar is the **source of truth for completeness**. Toolbars and the Commands panel / palette are accelerators. A user who never opens `⌘K` must still be able to find every command by reading the menus.

Below `md` the sidebar is replaced by the bottom nav plus the More sheet, there is no palette and
no command row, and no panel — **`⋯` becomes the menu bar**, rendering the same tree with the
section names as headings. See `responsive.md`.

Achieve had four of these six (menu bar, icon toolbars, the docked **Outline Commands** pane, and
a sectioned row menu), all reading one command set. The palette is ours; the point of the others is
that they were right.

## Modules live in one registry

`src/components/shell/modules.ts` is the only list of modules. It is read by the sidebar, the
phone bottom nav, the More sheet, the phone header's "you are here" title, and the palette's
go-to entries.

**Never hard-code a module anywhere else.** Five surfaces reading one array is what stops the
phone and the desktop from disagreeing about what the app contains — the previous version of
this file was four surfaces reading `TABS`, and that was already the reason it worked.

The rule has already been broken once, quietly: `MobileNav` wrote out its three hrefs while this
section listed it among the readers. It went unnoticed until Tasks became a page and `/tasks`
stopped being a destination at all. **A surface that hard-codes agrees with the registry right
up until the registry changes**, which is the only moment the rule was for.

### The list is flat

There are no sections. Modules were grouped under `Plan` / `Do` / `Track` / `Library` while
there were fifteen of them, and nine turned out to be pages: seven Plan modules that were one
`loadOutline` drawn seven ways, plus Contacts and Resources. Eight rows do not need headings,
and `Plan` and `Library` would each have been a heading over one row of the same name — the
chrome-that-teaches-nothing the page bar's two-page floor rejects one tier down.

If the sidebar grows back past a dozen, grouping returns as a field and a `groupBy`. It is not
a decision that needs defending in advance, which is why the `section` field went rather than
being kept warm.

### Reserved modules

A module we have decided the home of but not built is marked `status: "reserved"`. It renders
nowhere and is not a navigation target.

- **Do** add the entry as soon as the module is decided on. It costs a line and it stops the
  next person re-arguing navigation.
- **Do not** render a reserved module as a disabled or "coming soon" entry. A menu full of dead
  rows teaches the reader to stop reading the menu, and then the live rows stop working too.

### The phone's primary destinations are a registry list, and one of them is a page

`PRIMARY_DESTINATIONS` in `modules.ts` holds the bottom bar's three slots in order, each naming
a module and _optionally_ a page. `primaryDestinations()` resolves each to an `href` and an
`isActive(pathname)` predicate.

This replaced a `primary: boolean` on the module entry, and the reason is worth keeping: **a
flag can only point at a module.** The Tasks slot has to open `/plan/tasks`, and a module-level
`primary` would send it to `/plan`, which resolves to `lastPage` — a button labelled Tasks
opening Goals. The predicate is the other half: comparing module ids would light Tasks on all
seven Plan pages.

Icons live with this list rather than in `pages.ts`, which stays React-free so it can be
unit-tested. That split is why the two registries exist at different altitudes at all.

## Pages live in one registry too

Three words, three different things, and they are not interchangeable:

| Word       | Means                                                    | Registry                  |
| ---------- | -------------------------------------------------------- | ------------------------- |
| **Module** | A sidebar destination — Plan, Fitness, Schedule          | `shell/modules.ts`        |
| **Page**   | A destination _within_ a module — Tasks, Journal, Agenda | `lib/navigation/pages.ts` |
| **View**   | A saved collection of filter / column / sort settings    | `lib/settings/views.ts`   |

Tasks moved from the first row to the second when the consolidation ran, which is the useful
thing about the example: **the tier a destination belongs to is a fact about the data behind
it, not about how important it is.** Seven grids over one `loadOutline` are seven pages no
matter how much time you spend in them.

A fourth word, **pane**, is a layout region that collapses below `md` (Day's appointments /
list / journal). It is responsive layout, not navigation, and does not belong in any registry.

**"Lens" names exactly one thing: `TabToolbar`'s second row.** It is a useful name for the row
that answers "what am I looking at" — view picker, search, filter, grouping, density — and it
stops being useful the moment an individual control is also called a lens, which is how two
separate page switchers came to be documented as "lens controls" while sitting one tier above
everything else on that row. The row is the lens; the things on it have their own names.

**View is not renamed.** It is Achieve's own word for a saved column/filter preset, it is in
`data-grid.md` and every grid call site, and "lens" as a synonym for it buys nothing.

`pages.ts` is keyed by module id and holds no icons — the bar is text — which is what lets it
live in `src/lib` and be tested. `modules.ts` owns the accessors (`modulePages`,
`moduleHasPageBar`, `moduleDefaultPageHref`) and asserts at compile time that every id keying
the page registry is a real module.

**Everything the module registry promises, the page registry promises.** One list, read by the
bar, the palette's go-to entries and the bare-path redirect. `status: "reserved"` means renders
nowhere and is not a target. A reserved page is not drawn as a disabled tab.

### The control depends on the question, not the module

> **Underline tabs are navigation. Bordered segments are a setting with two or three values.**

This is the whole rule, and it was written after four modules answered "how do I reach the other
thing in here" four different ways: Fitness with a bordered segment in one style, Schedule and
Notes with a bordered segment in another, Day with a bare pair of links. Consistency here does
**not** mean one control for every switcher — that is exactly how `Sessions | Exercises` came to
look like a density picker. It means one control per question, drawn identically everywhere.

Density keeps its bordered segment. Every navigation switcher is a tab.

### The bar gets its own row, and only when it earns one

Above the toolbar, below the phone header. Not folded into the command row: navigation sits at
the rank of the sidebar, and putting it among the verbs is the flattening `TabToolbar`'s two-row
split already exists to prevent, one tier up.

It renders **only at two or more built pages**. A single tab spends a row saying "you are in the
only place there is", so most modules — and Finances, until Insights lands — pay nothing.

Below `md` the page bar is the row that survives. The command row is hidden down there, so the
bar is the _only_ path to a sibling page: it scrolls sideways and its tabs are 44px.

### A page is a URL

Real `<Link>`s to real routes, so Back works, reload holds, and a page opens in a new tab. Two
of these were persisted settings that never touched the address bar, and promoting them cost
nothing: the stickiness that motivated the setting is preserved separately by the bare module
path redirecting to `shell.lastPage`.

The query string is carried across a page switch, because the query is _where you are looking_
and the page is _how it is drawn_ — flipping Calendar → Agenda must not discard the week you
scrolled to. Each page validates its own params, so one the destination cannot use is ignored.

### A focused flow is not a page

`/schedule/plan`, `/fitness/log`, `/schedule/time-chart/[id]` and the editors never appear in
the bar. The test: **in the bar you leave by tapping a sibling; a focused flow has an exit.**

This is enforced by how the active page is resolved, and the rule is neither of the two you
would reach for first. **A declared segment matches its own subtree; anything undeclared matches
nothing.**

- `/fitness/sessions/abc` is the session editor, rendered _inside_ the Sessions page. Exact
  matching would drop the bar and the editor would look like it had left the module.
- `/schedule/time-chart/abc` is a focused flow. "First segment after the module" would invent a
  page for it.

Both wrong answers fail silently on a real route, which is why `pageForPathname` is tested and
the bar is not.

**The worked example lives in Schedule and is one letter wide.** The Time Charts list is the
page `/schedule/time-charts`; the editor is the focused flow `/schedule/time-chart/[chartId]`.
The list moved into Schedule and the editor deliberately did not move with it, because a
declared segment owns its subtree — `/schedule/time-charts/abc` would resolve to the page and
put the bar on an editor that already has its own exit. Anyone tidying the singular into the
plural is removing the mechanism, and `pages.test.ts` asserts both halves so they find out.

## Commands live in one registry

`src/lib/commands/registry.ts` defines what a command is. A module publishes its own with
`useRegisterCommands` and every renderer reads them through `useCommands`.

**One registry, every renderer.** A command described in two places is a command whose two
descriptions eventually disagree about whether it is available, what it is called, or which key
fires it. All three have happened here: eight views hand-wrote their row menus and one said
`Open record` where its own toolbar said `Open`; the Notes grid printed `Ctrl+Insert` and
`Shift+Tab` where the rest of the app printed `⌃Insert` and `⇧Tab`.

### A command declares its own placement

`menu`, `section`, `icon`, and optionally `toolbar` (a weight, meaning "also give me an icon
button") and `rowMenu`. `src/lib/commands/menus.ts` turns those into the menu tree, the icon row,
and the row menu.

Placement belongs to the **command**, never to the surface. A surface that filtered the list
itself would be a second placement rule, in a second file, that has to agree with the first — which
is what the Outline's twelve-id row-menu allowlist was, a thousand lines from the command it was
filtering.

`MENU_SECTIONS` is the declared section order per menu. It is a table rather than "whatever order
the commands were built in", because build order is an accident of which hook ran first and a menu
whose rows move between views is a menu you re-read every time.

### A command declares its own binding

`bindings`, and the printed shortcut is **derived** from it (`formatBinding`). There is one
`document` listener for all of them (`CommandKeys`), not one per view.

`Command.shortcut` used to be a string typed beside the label while the key that fired it lived in
a `switch` in whichever view owned a listener — eleven of them. Nothing in the app connected `"⌥↑"`
to `event.altKey && event.key === "ArrowUp"`, so a menu could promise a chord for years after the
handler stopped accepting it.

**Selection movement is not a command.** Arrow keys and shift-extend walk a row set; they have no
label, no menu row and no icon, and they stay in the view that owns the selection. If it belongs in
a menu it gets a binding; if it does not, it does not.

### Menus are the source of truth

`ux-principles.md`: _a gesture nobody can see is not a discoverable action_ — and there is no
`⌘K` on a phone. Every command must have a visible, tappable path.

**A command without `menu` is not shipped.** That is the rule that makes the palette and the
icon row legal. Adding a command to `⌘K` or to a toolbar alone is shipping it for the person
who already knew it was there.

The one exception is `group: "go"` — destinations. Their visual catalog is the **sidebar**
(and the page bar inside a module). The palette lists them as extras so typing `agenda` still
works. They do not get a Go menu. App-wide verbs (capture, Process Inbox, Plan Week, Settings,
Sign out) are **not** this exception; they live in **File**.

### Complete everywhere, sectioned everywhere

Every surface lists everything it is responsible for, and **sections** are what keep that
readable. "Short" was the old answer and it was the wrong one: the `⋯` menu was kept short by
leaving things out and unsorted, which is how it ended up as a traditional app menu with the
organization removed.

- The **menu bar is the complete catalog.** File is leftmost and always present. New / Item /
  Organize / View / Tools appear when the destination has something for them. A command that
  is not in a menu does not exist to anyone not already holding `⌘K`.
- The **toolbar is a subset.** `toolbar` is a weight meaning "also an icon button." Every
  toolbar item must also be a menu command, because that row is hidden below `md`. Frequency
  and immediacy, not completeness.
- The **Commands panel is the same tree left open.** Same labels, same sections, same
  disabled reasons. Register File at the shell — a File menu that exists only as a
  `CommandBar` prop is invisible to the panel and to `⋯`.
- The **palette lists every menu command, plus Go-to.** Shortcuts are printed. **View ▸
  Command palette** is the discoverable invocation; do not rely on people already knowing
  `⌘K`.
- The **row menu is the one narrow surface**, because it is about one row. A command opts in
  with `rowMenu`, and it is the same command with the same label — not a hand-written
  near-copy.

The same command has the same name, icon, and resulting action on every surface.

`ownControl: true` is the one exclusion, and it means something narrow: a _non-command widget_ on
the lens row already controls this (`Filter…`, `Group by`, density). `⋯` skips those and only
those, because on a phone that widget is the thing still on screen. Commands promoted to the
desktop icon row are **not** skipped — that row does not exist down there, so `⋯` is the only place
they live.

### Unavailable is not absent

A command that cannot run right now — nothing selected, no groups to collapse — is
`disabled`, not filtered out, with `title` saying why. A command that vanishes teaches you it
does not exist; a greyed one with "Select a row first" teaches you how to use it.

**The reason has to be the specific one.** "Paste" greyed with no `title` is indistinguishable
from a broken menu, and there are five separate reasons a paste can be refused. Where a helper
computes the refusal, it returns _the sentence_, not a boolean — `pasteRefusal` and
`GridSelectionCapability.moveReason` are both that shape, and both exist because the generic
sentence sent people looking at the wrong thing.

### A family folds behind one row

A section named in `NESTED_SECTIONS` renders as a single row with a fly-out (desktop) or a
drill-in with a Back row (touch), on **every** surface that shows it — the row menu and the menu
bar alike. Nesting a family on one and not the other is two shapes for one thing.

Which families fold is declared, not derived from how many rows they happen to have: `Convert to`
has five entries on the Outline and two on a flat grid, and a length rule would nest it in one
view and not the next. The single length condition is a floor of **two** — a fly-out onto one row
is a hover you have to perform to learn there was nothing behind it.

Fold the families where the _name_ is the useful thing and the members are a value picker: which
kind, which letter, which state, which level. Do **not** fold the verbs someone opened the menu
for. `Item`, `Move` and `Danger` stay flat, because burying `Delete` one hover deep is hiding it
rather than organizing it.

### Right-click reaches more than rows

Three targets, all built from `Command`s and rendered by `menuItemsFor`:

| Target                             | Menu                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| **A row**                          | `rowMenuFor(capabilities)` — the registry's `rowMenu` commands, for the row under the pointer |
| **Blank grid space**               | The same menu with **no selection**: item verbs greyed with their reason, creation live       |
| **A calendar slot or appointment** | The week's own verbs, resolved by hit-testing the point                                       |

The blank-area menu is deliberately not a second, shorter list. It is the row menu with `rowId`
`null`, which is why it cannot drift from the row menu — and why `New` is on the row menu at all:
without one live command, right-clicking an empty grid opens a menu of dead entries.

A menu is **rebuilt on open**, never read from the registered command list. Right-clicking an
unselected row selects it in the same event, so the registration still describes the previous
selection at the moment the menu appears.

### Plural where the verb is plural

Delete, the state changes and Cut act on the whole selection and print its size (`Delete (3)`).
Open, Rename, Indent, Outdent and Convert stay singular — opening three drawers is not a thing.

Two things must hold before a command may act on a selection, and neither is free:

1. **The selection is the rows on screen.** `DataGrid` reports them (`onNavigableIdsChange`); a
   host must not derive them from the rows it passed _in_, which is the list before the grid's
   own filters and search narrow it.
2. **The list is reduced to roots** (`selectionMoveRoots`). A child selected alongside its parent
   is already inside that parent's branch; acting on both does it twice and counts it twice.

### Where a control belongs

Three tiers, and a control should sit in the lowest one that still works. The menu tier is
the **catalog**, not a junk drawer for things you could not justify on the bar:

| Tier                | For                                                                              |
| ------------------- | -------------------------------------------------------------------------------- |
| **On the bar**      | Used most sessions. An icon button (`toolbar`), or a widget on the lens row      |
| **In a named menu** | Every real command. Occasional ones live _only_ here (`Show Fields`, the zooms)  |
| **Palette only**    | Nothing except `group: "go"` destinations (sidebar is their catalog). See above. |

`data-grid.md`'s toolbar tests still apply first: a control that is a column filter wearing a
checkbox, or whose only two states are "unavailable" and "duplicated", does not belong in any
of the three tiers — it belongs deleted.

## Shell state is a setting, not a `localStorage` flag

The sidebar's collapsed state and the Commands panel's open/collapsed state live in
`user_settings` under the `shell` scope, because they are the first things painted. Settings load server-side in `src/app/layout.tsx` precisely so a
stored preference arrives in the first HTML; a rail that renders expanded and then snaps shut
on every navigation is the most visible possible version of the flash that decision exists to
prevent.

Anything else the shell remembers goes in the same scope, and its parser must return defaults
for an unusable blob rather than throwing. It runs before the first paint: an exception there
does not break one grid, it breaks the app.

## Events, not a provider, for "open this"

The palette and the capture dialog own their own open state. The buttons that open them are
siblings, not descendants, so they dispatch a `window` event (`shell/commandEvent.ts`,
`capture/event.ts`) rather than forcing a provider into the root layout — which would also
hand the surface to `/login`, where it does not belong.

The keyboard shortcut is _not_ a dispatch of that event. `⌘K` and `c` are document listeners
inside their own components, because they need the `isTypingTarget` and `isModalOpen` guards
from `src/lib/keyboard.ts`, and those belong with the component that knows what it is doing.

## Testing

The registry's matching and merging, the menu tree (`menus.ts`), the binding match/format
(`bindings.ts`) and the shell settings codec are pure and live in `src/lib/` with tests. The
sidebar, menu bar, panel, palette, provider and overflow button are wiring and get none —
`testing.md`. Verify them in a real browser via the `run-planner` skill.

Two of those tests exist because the mistake is invisible otherwise:

- **`formatBinding` over the whole printed vocabulary.** These strings are on screen in menus, the
  panel, the palette and the outline hint bar, so a change to them should have to be deliberate.
- **`matchBinding` matches modifiers exactly.** `Insert`, `⇧Insert` and `⌃Insert` are three
  different commands. A binding that ignored the modifiers it did not name would make plain
  `Insert` fire on all three, and which one won would depend on dispatch order.

One runtime guard is load-bearing: `useRegisterCommands` re-registers on array identity, and
registering sets provider state. Anything in a command list's dependencies must be
identity-stable — a `useCallback` returned from a hook, not a bare arrow. Its dev churn detector
has caught this twice, most recently on the Commands panel's own `setOpen`.

---

## components/ux-principles

# UI/UX Design Principles

The design philosophy behind our component patterns. Read this before the
implementation-focused standards (`drawer-pattern.md`) — it explains _why_ those patterns
exist.

Adapted from the same standard in Lee's `wrcs/reactwrcs` project, where these principles
emerged from iterating through grid → tabs → modals → grid+drawer during 2025–2026. They
align with patterns used in Linear, Supabase, Retool, and other modern tools. Where this
document differs from the original, it is because Achieve Planner's model differs — see
**Tabs** below.

## Core Principles

- **Context preservation** — never hide the outline unless absolutely necessary. It is the
  user's map of everything they have committed to; losing sight of it is disorienting.
- **Consistency** — the same patterns across every view, and aligned with conventions users
  already know from elsewhere.
- **Clarity over cleverness** — if users have to guess how to do something, the design has
  already failed.
- **Error prevention > error recovery** — make dangerous or irreversible actions hard to do
  by accident.
- **Progressive disclosure** — show only what's needed now; hide complexity until relevant.
- **Immediate, clear feedback** for every action.
- **Keyboard first on desktop, touch-complete on phone** — this app replaces a keyboard-driven
  Windows tool. At `md` and above, anything reachable by mouse should be reachable by key, and
  the primary workflows should be faster by keyboard than by mouse. Below `md` that inverts:
  every action must have a visible, tappable path, because there is no keyboard, no hover and
  no right button. Neither half is optional — a shortcut with no button fails on the phone, and
  a button with no shortcut fails at the desk. See `responsive.md`.
- **Accessibility is not a goal here** — one user, no screen reader, not public. Skip ARIA
  coverage, contrast ratios and screen-reader testing; add them if this is ever released.
  Keep the handful of roles and labels that are load-bearing for other reasons (see
  `modal-pattern.md`) — they are wiring, not compliance.
  **Hit-target size and touch-reachability are not covered by this exemption.** A 44px tap
  target and a tappable path to every command are usability for the one user we have, on the
  phone he actually owns — not compliance for a hypothetical audience.
- **Performance is UX** — slow expand/collapse or heavy re-renders destroy usability in a
  dense grid.
- **Forgiveness & safety** — let users recover easily; never force inaccurate data entry.

## Layout & Navigation

### Getting between views, and finding commands

A collapsible **sidebar** for where you can go; a **menu bar** (File leftmost) as the
complete catalog of what you can do; an **icon row** for the handful of commands used most
sessions; a pinnable **Commands panel** as that same tree left open; a `⌘K` **palette** as
the searchable overlay (plus Go-to). Below `md`, **`⋯` is the menu bar**. Views and
commands each live in exactly one registry. Full rules, including why a command without a
menu row is not shipped: **`navigation.md`**.

### Grid + drawer is the default

The **outline grid + right-sliding drawer** is the standard pattern for list + form work
(see `drawer-pattern.md`):

- **Grid** for scanning, filtering, reordering, and fast inline edits
- **Drawer** for the full record — the grid stays visible, preserving context

Below `md` this becomes **list + full-screen sheet**. Context preservation is the principle the
drawer serves, and on a 390px screen it is unaffordable — there is no room to keep the grid
visible and still show a form worth filling in. The compact layout gives up that principle
knowingly, in the one place where the alternative is worse. Everything else on this page still
applies. See `responsive.md`.

### Inline editing for grid-visible fields

Fields that appear as grid columns — name, priority, effort, deadline, state, focus — are
edited **in place**. Opening a drawer to change a priority would be absurd. The drawer is
for the fields that don't fit on a row.

Where a value is a rollup of its descendants (a parent's effort), the cell is **read-only**.
Never offer an editor whose result would be invisible behind a computed value.

### Sorted grids: do not move the world while the user is still typing

**Context preservation applies inside a grid row too.** If the user is mid-edit, the row
must stay put. Re-sorting (or re-filtering) the moment a sort-key column changes under the
cursor is classic poor UX: they lose their place, can't finish the value, and the interface
feels hostile.

Rules:

1. **Commit on finish, not on every intermediate change.**  
   Buffer the editor in local state. Write to the model on **blur**, **Enter**, or an
   explicit Accept — not on each keystroke and not on each partial date-picker step.
2. **Defer re-sort until the edit session ends.**  
   While any cell in the sorted grid (or tracking table) has focus, freeze the on-screen
   row order. After focus leaves the grid, re-apply sort. Optional later polish: animate
   the row to its new place or offer a manual “Re-sort” control; never jump mid-edit.
3. **Date pickers: month/year navigation is not a commit.**  
   Changing month or year is exploratory. Only a complete day selection, Accept, or blur
   of a finished value should update storage. With native `type="date"`, treat `onChange`
   as draft-only and commit on blur — do not fire a server write that reloads and re-sorts
   the list while the calendar is still open.
4. **Same for other multi-step editors** (decimal fields, composite values): draft locally,
   commit when the user is done (see Metric tracking value/date cells).

| Action while editing a sorted column | Good                                    | Bad                                   |
| ------------------------------------ | --------------------------------------- | ------------------------------------- |
| Open date picker / change month      | Calendar navigates; no write; row stays | Picker closes, value saves, row jumps |
| Key into a value cell                | Local draft only                        | Every keystroke re-sorts              |
| Blur / Enter after a real change     | Commit, then re-sort when focus leaves  | Already sorted three steps ago        |

This is the same principle as the drawer: **do not hide or rearrange the user's map while
they are working on a piece of it.**

### Avoid modals for routine editing

Modals hide context, increase cognitive load, and feel interruptive. Reserve them for:

- **Destructive confirmations** — "Delete this project and everything under it?"
- **Critical blocking actions** where the user _must_ decide before continuing
- **Fast capture** — a transient, keyboard-invoked surface that owns no record

Never use a modal for a standard create/edit flow.

#### The capture exception

Quick capture (`QuickCaptureDialog`) is a modal on what looks like a create flow, and is
still right. The discriminator is **whether context preservation is wanted**:

|                      | Standard create/edit | Fast capture            |
| -------------------- | -------------------- | ----------------------- |
| Purpose              | Full record editing  | Get it out of your head |
| Context preservation | High                 | **Low, intentionally**  |
| Bound to a record    | Yes                  | No — nothing exists yet |
| Bulk / freeform text | No                   | Yes                     |
| Pattern              | Drawer               | Modal                   |

The rule protects your view of the outline while you work _on_ something in it. During
capture the outline is irrelevant by definition — the thought arrived from somewhere else,
and the faster the app gets out of the way the better it has done its job. A drawer would
also be slower to open, slower to dismiss, and would imply a record relationship that does
not exist.

**This does not license** a modal for anything with an id: editing a node, a note, or an
appointment stays in a drawer. If you would return to it and edit it again, it is not
capture. Keep a capture surface extremely lean, so it reads as a tool rather than a form.

**This is the main place we depart from Achieve Planner.** Achieve opens a modal for
everything, and routinely opens modals on top of modals. That is the part of its design
worth leaving behind — the workflow it encodes is excellent; the containers it uses are not.

`ConfirmDialog` in `src/components/detail/` serves the first two cases — the outline's delete
flow and the drawer's unsaved-changes prompt; use it rather than `window.confirm`. Every
centered dialog, including those, is built on `ModalShell`. See `modal-pattern.md`.

The stacked-modal rule bites hardest in the repeating lists inside a detail form — Achieve
opens a second modal to edit an Objective or a Risk. We expand the row in place instead
(`ItemList`).

### Tabs organise sections within a form

Tabs are the **correct** pattern for grouping sections of a complex record form, and this
app uses them exactly as Achieve does — a Project or Result Area opens with its fields
grouped across several tabs.

The original version of this standard argued against tabs. That argument was aimed at using
tabs to represent **individual data items** — one tab per record — which was a quirk of that
app's earlier design and is not something we do. It was never an argument against tabs as a
way to organise sections of a single form.

The distinction that matters:

| Tabs for…                     | Verdict                             |
| ----------------------------- | ----------------------------------- |
| Sections of one record's form | **Correct.** Use them.              |
| One tab per data item         | Wrong. That's what the grid is for. |

## Editing Triggers

Prefer explicit, discoverable actions over hidden gestures, and standardise whichever
trigger is chosen across every view — users should never have to relearn how to open a
record.

The bindings, which every view must match:

| Gesture                  | Opens                                          |
| ------------------------ | ---------------------------------------------- |
| `Enter`, or double-click | The full record, in a drawer — as Achieve does |
| `F2`                     | Inline name editing, the Windows convention    |

Both also appear as toolbar buttons, and the selected row carries a small open-record
affordance — a gesture nobody can see is not a discoverable action.

Below `md`, **single tap** opens the record and **long press** opens the row menu. Double-click
and right-click do not exist on touch, so these are translations of the same bindings rather
than a second set to learn. `F2` has no compact equivalent — inline rename happens in the
sheet. See `responsive.md`.

### Icon-only controls need a tooltip

A control whose visible content is only a glyph (`‹ ›`, `×`, a chevron, a colour swatch, a
toolbar icon) must have a `title`. The glyph is not a label. `aria-label` is not a
substitute — it is not visible on hover, and this app is used with a mouse.

```tsx
<button type="button" title="Previous month" aria-label="Previous month">
  ‹
</button>
```

- `ToolbarIconButton` already requires `title` in its signature. Same rule for pagers, pane
  toggles, close buttons, colour swatches, expand/collapse chevrons, and any other icon-only
  control.
- When the control is disabled, `title` says **why** (`navigation.md`).
- A button that already shows words does not need a tooltip repeating them.

## Forms & Validation

### Minimise required fields

Only hard-require what is genuinely essential. Ask: "can the system function without this
right now?" If yes, make it optional. In this app almost nothing is truly required — a node
needs a type and a place in the tree; even the name can be filled in later.

### Allow partial saves

Let users save incomplete records. Forcing completeness produces junk data, lost work, and
abandonment — people frequently know a task exists before they know how long it will take.

### Use drawers for complex forms

For forms with many fields, conditional sections, or dropdowns needing room to expand, use
the drawer. Never cram them into grid cells.

### Save stays open; leave is separate

A drawer is a workspace, not a one-shot dialog. For structured record forms (node detail,
appointments) without autosave, commit and leave are independent. Use the shared
`DrawerFooter` — never invent a different button set:

```
[ Cancel ]                          [ Save ]   [ Save & Close ]
```

- **Save** (outlined) commits and **stays open**, with "Saved" / "Unsaved changes" feedback
  (⌘/Ctrl+S).
- **Save & Close** (solid primary, rightmost) commits then leaves (⌘/Ctrl+Enter); failed
  saves stay open.
- **Cancel** (ghost, left) / header × / Escape leave the drawer; if dirty, confirm discard.

Do not make a single Save that always closes — that forces reopen thrashing across tabs.
Do not ship only stay-open Save either: finishing an edit then becomes Save + Cancel every
time. Document-like surfaces (notes, session log) **autosave** instead; short nested
sub-editors may treat Save as done (Cancel + Save only). Details live in
`drawer-pattern.md`.

### Inline validation

- Validate **on blur**, not while typing.
- Error messages must be **specific and actionable** — "Effort must look like 2 h, 45 min,
  or 3:45 h", not "Invalid input".
- Clear the error state as soon as the user corrects it.
- Keep **Save** available unless a submit is in progress; show blocking errors on the save
  attempt rather than disabling the button.
- Unparseable input in a grid cell **reverts to the stored value and flags the cell** rather
  than saving something wrong or silently clearing it.
  Validation here is light by design (see partial saves); it is still not a reason to close
  on Save — stay open so a rare failure can be fixed in place.

## Decision Guide

| Question                                                                         | If yes →                                    | If no →                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| Is the field already a grid column?                                              | Edit inline                                 | Drawer                                           |
| Is the value a rollup of descendants?                                            | Read-only                                   | Editable                                         |
| Are there more than 3–4 fields to edit at once?                                  | Drawer (not modal, not inline)              | Inline is fine                                   |
| Does the form have distinct groups of fields?                                    | Tabs within the drawer                      | A single scrolling pane                          |
| Is this destructive or irreversible?                                             | Confirmation dialog                         | Just do it, with clear feedback                  |
| Does it edit a record that already exists?                                       | Drawer, never a modal                       | A modal may be right — see the capture exception |
| Does the user need the outline visible while editing?                            | Drawer                                      | Drawer is still fine                             |
| Is this long-form writing with little to validate?                               | Autosave drawer                             | Explicit Save / Save & Close footer              |
| Is this a short nested "return a value" editor?                                  | Save may close (exception)                  | Save stays open; Save & Close finishes           |
| Is the viewport below `md`?                                                      | List + full-screen sheet                    | Grid + right drawer                              |
| Is the action only reachable by hover / right-click / double-click / a shortcut? | It is broken on touch — add a tappable path | Ship it                                          |
| Does editing this cell change the active sort key?                               | Draft locally; freeze order until blur      | Never live re-sort under the cursor              |
| Is this a multi-step control (date picker, decimal, composite)?                  | Commit on blur / Enter / Accept             | Do not write on intermediate steps               |

---

## components/responsive

# Responsive & Touch

> For the philosophy these rules serve, see `ux-principles.md`. For how the drawer and
> dialogs reshape below `md`, see `drawer-pattern.md` and `modal-pattern.md`.

The app is a desktop instrument first: a dense grid, a right drawer, and a keyboard. It also
has to work on a phone, because `agent-os/product/mission.md` promises "reachable from phone,
tablet, and any OS" and the app is installable as a PWA.

Those two things are not the same layout at two sizes.

## The core rule: adaptive, not shrunken

A 28px row with six columns does not become usable by getting narrower. Below the breakpoint
the app presents **a different information architecture over the same data**:

| Desktop                        | Phone                                   | Why                                                          |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| Grid + right drawer            | List → full-screen sheet                | Context preservation is cheap on 1440px, impossible on 390px |
| Grouped sidebar (collapsible)  | Bottom nav + More sheet                 | A 48px icon rail on a 390px screen is the shrunken answer    |
| `⌘K` command palette           | `⋯` on the view's toolbar               | There is no `⌘K` on touch — see `navigation.md`              |
| Multi-column panes, side rails | One column, segmented control to switch | Horizontal scrolling is a failure state                      |
| Hover reveals, double-click    | Persistent affordances, single tap      | There is no hover on touch                                   |
| Right-click menu               | Long-press menu                         | There is no right button                                     |
| Keyboard shortcuts             | Bottom nav, buttons, a capture FAB      | The keyboard is secondary and covers half the screen         |
| Sticky column headers          | Sticky section headers                  | There are no columns to head                                 |
| Drag to reorder                | An explicit "Move to…" action           | See **Drag is mouse-shaped**, below                          |

If a view cannot be re-thought this way for a reasonable cost, it degrades gracefully — it
scrolls horizontally inside its own container and says so. It does not get squashed.

## One breakpoint carries the weight

**`md` — 48rem / 768px.** Below it is _compact_: phones, and iPad in portrait. At and above it
is _the instrument_: the full grid, the right drawer, the sidebar, the keyboard model.

- Use `md:` for anything structural. `sm:` is for minor reflow inside an already-compact
  layout (a two-up field row becoming one-up).
- **Do not invent per-component breakpoints.** A component that needs its own is usually a
  component that should be branching on `useIsCompact()` instead.
- In JS, branch with `useIsCompact()` (`src/components/shell/useIsCompact.ts`), which reads the
  same 48rem line through `matchMedia`. Never read `window.innerWidth` directly, and never
  branch on a user-agent string.
- The server snapshot of `useIsCompact()` is `false`, so SSR renders the desktop layout and
  hydration swaps. Every page is `force-dynamic`, so there is no cached-HTML mismatch.

## Touch targets

**44 × 44 px minimum** below `md` (Apple HIG). Use `--tap-target` (`2.75rem`), not a
hand-picked height.

The desktop UI is full of controls far below this, and they are correct there — they are simply
not reusable in a compact layout:

| Control                   | Desktop size | Where              |
| ------------------------- | ------------ | ------------------ |
| Grid row                  | 28px         | `--row-height`     |
| Expand / collapse chevron | 16px         | `cells.tsx`        |
| Column filter funnel      | ~10px        | `ColumnHeader.tsx` |
| Column resize handle      | 4 × 16px     | `ColumnHeader.tsx` |
| Focus checkbox            | 14px         | `cells.tsx`        |

Where a compact layout needs the same action, it gets a new control at tap size — it does not
scale the desktop one up by a few pixels.

Spacing matters as much as size: two 44px targets touching each other still produce mis-taps.
Leave real gaps between adjacent interactive elements in a list.

## The 16px input rule

**Every focusable `input`, `select` and `textarea` renders at ≥16px below `md`.** This is not a
typography preference. iOS Safari zooms the viewport when you focus a control smaller than
16px, and it does not zoom back out when you blur — one tap on a 13px cell editor and the rest
of the session is scrolled sideways.

The app's base size is `text-[0.8125rem]` (13px), so this is handled centrally in
`globals.css` rather than per component:

```css
@media (max-width: 47.999rem) {
  input,
  select,
  textarea {
    font-size: 1rem;
  }
}
```

Do not override it back down with a utility class on an individual field.

Body copy should be ≥16px on phone for the same readability reason, but that one is a
preference; the input rule is a hard constraint.

## Safe areas and the viewport

The iPhone has a notch/Dynamic Island at the top and a home indicator at the bottom, and in an
installed PWA there is no browser chrome absorbing them.

- `viewport-fit=cover` is set once, in the `viewport` export in `src/app/layout.tsx`. Never add
  a raw `<meta name="viewport">` — Next owns that tag.
- Anything pinned to a viewport edge (the bottom nav, a sticky drawer footer, a compact header)
  pads with the `.pt-safe` / `.pb-safe` / `.px-safe` utilities in `globals.css`. Do not write
  `env(safe-area-inset-*)` inline; a value that appears in three files will drift in two.
- **Never `100vh`.** iOS reports the _large_ viewport for `vh`, so a `100vh` element sits partly
  under Safari's toolbars. Use `dvh` (or `svh` where content must never be clipped).
- The shell keeps `body { overflow: hidden }` and the `h-full` flex chain
  (`html` → `body` → page → `min-h-0 flex-1 overflow-auto` scroller). The scroll container is
  always an inner element, never the page. Add `overscroll-behavior: none` on the shell so a
  scroll that reaches the end does not rubber-band the whole app.
- The soft keyboard is handled by `interactiveWidget: "resizes-content"`, which shrinks the
  layout viewport so a sticky footer stays above the keyboard. Reach for `visualViewport` only
  if a specific surface still misbehaves.

## Touch gestures

| Gesture        | Meaning below `md`                                       | Desktop equivalent |
| -------------- | -------------------------------------------------------- | ------------------ |
| Single tap     | Open the record                                          | Double-click       |
| Long press     | Row context menu, as a bottom sheet                      | Right-click        |
| Swipe on a row | One action per direction — right completes, left deletes | (none)             |

Rules:

- **The row menu really is a sheet.** Pinned to the bottom edge, full width, capped at `85dvh`
  with `pb-safe`, behind a tappable backdrop, rows at `min-h-tap`. The press coordinates are
  deliberately ignored: opening at the press point puts the menu under the thumb that opened it,
  and a long menu opens off the top of the screen. `ContextMenu` branches on `useIsCompact` and
  writes this shape itself rather than borrowing `ModalShell`, because it owns its own Escape
  (which backs out one level) and its own focus.
- **A submenu drills in, it does not fly out.** There is nowhere to the side on a 390px screen.
  The open family replaces the list with a `Back` row above it.
- **Nothing is reachable only by hover, only by right-click, only by double-click, or only by a
  keyboard shortcut.** This generalises `modal-pattern.md`'s "a visible button always
  accompanies a keyboard shortcut." Before shipping a compact layout, list every action the
  desktop view offers and confirm each has a tappable path. The commands most likely to be
  missed are the ones that exist _only_ in a right-click menu.
- **A swipe either does something reversible, or it opens the confirmation the menu would.**
  Complete, reschedule and archive fire on release. Delete does not: `deleteNodeAction` is a
  hard delete that takes the whole branch, so the gesture raises the same `ConfirmDialog`, with
  the same child-count warning, that the row menu's Delete raises. Nothing fires irreversibly
  on release, and no gesture gets a shorter, gentler confirmation than the menu path to the
  same mutation.
- **Right completes, left deletes**, on every list that offers both. Reminders, Todoist and
  TickTick all put complete on the right; a view that inverts it to be clever is fighting
  muscle memory built somewhere else on the same phone.
- **A swipe is aimed at one row.** Build the gesture for the row under the finger, never for
  the selection — a multi-select left over from an earlier tap must not widen what a
  one-finger gesture does. Plural verbs belong on long press, where the menu can say how many.
- **A swipe must not fight the scroll.** Lock to the horizontal axis only after the pointer has
  moved further horizontally than vertically past a threshold; until then, let the list scroll.
  An exact diagonal goes to the list: a crooked scroll is far more common than an aimed swipe,
  and stealing a scroll is the worse failure.
- **The rail says what will happen, three ways.** Colour for which half of the vocabulary,
  a glyph for which verb, and the word itself — colour alone fails anyone who cannot separate
  the hues, and a glyph alone assumes it has been learned. It is legible from the first pixel
  of travel, not faded in; what ramps with the gesture is the content, which can afford to be
  faint, not the background it sits on.
- **The threshold is felt.** A short `navigator.vibrate` on the arming edge, in both
  directions, via `src/lib/touch/haptics.ts`. There is no hover and no cursor on a phone, so
  without it the only way to know a swipe has gone far enough is to watch the rail instead of
  the row. iOS implements no `vibrate`; that is a silent no-op, not a reason to skip it.
- **The row tracks the finger, then resists.** 1:1 up to the trigger — inside that range the
  gesture is still a question — then rubber-banded towards a ceiling it never reaches. A row
  that stops dead under a finger that is still moving reads as a broken page.
- Long-press and swipe thresholds are **pure logic and live in `src/lib/touch/`** with tests
  (`development/testing.md`) — an off-by-one in a slop threshold is invisible until it is
  infuriating.
- **Wire the gesture once, at the capabilities layer**, the way `rowMenuFor` is
  (`src/components/grid/rowSwipe.ts`). Six hosts hand-wiring their own swipes drift apart the
  way eight hand-written context menus did, and a wrong swipe is worse than a wrong menu row:
  there is no label to read before you commit.

### Drag is mouse-shaped

HTML5 drag-and-drop is the reorder mechanism on desktop, and `DataGrid` arms `draggable` on
`onMouseDown` so a drag does not steal text selection inside cell editors. `onMouseDown` does
not reliably precede a touch drag, so **drag-to-reorder is disabled below `md`**, deliberately.

Any ranking or reparenting that drag provides on desktop must also exist as an explicit command
in the long-press menu ("Move to A/B/C/D", "Move up", "Indent"). Do not add a touch-drag
polyfill to preserve the gesture; add the command.

## Dark mode

Dark mode is first-class and stays driven by `prefers-color-scheme` in `globals.css`. There is
no theme toggle and no `data-theme` attribute; adding one is a product decision, not a styling
one.

Every new surface is checked in both schemes. Hard-coded light values exist today — the
`.schedule-calendar` gold column headers and white event cards — and they are a known,
contained exception, not a pattern to copy.

## Overflow

The page body never scrolls horizontally. Wide content — a data grid, a wide table, a code
block, a 7-day calendar — scrolls **inside its own `overflow-x: auto` container**. A view that
genuinely cannot work narrow says so in one line rather than silently clipping.

## Verification checklist

There are no component tests (`development/testing.md`), so this is the gate. Check any surface
you touched at **390 × 844** (iPhone 12) before calling it done:

1. No horizontal scroll on the page body, in portrait and landscape.
2. Tap every interactive element — none below 44px, none needing a second precise tap.
3. **Focus a text input and confirm the page does not zoom.**
4. Open the soft keyboard: sticky footers and add-rows stay above it.
5. Bottom-pinned chrome clears the home indicator; top chrome clears the notch.
6. Every desktop action on the view has a tap path (walk the right-click and shortcut lists).
7. Both colour schemes.
8. The installed PWA, not just Safari — standalone has no browser chrome to hide behind.
9. **Then re-check the view at 1280 × 800.** Compact work regresses desktop density more often
   than the reverse.
