# Standards for Commitments

**Status: active**

The following standards apply to this work. Full content, copied so this folder stays a
self-contained record of what governed the work at the time.

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

## components/data-grid

# Data Grid

How every list in this app works. Read `ux-principles.md` first — this is the grid-specific
application of it.

There is **one** grid: `src/components/grid/DataGrid.tsx`, driven by `ColumnDef[]` and a
persisted `GridState` (`useGridState`), with its controls assembled by `GridToolbar`. The
Outline, Projects, Tasks, Goals, Wish List, Notes, Task Chooser and the Day list are all the
same component. A new list is a column array and a row slice, not a new grid.

## The one rule everything else serves

**Hierarchy survives every operation.** Sorting, filtering, searching and grouping change
_which_ rows you see and _in what order siblings appear_ — never who a row's parent is.

- **Sort reorders siblings only.** A sub-project never floats above its parent because its
  priority is higher; its subtree travels with it. `src/lib/grid/sortRows.ts` owns this and
  its two invariants are stated at the top of that file. Multi-column sort does not weaken
  them: extra keys refine how two _siblings_ compare and cannot change who is a sibling.
- **Group headers stay put** and never absorb rows from a neighbouring group.
- **Filtering keeps the shape.** A group header whose rows have all been filtered out is
  dropped; one that survives **restates its count** to the number actually under it. A
  header reading "Career (7)" above one visible row is a claim the user can see is false.
- **A surviving row brings its ancestors with it** (`lib/grid/ancestors.ts`), so a matching
  task is never left indented three levels under nothing. This applies to the column
  funnels, the advanced filter and the search box alike, and it is what makes filtering by
  type behave the way Achieve does. Ancestors count as shown — `Showing N of M` is the
  number of rows you can count on screen, not the number that matched.

### Filtering is not flattening

Two different questions, and conflating them is what made the Outline's old type checkboxes
wrong in both directions:

| Question                                | Control                                     | Behaviour                                                          |
| --------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| "Which rows do I want to look at?"      | Column filter / search                      | Matches keep their ancestors; the shape is preserved               |
| "Stop organising my work by this level" | Outline's `Areas` / `Goals/Dreams` switches | The level is dissolved and its children **rise** to take its place |

`lib/tree/flattenLevels.ts` owns the second. It re-depths survivors from their surviving
ancestry rather than subtracting a constant, because how many hidden levels a row sat under
varies branch to branch. The tree is untouched — this is a view, and switching the level back
on restores every row.

Only organising levels are flattenable. Projects are what tasks belong to and tasks nest
arbitrarily, so "flatten tasks" has no level to remove; a flat task list is the Tasks tab.

**Never filter a tree by dropping a node's subtree with it.** That is the inverse mistake
and it hides work you explicitly asked to see: the Outline once filtered type and focus that
way, so unticking "Result Areas" emptied the entire grid and a focused task under an
unfocused project disappeared. The one place it is correct is `showCompleted`, because
settling a project genuinely settles the work beneath it — and that is a pre-grid reshape of
the tree, not a column filter.

This is the reason we did not adopt a grid library. See "Why hand-rolled" below.

## Drag-to-reorder is a feature, not a fallback

Dragging a row is how work gets prioritised here, and dropping renumbers priority letter and
rank among the destination parent's children (`useTreeRowDrag`, `lib/tree/outlinePriority`).

- Drag is **compatible with a priority sort** and cleared by any other, because any other
  sort would immediately move the row away from where it was just dropped. Say so on screen
  rather than silently refusing.
- Drag is **desktop-only**. Below `md` the equivalent lives in the long-press menu — see
  `responsive.md`. Never make drag the only path to an outcome.
- **Dragging a column header reorders columns**, and is the one configuration gesture that
  earns its place: it starts on the header label, not on a row, so it cannot be confused
  with a row drag, and its outcome is also on the column menu as Move left / Move right.
  The header row accepts a drop only while a header drag is in flight, so a row dragged
  over it gets the browser's no-drop cursor rather than looking like a column move.
