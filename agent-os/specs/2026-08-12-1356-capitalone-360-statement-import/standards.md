# Standards for Capital One 360 statement PDF import

The following standards apply to this work.

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

| Pitfall                                             | Why it hurts                                | Do instead                           |
| --------------------------------------------------- | ------------------------------------------- | ------------------------------------ |
| `startOfDay` on calendar fields on the server       | Server TZ rewrites the day (Aug 1 → Jul 31) | `asCalendarDay` / `fromDateKey`      |
| Local midnight encoding                             | Client TZ ≠ server TZ                       | `fromDateKey` (UTC noon)             |
| Local getters for stored field keys                 | Off-by-one after evening / SSR              | `toDateKey` (UTC)                    |
| `localDateKey` for stored deadlines                 | Wrong near zone boundaries                  | `toDateKey`                          |
| `toDateKey(new Date())` for picker max / “today” UI | UTC “today” on the server                   | `localDateKey` / `useToday`          |
| Asserting `getHours() === 0` on calendar fields     | Fails; stored as UTC noon                   | `toDateKey` / `getUTCHours() === 12` |

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

## api/response-format

# API response format

All HTTP surfaces under `/api/**` (starting with the agent API) use a single JSON envelope so
clients and coding agents can branch on one field.

## Success

```json
{
  "ok": true,
  "data": {}
}
```

- HTTP status **200** for successful tool calls (including creates).
- `data` is the tool-specific payload. Prefer plain JSON-serializable values: strings, numbers,
  booleans, arrays, objects. Dates are **ISO-8601 strings**.

## Failure

```json
{
  "ok": false,
  "error": {
    "code": "validation",
    "message": "type is required"
  }
}
```

- Always include `code` and a human-readable `message`.
- Do not leak stack traces or internal exception strings that include secrets.

## Content type

- Request bodies: `application/json` (empty object `{}` is fine when a tool has no args).
- Responses: `application/json`.