- Do **not** overload the gesture any further. A drag-a-column-header-into-a-zone Group By
  panel (AG Grid's pattern) is still out: it gives one gesture two meanings depending on
  where you let go, and grouping is a toolbar picker here for exactly that reason.

## Grouping

- **Up to three levels**, chosen from progressive `Group by` / `then by` selects that appear
  as the level above them is filled. A dimension appears once — choosing one already in use
  moves it rather than nesting it inside itself. Clearing a level truncates the ones below,
  because there is nothing left for them to sit under. Rules live in `setGroupLevel`.
- **A tab's default arrangement is its default `groupBy`, never a separate toggle.** Projects
  opens on Category → Result Area; that used to be a `Groups` switch beside the picker, which
  meant `Group by → (None)` still showed headers. One control per thing, and the control
  shows the current state.
- This is why `groupBy` is `string[] | null`: null follows the tab's default, `[]` is the
  user having turned grouping off. Same distinction as `order`, and for the same reason.
- **Notes has two mutually exclusive hierarchies.** Its real parent/child tree is Nested
  mode; column-value grouping is a display hierarchy over Flat mode. Choosing any group
  switches to Flat, and choosing Nested clears grouping. Calendar dimensions run newest
  first; categorical dimensions run alphabetically; empty buckets come last. Grouping
  therefore never rewrites or visually competes with stored note ancestry.

## Inherited values are computed once, in `derive`

A value a row gets from its ancestry — L.A.P., shelving, category — is computed **once** in
`src/lib/tree/derive.ts` as a memoized walk up the tree, and exposed as a field on
`OutlineNode`. Never re-derive one at the point of use.

The rule is written against the **field**, not the type: category is set only on Result
Areas in practice, but `effectiveCategory` takes the nearest self-or-ancestor carrying one
whatever its type. Special-casing by type is how a value ends up meaning one thing to the
grouping code and another to the column.

**An inherited value that can be grouped by must also be a column.** Grouping by something
the grid cannot show is a header the user cannot account for — they can see the sections but
not the value that made them, cannot filter by it, and cannot sort by it. Category was in
exactly that state before it became a column.

## Filtering, searching and grouping act on _defined_ columns, not visible ones

Show Fields hides a column. It does not un-ask the question you asked about it.

- `DataGrid` takes both `columns` (visible, get a track and a cell) and `allColumns`
  (everything the tab defines). Filters, the advanced builder, quick search and the value
  pickers all evaluate against `allColumns`.
- A filter naming a column that **no longer exists** is **inert**, never failing. Treating a
  missing column as a blank cell empties the grid with nothing on screen to explain it —
  the exact bug this rule was written after. Same posture as `useGridState`'s degradation of
  a stale column `order`.
- **Sort is the exception**: sort keys resolve against the _visible_ columns. A filter on a
  hidden column is legible from its chip; a sort on one is a grid that has silently
  rearranged itself.

## A parent's state is a claim about the work beneath it

Settling a node settles the open work under it; re-opening one re-opens the settled nodes
above it, as `in_progress` — something under it _has_ been done. `lib/tree/completionCascade.ts`
owns the rule; `setState` runs it in one transaction so a branch is never half-settled, and
`useStateChange` repeats it locally so the other rows move on the same frame.

- **Completed and cancelled are interchangeably settled.** Achieve reopens a completed parent
  when a child is cancelled but does not complete a cancelled child when the parent completes;
  one rule that treats both as "not coming back" is easier to hold than two that disagree.
- **Re-opening never cascades downward.** Re-opening a project must not undo twenty tasks that
  really were finished.
- **That asymmetry is why settling asks first** — and only when it would settle _open_
  descendants, naming the count. A leaf task, or a project whose work is already done, goes
  straight through. This is not Achieve's confirm-on-every-tick.
- **Cascade from the state the node ended up in, not the one requested.** Completing a
  repeating task steps it to the next occurrence and resets its subtree; reading the request
  would settle the children that were just cleared for the next round.

**This is why there is no "Show completed" toggle.** A finished branch is now settled all the
way down, so an ordinary State column filter removes it — visible as a chip, clearable with
everything else, no special case in the row walk.

## The column menu is where everything that acts on a column lives

Every header cell carries one `▾` button (`ColumnMenu.tsx`) opening a **tabbed** popover:
**Filter** (the funnel described below) and **Menu** (sort, layout, and the grid-wide column
dialogs). Right-clicking anywhere on a header cell opens the same menu, the way a Windows
list header does.

The problem it solves is that the controls used to be grouped by _mechanism_ rather than by
_target_: sort was a click on the label, filter was a funnel, hiding and reordering were in a
toolbar dialog, and resetting a width was a double-click on a handle you could not see.
Knowing what you wanted to do told you nothing about where to do it.

- **One button, not two.** A separate funnel and menu do not fit beside a label in a 48px
  header cell (Priority, Icon). Tabs are how AG Grid and MUI X solve the same problem.
- **The Filter tab opens by default on any column that has one**, so the button costs
  exactly what the funnel cost on the path taken most. Everything else is one tab away
  rather than somewhere else entirely.
- **Items are disabled, not omitted**, with a `title` saying why — "This column cannot be
  hidden" is the difference between an unavailable control and a broken one. Same posture as
  `(Select all)` when nothing is filtered. The rules are pure and tested in
  `lib/grid/columnMenu.ts`; the component asks and renders, and never re-derives one.
- **The menu tab must never scroll.** A menu whose last two items are below a fold looks like
  a menu that does not have them. Only the filter's value list scrolls.
- **The gestures on the header are shortcuts to menu items, never the only path.** Click to
  sort, Shift-click to add a key, drag to reorder, double-click the handle to reset a width —
  each also appears in the menu, which is where the keyboard and the un-initiated find it.
- Grid-wide entries (`Show fields…`, `Reset columns`) repeat what the toolbar offers **on
  purpose**. That repetition is the feature; it is what stops the menu from being a partial
  answer that sends you to the toolbar anyway.

`DataGrid` receives the layout commands as one `columnControls` bundle (`ColumnControls`,
returned ready-made by `useGridState`) rather than six props at eight call sites. A grid that
cannot persist a column layout should not be able to offer half a menu — omit the bundle and
those items are visibly unavailable.

## One type glyph per row, and the column set decides where it goes

The row's type is available as two columns rendering the same value, and **only one of them
ever draws the glyph**:

| Column          | Field list  | Shows                                | Use it to                     |
| --------------- | ----------- | ------------------------------------ | ----------------------------- |
| `icon` (3rem)   | `Type icon` | The glyph, in a column of its own    | Reproduce Achieve's layout    |
| `type` (5.5rem) | `Type name` | `Result Area` / `Goal` / `Dream` / … | Filter, sort or group by type |

By default the glyph sits in the Name cell, after the indentation, where it names the thing
you are reading — this is a deliberate departure from Achieve, which puts icons in a flat
column and leaves the tree as bare text. Showing the `icon` column moves it there instead
(`NameIconContext`), so the two can never both draw it; hiding the column hands it back.
That makes `icon` a **placement choice**, not a duplicate.

`type` exists so filtering by type never costs you the icon beside the name. It sorts in
hierarchy order rather than alphabetically — a Task filed above a Result Area is backwards
for a column whose subject is the levels of the tree.

**A grid-wide fact belongs in a context, not in `ColumnDef`.** The Name cell has no business
knowing which other columns are on screen, and threading it through every tab's column
context would make eight files care about a question only `DataGrid` can answer.

## Next actions is a switch, not a view

Achieve's simple **Next Action Only** list keeps every summary row and, among sibling
_leaves_, only the first one still open (`lib/tree/nextActions.ts`). Planning a project as six
ordered steps is good practice; being shown all six while picking what to do next is not.

It is a **switch on the Tasks tab and on the Task Chooser**, not a property of a view. A view
should be a collection of settings you could have reached one at a time — the moment it also
carries a setting available nowhere else, picking the view is the only way to get the
behaviour and you cannot combine it with anything.

Two rules the implementation depends on:

- **Judge leaf-ness inside the list you were given**, not from `hasChildren`. A task whose
  subtasks this view filters out is a leaf _here_; otherwise a view can show a summary with
  nothing under it and call it a next action.
- **Group siblings by real `parentId`, not row depth.** Tasks re-bases depth so every task
  looks top-level; grouping by depth would leave one next action for the whole tab.

The Task Chooser keeps its own rule (`lib/chooser/views.ts`, manual §8.3): it is a flat scored
list with no hierarchy, so "first leaf sibling" has nothing to mean there. Same question,
different shape — which is why they are two functions and not one with a flag.

## A view is a collection of settings, never a mode

Every `View` picker entry is a set of **ordinary stored values** — column layout, grouping,
and filters — that the user could have reached one at a time. "Active Tasks" is a State filter
you can see in the chip bar, remove, and combine with anything; it is not a hidden row
predicate inside `sliceTree`.

The test: **if picking the view is the only way to get some behaviour, it is a mode.** A mode
cannot be combined, cannot be inspected, and can only be described by its own name.

- `keep` stays **structural only** — "this tab shows tasks". Which _states_ a view shows is
  its default filter (`lib/grid/stateFilters.ts` builds them the shape the funnel writes, so
  the funnel opens with the right boxes already unticked).
- **`GridSettings.filters` is nullable, and the three states are distinct**: `null` follows
  the view's defaults, `{}` is the user having cleared everything, and a map is their
  choice. Without that distinction a view could only have defaults that were impossible to
  turn off — clearing them would last until the next render. Same contract as `order` and
  `groupBy`, and `parseGridSettings` carries the v1 migration for it.
- **`Clear all` clears to nothing; `Reset this grid` restores the view's defaults.** Two
  different questions, two different controls.
- A default filter is **indistinguishable from one the user set**, on purpose: same chip,
  same funnel state, same `Clear all`. That is what makes it a setting rather than a mode.

### Saved views

Because a view is only stored settings, **saving one is copying a handful of values and giving
them a name** — which is why the "we deliberately do not do user-saved views" line is gone. Its
own condition was _revisit when the presets demonstrably do not cover it_, and the answer turned
out not to be a new feature at all.

**Every main grid has them**, through one hook: `useModuleViews`. A module declares its
built-in views, which one it opens on, and what each of those defaults to; the hook owns the
sequence — catalogue, allow-list, selection, grid state — whose **order is load-bearing**
(`useSavedViews` before `useTabView`, or every saved id is rejected as illegal and the module
silently falls back to its default). Passing its return value to `GridToolbar`'s `views` prop
is the whole integration.

- The **catalogue** lives in `views:{tabId}`. The live grid is one **working copy** per
  module (`grid:{moduleId}`). Named views are snapshots; tweaks auto-persist only to the
  working copy. The picker **stays on the named view**. When the working copy diverges,
  **Unsaved changes** appears. `Reset this grid` reloads the active definition.
- A saved view captures **everything customizable on the grid**: order, widths, column
  filters, the advanced filter, search, sort, grouping, collapsed groups, density and switch
  positions. Fields that already distinguish "not chosen" from "chosen" (nullable in
  `grid.ts`) use that; switches need no such distinction because each is its own key —
  `resolveSwitches` falls back per id (stored → view → the tab's `defaultOn`). Sort, density,
  search, widths and collapsed groups gained the same null-follows-view contract (settings
  version 3) so Reset can restore them. What stays out on purpose: `includeDeferred` (tab-
  wide) and which view is selected. Loading a definition is `clearViewState`, never a scope
  reset: the same row holds `view` and `includeDeferred`, and clearing those would forget
  which view you had just switched to.
- **The pair is Save and Save as, and they mean what they mean in a document.** Save writes
  the working copy over the _active_ saved view (disabled on a built-in). Save as deep-copies
  the working copy into a new view and switches to it — the source definition is untouched.
  Switching views loads that view's snapshot into the working copy and discards dirty.
  Reload keeps the working copy, so unsaved tweaks survive without writing the named view.
- **A view recording a switch does not make the switch a property of the view.** The rule above
  — a view may not carry behaviour reachable no other way — is intact: every switch stays on
  the toolbar, toggleable and combinable. Only its _position_ travels, as a column's
  visibility does.
- **`base` names the built-in a saved view derives from**, because some modules resolve
  behaviour and not merely defaults from the view id: `chooserView`, `parseChooserSettings` and
  `buildChooserItems` all take a `ChooserViewId`, and `saved-a1b2c3d4` is not one. `base`
  always names a built-in — saving from a saved view follows the chain through, so deleting the
  middle view cannot silently re-base the last.
- **A module's own per-view settings hang off the view id**, rather than living inside the
  view: the Task Chooser's weights in `chooser:{viewId}`, Notes' mode / sort / filter in
  `notes:{viewId}`. Achieve requires this for the Chooser (manual §8.1.4 — _"Other views will
  retain their own unique settings"_). Live extras use the `working` key (`viewScopes`);
  Save and Save as copy that row onto the named view. Deleting a view clears its extras,
  as it always has.
- **Every module's working copy is the bare grid scope** (`grid:{moduleId}`). Leftover
  per-view live rows (`grid:tasks.active-status`) are adopted once into that scope, then
  ignored. `GridSettings.view` names the active view, not a second live overlay.
- Ids are **random, not sequential**. A reissued id would inherit the deleted view's leftover
  scopes. Deleting a view clears them with it.
- Saved ids join the built-ins in `useTabView`'s allow-list, so deleting the view you are on
  falls back instead of stranding the grid.
- **Only the select holds bar width.** Save / Save as / Rename / Delete register as commands
  and live behind `⋯`, per the three-tier table below. The three that act on the selected
  view are **disabled, not absent**, on a built-in: a built-in is not yours to change, and a
  command that vanishes teaches you it does not exist. Save needs its own feedback — it
  writes what is already on screen, so nothing visibly happens. Unsaved changes is the
  dirty mark.

### The chip bar accounts for missing rows, not for stored state

Two rules follow, both of which the state filters made visible:

- A set filter stores what is **ticked**, so hiding two of nine states is stored as seven ids.
  Describe it by what is **excluded** when that list is shorter — `State: all but Completed,
Cancelled`, not `State: 7 selected`.
- A filter ticking **every value the column currently holds** draws no chip at all. It is
  hiding nothing, and `Status: 7 selected` beside `Showing 22 of 22` reads as though rows were
  held back. The chip returns the moment a ticked-off value appears in the data.

## Progressive disclosure: three rungs, in this order

| Rung | Control                                                                                                                   | For                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1    | **Quick search** — one box, all columns, case-insensitive substring                                                       | "I know a word that's in it"    |
| 2    | **Column funnel** — set filter over values (most columns), or semantic ranges (priority); plus per-column custom criteria | Focused refinement on one field |
| 3    | **Advanced filter** — And/Or across different columns, including hidden ones                                              | Real Boolean criteria           |

All three compose with **AND**: each answers a different question and a row must satisfy
every question asked. Do not add a fourth rung before the first three are outgrown.

Keep search dumb — substring only, no operators, no field syntax, no regex. Anything more
expressive belongs on rung 3, where the expression stays visible.

### The column funnel is a set filter (with one exception)

Modelled on AG Grid's and Excel's, because that is what people already know. Most columns
get the value checklist; **priority does not** (`usesSetFilter` in `filters.ts`).

**Set-filter columns** (state, enum, text, date, …):

- **The values the column actually holds**, each with the **number of rows** carrying it, so
  you can see what a tick is worth before making it.
- **A search box over the list**, once there are more values than fit at a glance. It
  searches the **label**, not the stored value.
- **`(Select all)`** returns to showing everything. It is checked when the filter is
  inactive, indeterminate otherwise, and disabled when already showing all — a control that
  does nothing on click is worse than one that is visibly unavailable.
- **`only`** on each row narrows to that one value. Without it, isolating one value out of
  thirty means unticking twenty-nine.
- **`(Blanks)`** is an entry in the list, not a separate concept, and is omitted when no row
  is blank.
- Semantic **ranges** (deadline windows) sit below the values under their own divider when
  the kind has them. They describe a range rather than name a value, so they keep plain
  add/remove behaviour.

Two rules the selection model depends on:

- **An empty selection means every entry is ticked**, because nothing is being filtered out.
  Drawing them unticked would say the opposite of what the grid is doing.
- **Ticking the last missing entry collapses back to "unfiltered"**, never to a list naming
  every current value — such a list would silently exclude any value added later.

There is deliberately no "select none": the stored model cannot express "show no rows", and
a control that can put the grid in a state it cannot describe is worse than one without it.
That is what `only` is for.

**Priority is ranges-only.** Rank numbers are open-ended (`A1`…`A99`…), so listing every
used value is noise the presets already cover ("Only As", "As & Bs", ranked,
unprioritized, …). Exact ranks still work via **Custom criteria**. Matching still accepts
stored `value:A1` option ids if an older session saved one; the funnel just no longer
offers them.

### Filter values may be stored and displayed differently

A column filters on whatever its cell shows — the State column stores Achieve's two-letter
codes because that is what a stored filter has to keep matching. `ColumnDef.filterLabel`
maps that to something pickable (`NS` → `Not started`). **Every surface that shows a value
must use it**: the set filter, and the chips. A chip reading `NS` beside a list reading
`Not started` looks like two different filters.

## Filter state is always visible and always clearable

Two of the three controls are invisible the moment their popover closes, so the grid must
say what it is doing:

- A **chip per active condition** (`GridFilterChips`), each removing only its own condition.
- **`Showing N of M`**, where `M` is the count _before_ any narrowing — a fraction whose
  bottom half also moves says nothing about how much has been filtered out. Group headers
  are not counted; they are chrome, not results.
- One **Clear all** that clears column filters, the advanced filter and the search together.
- An empty builder is **inactive**, not "match nothing". A dialog the user opened and left
  empty must never empty the grid.

## Persistence

**Every user-visible grid preference goes into the `grid:{tabId}` scope through the single
`patch` in `useGridState` — never into component `useState`.** Column set / order / widths,
filters, advanced filter, search, sorts, group-by, group collapse, density, sub-view, and
per-tab switches.

**The rule is about the preference, not the hook.** A module that does not use `useGridState`
still owes it: `useSetting` with a codec of its own, in a scope that already belongs to that
module. Every view that escaped this rule escaped it the same way — by not going through
`GridToolbar`, so nobody noticed there was a rule to follow. Metrics kept all five of its
switches in `useState`, the Projects rail all four of its, and the Task Chooser's Date filter
was never in `ChooserSettings` at all; each reset itself on every visit. When adding a key to an
existing scope, parse it with a **per-key fallback** so a blob written before it keeps what it
already holds, and treat `false` as a stored value rather than as absent.

- **One hook owns the whole scope.** A write replaces the scope's value, so two hooks each
  persisting one field would clobber each other — changing a filter would reset the column
  layout. See the header comment on `useGridState.ts`.
- **A view's defaults are `GridDefaults`**, passed to `useGridState` — the order, filters,
  grouping and switch positions a view opens with. Never a hardcoded predicate the user cannot
  see.
- **Per-tab toggles go in the open `switches` map**, declared by the tab as
  `{ id, label, defaultOn }`. A new toggle is one array entry; a removed one leaves a
  harmless orphan key rather than a parse failure. The tab supplies the default, because
  only the tab knows whether off or on is the sane start.
- **Parsing never throws and never strands a tab.** Garbage degrades to the default; a
  shape from an older build is read rather than discarded (`sort` → `sorts`, bare `string[]`
  → options filter). An explicitly empty collection is honoured — "show me nothing" is a
  legal choice.
- Tab-wide settings (`includeDeferred`) keep the **tab** scope; per-view settings keep the
  **view** scope (`grid:tasks.active-status`). Putting a per-view setting on the tab makes
  it fight whichever view you are not looking at.

## Toolbar

**Two rows: verbs above, lens below.**

`GridToolbar` renders both. Row 1 is `CommandBar` — the view's named menus, the handful of
commands promoted to icon buttons, the selection chip, the Commands panel toggle. Row 2 is the
lens: view picker, scope pickers, search, `Filter…`, `Group by`, the tab's switches, density,
with the chip bar under it.

One row held both and the result was a flat run of identically-bordered controls where `New` and
`Rename` sat between `Group by` and `Density` with nothing to say which kind of thing was which.
Zoning a single row does not survive the real width: a view picker, two scope pickers, search,
Filter, two `Group by` levels, switches and density already fill 1280px. ~28px is what the split
costs and a bar you can read in one sweep is what it buys.

Below `md` there is **one** row — the lens, panning sideways, with `⋯` pinned outside the
scroller. The verbs are all inside `⋯` there (`responsive.md`).

A tab supplies only what is its own: `commandCapabilities` (what can be done to a row),
`views`, `left` (scope pickers) and `right`.

A tab declares **what it has** — columns, switches, group dimensions, command capabilities. It
does not assemble buttons, and it does not decide which surface a command appears on: the command
declares its own `menu` / `section` / `icon` / `toolbar` / `rowMenu` and every surface reads that.
If you find yourself adding a control to one grid, add it to `GridToolbar` instead and let every
grid have it.

### What the grid hands back

Three callbacks, and the third is the one that is easy to get wrong:

| Callback               | Reports                                                  |
| ---------------------- | -------------------------------------------------------- |
| `onCountsChange`       | "Showing N of M", counted before grouping hides anything |
| `onGroupIdsChange`     | The group headers, for Collapse all                      |
| `onNavigableIdsChange` | **The node ids actually on screen**, in screen order     |

A host must not derive that third list itself. The rows it passes _in_ are the list before this
grid applies the column filters, the advanced filter, the search, the **multi-column sort** and
**group collapse** — and the Outline's default view hides completed work, so stepping through the
host's own list walks rows that are not there. Sort is the one that catches people out: it removes
nothing, so the two lists stay the same length and only the order is wrong.

Every host that keeps a selection reads this one instead, through **`useNavigableIds`**, which
holds the reported list and falls back to the host's own ids for the first render. Do not inline
that fallback: it builds a fresh array, and everything downstream keys off its identity, so an
unmemoised order rebuilds every callback closing over it — which is how registering a command
turned into a re-render loop once already.

This is not cosmetic. `useMultiSelect` prunes ids that leave the list, so a selection built against
the wrong order both highlights the wrong rows _and_ keeps rows the user cannot see. The toolbar
then says `3 selected` over one highlighted row, and `Delete (3)` means it.

**A surface that is not a `DataGrid` owes the same guarantee**: navigate the list you _render_.
`MetricsView` renders its grouped list and stepped through the ungrouped one, so on the bottom row
`ArrowDown` jumped to the top of the table.

### `rowMenu` takes a nullable row

`rowMenu?: (nodeId: string | null) => MenuItem[]`. `null` is the blank area below the last row, or
a group header — anywhere the pointer is over the grid but not over a record. Return the same menu
with no selection rather than a shorter one; see `navigation.md`.

**And take controls back out again.** A toolbar earns its width; every button on it is one
the user has to read past to find the one they want. Two tests, both of which the grid has
failed at least once:

- **Is it a column filter wearing a checkbox?** The Outline's four type checkboxes and its
  Focus only toggle were, so they went to the `icon` / `type` and `focus` columns. A per-type
  view is what the Projects, Tasks and Goals tabs already are.
- **Are its only two states "unavailable" and "duplicated"?** `Clear filters` was disabled in
  exactly the state where the chip bar is absent, so it could only be pressed while the chip
  bar was on screen offering `Clear all`.
- **Is it an arrangement?** Then it is `groupBy`, never a toggle — the Outline's `By category`
  checkbox was a standing exception to a rule the Projects tab already followed. Folding it in
  cost one click and bought `Collapse all`, which the bespoke toggle never had.

- **Does the tab already have one?** Rename and Open were spelled out identically on four
  tabs; they are commands built from `commandCapabilities` now. `ux-principles.md` requires them
  — `F2` and `Enter` are the real bindings and a shortcut with no button fails whoever does not
  know it — but a tab should declare that it has a selection, not assemble two buttons.
- **Is a second control reporting the same number?** The Task Chooser said `20 of 47` beside
  the chip bar saying `Showing 20 of 20`, because the grid can only count the rows it was
  handed. One count, in the chip bar, with the host passing the real denominator.

Prefer a control that shows its own state to one that needs a label to say what it is:
density is a two-button segmented control (`Roomy` / `Dense`), not a `Density:` select.

### The menu tier

A control that survives those tests but is used **occasionally** does not have to hold width on
every grid on every screen forever. It goes in the menu it belongs to — `Show Fields` and
`Reset this grid` are `View ▸ Layout` — and stays off the icon row.

That demotion used to cost something, because the only tier below the bar was an unsorted `⋯`
list. A _named, sectioned_ menu is findable by reading, so a command in `View ▸ Layout` is one
click away **and** discoverable, which is what makes the tier honest.

Three tiers, and a control belongs in the lowest one that still works. The menu is the
**complete catalog** (`navigation.md`); the bar is a high-frequency subset of it:

| Tier           | Test                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| **On the bar** | Used most sessions. An icon button on the command row, or a widget on the lens row |
| **In a menu**  | Every real command. Occasional ones live _only_ here (`Show Fields`, the zooms)    |
| **Deleted**    | Fails one of the tests above. Palette-only is not a tier.                          |

A menu is not a place to hide things you could not justify. If a control fails the "column filter
wearing a checkbox" or "unavailable or duplicated" test, moving it into a menu does not fix it —
a menu with junk in it is read exactly as carefully as a toolbar with junk on it, which is to say
not at all.

**Commands and view controls go in different rows, always** — not "where a view has many
commands". They answer different questions ("what can I do" vs "what am I looking at") and the
rows are what say so. That rule used to be conditional and the Outline was the only view that
followed it, with a bespoke second bar; it is now `GridToolbar`'s shape for every grid.

Below `md` the toolbar is one horizontally-scrolling row, and dialogs open as sheets — see
`responsive.md`. Tap targets stay 44px; that is not covered by the accessibility exemption
in `ux-principles.md`.

## What we deliberately do not do

| Not doing                     | Why                                                                                                                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Virtualization**            | Personal data volumes. The row layer is CSS grid plus HTML5 drag and would fight a virtualizer for no gain we can currently measure.                                                                                                   |
| **Pagination**                | Same. Pagination also breaks "scroll to the row I was just looking at", which is how these grids are actually used.                                                                                                                    |
| **Server-side sort / filter** | Everything is already in memory from one recursive CTE. Round-tripping a keystroke would be slower, not faster.                                                                                                                        |
| **Aggregation footers**       | The numbers that matter — effort, effort left, % complete — already roll up the _tree_ in `derive.ts`. A second, group-shaped sum of the same field in the same column would be a different number with no way to tell which is which. |
| **Pivoting**                  | No question anyone has asked of this data needs it.                                                                                                                                                                                    |

## Why hand-rolled, and when to revisit

Decided in `specs/2026-07-28-1121-main-grid-tabs`, re-confirmed in
`specs/2026-08-04-0924-grid-control-surface`:

- **AG Grid and MUI X Data Grid** — rejected on licensing. Tree data, row grouping and set
  filters are Pro/Premium/Enterprise in both, which is precisely the feature set wanted.
- **TanStack Table** (MIT, headless, genuinely capable) — rejected because it uses `subRows`
  for **both** tree data (`getSubRows`) and grouping (`getGroupedRowModel`), so the two are
  mutually exclusive. Every grid here needs hierarchy _and_ group headers at once. Its
  sort/filter/visibility state is also in-memory, where ours already persists to Postgres —
  adopting it means writing an adapter to arrive back where we started.

**Revisit when the grid starts accumulating _table_ logic rather than _app_ logic** — a
virtualizer, a pagination model, a server-side query builder. Until then the hand-rolled
grid is smaller than the adapter a library would need.

## Testing

Per `development/testing.md`: the logic lives in `src/lib/grid/**` and `src/lib/tree/**`
with a test beside it, and there are **no React component tests**. The pure modules worth
knowing about:

| Module                          | What it owns                                                 |
| ------------------------------- | ------------------------------------------------------------ |
| `lib/grid/sortRows.ts`          | Hierarchy-preserving multi-key sort                          |
| `lib/grid/columnMenu.ts`        | Which column-menu items are available, and header drag slots |
| `lib/grid/ancestors.ts`         | Ancestor closure that keeps a filtered tree connected        |
| `lib/tree/flattenLevels.ts`     | Dissolving a level and promoting its children                |
| `lib/tree/completionCascade.ts` | Which other nodes a state change moves, and which way        |
| `lib/grid/customFilter.ts`      | Operator vocabulary and per-column expressions               |
| `lib/grid/crossFilter.ts`       | Cross-column And/Or advanced filter                          |
| `lib/grid/search.ts`            | Quick search matching                                        |
| `lib/grid/chips.ts`             | What the chip bar says                                       |
| `lib/grid/distinct.ts`          | Distinct values, shared by funnel and builder                |
| `lib/settings/grid.ts`          | The persisted shape, its defaults and its migrations         |
| `lib/grid/grouping.ts`          | Shared group dimensions and progressive-level state          |
| `lib/tree/slice.ts`             | Outline row slices and tree-tab group headers/counts         |
| `lib/notes/grouping.ts`         | Notes column buckets, ordering, and nested group headers     |

A test earns its place if it would fail on a plausible mistake. The mistakes this area
actually makes are: a filter that silently matches nothing, a sort that lifts a child above
its parent, a count that does not match the rows beside it, and a stored blob that strands a
tab after an upgrade. Test those.

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

## api/agent-tools

# Agent tools

## Routing

- One tool per request: **`POST /api/agent/{tool}`** where `{tool}` is a stable snake_case
  name (`get_context`, `search_nodes`, …).
- Unknown tool → `not_found`.
- Body is the tool's argument object (JSON). No args → `{}`.
- **One write path** — tools call `src/lib/**` mutations/queries only. Do not reimplement
  SQL in the route handler.

## Canonical contract

Define every tool once in a registry containing its name, domain, intent description,
input/output schemas, effects, retry behavior, exposure, and handler. Generate HTTP
discovery, documentation, and future transports from that registry; prose catalogs are not
an independent source of truth.

## Design

1. **Prefer outcomes over endpoint primitives.** Batch repeated approved operations when a
   workflow would otherwise need three or more equivalent calls.
2. **Stable, action-oriented names.** Names are part of the agent contract; rename only
   with a deliberate version or dual-support window.
3. **Descriptions are selection instructions.** Say what the tool does, when to use it,
   when not to use it, its side effects and retry behavior, and what it returns.
4. **Focused exposure.** Keep the default active set small; expose domains on demand and
   identify legacy aliases rather than loading the whole catalog into context.
5. **Summary before detail.** Prefer `get_context`, filtered searches, and compact rows over
   full records. A strict general-purpose escape hatch is allowed when splitting creates
   overlaps or loses necessary full-form capability.
6. **Ids over paths.** Agents mutate UUIDs returned by search/read; human labels are for
   matching and display.
7. **Ask when ambiguous.** If a parent or target is unclear, ask rather than creating or
   changing the most plausible guess.

## Inputs

- The runtime validator and published JSON Schema come from the same strict schema.
- Reject unknown fields. Describe fields and declare required values, enums, defaults,
  nullability, and bounds.
- Prefer flat inputs with roughly eight top-level parameters. Nest only cohesive batches or
  justified full-form escape hatches.
- Validation errors name the field and a correction.

## Outputs

- Return IDs, human labels, and fields needed for the next decision.
- Lists use compact summaries and disclose returned count, total count, and whether more
  results exist. Full prose belongs in a targeted detail tool.
- Never silently truncate or place full prose blobs in summary results.
- Keep the stable HTTP envelope from `api/response-format.md`; tool output schemas describe
  the value under `data`.

## Safety and recovery

- Classify read/write behavior, destructive effects, confirmation needs, and idempotency.
- Enforce a retry guarantee with a natural key or transaction. Never claim retry safety
  across a non-atomic external side effect.
- Preserve user control before destructive or bulk work.
- Foreign rows are never exposed. Missing and foreign identifiers have the same `not_found`
  response shape.

## Testing

- Test registry/schema completeness, unknown-field rejection, HTTP envelopes, user
  isolation, truncation metadata, retry behavior, and documentation generation.
- Exercise representative tasks for selection accuracy, call count, response size, and
  error recovery. Prioritize plausible silent errors over exhaustive happy-path examples.
- Pure argument parsing/filtering → unit tests beside the module.
- Tool functions that touch the database → `*.integration.test.ts` with a second-user case.
- Route handlers remain thin wrappers (auth + dispatch); test both the registry boundary and
  representative HTTP envelopes.
