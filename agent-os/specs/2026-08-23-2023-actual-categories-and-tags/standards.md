# Standards — Actual Categories and Tags

**Status: active**

The full standards selected during shaping are copied below so this active implementation record is self-contained.

---

## Standard: database/migrations

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

## Standard: development/clean-code

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

## When the model is wrong, change the model

**Prefer the design that is right for the app over the one that is cheap given what exists
today.** When work reveals that the current model is wrong — not merely inconvenient — the
default is to fix the model, including when that means a large migration across several
tables and every reader. "That would touch a lot of files" is a cost to plan around, not a
reason to choose the lesser design.

The tell is a justification that appeals only to the present shape of the code: _the string
is already the join key everywhere_, _those columns already exist_, _the other tables
already assume it_. None of those say the design is right; they say it is entrenched. Weigh
what the app should be in a year, and if today's model is not it, say so plainly and price
the refactor.

**This is not a licence for speculative generality**, and it does not soften the section
above. The distinction is whose problem is being solved:

- **Speculative generality** builds for a caller that does not exist yet. Still forbidden.
- **A model correction** fixes a model that is _already_ wrong for cases that _already_
  exist, and is currently being worked around. That is the one to take.

The practical test: if a workaround is being added because the model cannot express
something true about the data, the model is the bug. Two workarounds for the same missing
concept is the signal — a rule enforced in application code because the schema cannot say
it, a fact recomputed at read time because nothing stores it, a value copied into three
tables because there is no row to point at.

When such a refactor is taken, it gets a spec, and the spec records what was superseded and
why — so the next reader sees a decision, not churn. Large is fine; unexplained is not.

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

## Standard: development/testing

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

## Standard: development/security

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
password from a manager, with Better Auth's public sign-up handler disabled. Database-backed
storage would buy DoS/cost control at the price of a table and a write per auth request on
Neon's free tier.

Invite-gated second users (`specs/2026-08-22-1204-invite-signup`) do **not** by themselves
require that storage: invite tokens are unguessable, `/api/auth/sign-up/email` stays
closed, and `minPasswordLength` stays 16. Revisit when any of these become true: fully
public unauthenticated sign-up, an invite URL posted widely, or a password that is not
from a manager on an account that can reach real data.

`minPasswordLength` is 16 in `src/lib/auth/server.ts` and `src/lib/auth/passwordPolicy.ts`
(imported by provisioning, password change, and the login/signup forms). The shared
constant exists because a script that hashed a 4-character password would write a row
Better Auth then refused to sign in.

## Dependencies

Patch `next` promptly — it is the runtime surface. Dev-only transitives
(`drizzle-kit`, `esbuild`, unused `sharp` via `next/image`) are low priority.
Dependabot (`.github/dependabot.yml`) opens the PRs weekly, grouped by
production/development minor+patch. Majors stay ungrouped so they get read.

## Markdown

`rehype-raw` stays out of `react-markdown`. Notes are a stored-XSS surface if HTML in
a note becomes executable. See `src/components/notes/MarkdownPreviewBody.tsx`.

---

## Standard: components/data-grid

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

Settling a node settles the open work under it; starting or finishing one starts the
not-started nodes above it, as `in_progress`; re-opening one re-opens the settled nodes
above it, as `in_progress` — something under it _has_ begun, or _has_ been done.
`lib/tree/completionCascade.ts` owns the rule; `setState` runs it in one transaction so a
branch is never half-settled, and `useStateChange` repeats it locally so the other rows
move on the same frame.

- **Completed and in progress start not-started ancestors.** Achieve does this on complete
  only; we also do it on In progress, because a parent whose child is underway is no longer
  Not started. Cancel, waiting, postponed and delegated do not — those are not "work has
  begun". A postponed or waiting parent is left alone.
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
- **Tasks also captures the Project picker.** The live value stays in `?scope=` (so
  `View tasks…` is still a plain navigation and reload/Back keep the narrowing). Save
  writes that id into the view; switching back to the view restores it, including All
  Projects as a stored `null`. Built-ins and views saved before this field do not own a
  project — flipping Active Status → All Tasks leaves the picker where it is. A present
  junk id degrades to All Projects rather than failing the catalogue. Projects' and
  Goals' branch pickers stay out of the snapshot until someone asks.
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
- **`Clear filters` is a View / palette command**, not a toolbar button. It is disabled with
  the specific reason when nothing is filtered. On a dual-grid page it exists twice: a
  focused shortcut, and an explicit `Clear filters for [grid name]` — `navigation.md` and
  `src/lib/commands/scope.ts`.
- An empty builder is **inactive**, not "match nothing". A dialog the user opened and left
  empty must never empty the grid.

Lens `Filter…` opens **that** grid's panel. The menu carries the same command as the catalog
path: unscoped on a one-grid page, plus `Filter for [grid name]…` when two grids share the
page. The toolbar button is never the only way in.

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

**Two rows: verbs above, lens below — lens on the data.**

`GridToolbar` renders both. Named menus live in the **shell**, above the page bar
(`navigation.md`) — they are not this component's first row. Row 1 is the page verb row:
the handful of commands promoted to icon buttons, and the selection chip (“what can I do”).
Row 2 is the lens: view picker, scope pickers, search, `Filter…`, `Group by`, the tab's
switches, density, with the chip bar under it (“how am I looking”). The lens belongs to
the **grid**, not to the page chrome, so it is the last thing above the rows. That is
deliberate and not Achieve's Win32 order (toolbar glued to the menu). Do not swap the
rows to restore that, and do not merge them because the desktop app had one strip —
`navigation.md` states when a single strip is allowed.

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

| Tier           | Test                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| **On the bar** | Used most sessions. An icon button on the page verb row, or a widget on the lens row |
| **In a menu**  | Every real command. Occasional ones live _only_ here (`Show Fields`, the zooms)      |
| **Deleted**    | Fails one of the tests above. Palette-only is not a tier.                            |

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

## Standard: components/drawer-pattern

# Form Drawer Pattern

> For why we use drawers instead of modals, see `ux-principles.md`.

Editing a full record uses a **right-sliding drawer**, never a modal and never full-page
navigation. The outline stays visible behind it.

Adapted from the `wrcs/reactwrcs` standard of the same name. That version is written for MUI
and AG Grid (`<Drawer anchor="right">`, `ModalProps`, `sx`, `refreshData`); none of that
applies here. This project is Tailwind, React Server Components, and server actions — so the
**rules** carry over and the code does not.

## Structure

A drawer is a client component holding its own form state, rendered from the page shell:

```tsx
<Drawer open={open} onClose={requestClose} labelledBy="node-form-title">
  {open && node && <NodeForm node={node} onClose={requestClose} />}
</Drawer>
```

## Rules

- **Guard the content**, not the container: `{open && node && ...}`. Never render a form
  before the record it edits is available.
- **Do not unmount the form on close** if the user might reopen it mid-edit. Where state
  must survive, lift it; where it must not, key the form on the node id so switching records
  resets it.
- **Width**: full-width on small screens, capped around `720px` on desktop
  (`w-full sm:w-[90%] md:max-w-[45rem]`).
- **Position beside the app chrome** — the sidebar stays visible and clickable.
- **Below `md` the drawer is a full-screen sheet** at `100dvh` (not `100%` — a fixed parent
  resolves against iOS's large viewport and puts the footer under Safari's toolbar). There is
  no visible backdrop and no chrome behind it to preserve; the header carries the notch inset
  and a tap-sized close button. No slide-in — motion is disabled globally, so "sheet" here
  describes the shape, not an animation. See `responsive.md`.
- **Escape closes**, a backdrop click closes, and focus is trapped inside while open. Return
  focus to the row that opened it. If the form is dirty, both paths go through the same
  unsaved-changes prompt as Cancel — never bypass it.
- **Respect `prefers-reduced-motion`** — the slide transition is already disabled globally
  in `globals.css`, so don't reintroduce it inline.

## Open/close flow

1. **Edit** — set the selected node and open, together.
2. **Create** — clear the selected node and open, together.
3. **Close** — reset open, selected node, and dirty state in one action. Leaving any of the
   three behind is the source of most drawer bugs.

## Unsaved changes

If the form is dirty, closing prompts for confirmation. This is a destructive-confirmation
case under `ux-principles.md`, so a dialog is appropriate here.

## Saving — two models, pick by content

### Explicit Save stays open (default for structured records)

Node detail forms, appointments, and any multi-field record with a draft use **Save that
does not close**. Leaving is a separate action (Cancel / × / Escape).

Why: a drawer is a workspace, not a one-shot dialog. People edit across tabs, checkpoint
mid-way, then keep going. Tying commit to leave forces either reopen thrashing or living
under a permanent "Unsaved changes" banner.

**Always use `DrawerFooter`** (`src/components/detail/Drawer.tsx`). Do not hand-roll
footer buttons — layout, hierarchy, and shortcuts live there so every form matches.

```
[ Cancel ]                          [ Save ]   [ Save & Close ]
```

| Control          | Style                    | Behaviour                                    |
| ---------------- | ------------------------ | -------------------------------------------- |
| **Cancel**       | Ghost / text, left       | Leave. If dirty → discard confirmation.      |
| **Save**         | Outlined secondary       | Persist, stay open, show **Saved**.          |
| **Save & Close** | Solid primary, rightmost | Persist then leave. Failed write stays open. |

Sticky at the bottom of the drawer (`flex-none` under a scrolling body). Both Save
buttons disable while a write is in flight.

Below `md` the **same three buttons** restack — Save & Close full-width on top, Save and Cancel
beneath — and the footer pads with `.pb-safe` so it clears the home indicator. The arrangement
changes; the button set does not. Do not drop a button on the phone to save room.

```
[      Save & Close      ]
[  Save  ]      [ Cancel ]
```

```tsx
const result = await saveNodeAction(values);
if (!result.ok) {
  setError(result.error); // check the error first
  return; // and stay open so the user can fix it
}
setDirty(false);
setJustSaved(true); // footer shows "Saved"; clear when the next edit dirties the form
// do NOT close — the user closes when they are done
// revalidatePath already refreshed the grid behind the drawer
```

Rules for this model:

- **Save** persists, clears dirty, shows brief **Saved** feedback, **stays open**.
- **Save & Close** persists then leaves — the finishing action, not a substitute for
  stay-open Save. Failed writes still stay open with the error.
- **Cancel** / header × / Escape / backdrop leave the surface. If dirty, prompt to discard
  — every leave path must share the same dirty-aware handler.
- Never close a drawer over a failed save — the user's input disappears with it.
- On **create**, promote the draft to the new id in local state so the next Save is an
  update, then stay open. `onSaved` (if the parent needs one) means **refresh background
  data**, not **close the drawer**.

Keyboard (wired in `DrawerFooter` / `Drawer`):

| Shortcut     | Action                     |
| ------------ | -------------------------- |
| ⌘/Ctrl+S     | Save (progress, stay open) |
| ⌘/Ctrl+Enter | Save & Close               |
| Escape       | Cancel (with dirty check)  |

Footer status (mutually exclusive, next to Cancel):

| State                         | Label             |
| ----------------------------- | ----------------- |
| Dirty                         | Unsaved changes   |
| Clean after a successful Save | Saved             |
| Saving in flight              | (button: Saving…) |

### Autosave (document-like surfaces)

Use when there is nothing meaningful to validate on commit and sessions are long writing
rather than form fill:

- Notes drawer
- Fitness session log
- Daily notes pane

There is no Save button and no discard prompt. Debounced writes + a status line
("Saves as you type" / "Saved · 2s ago" / Retry on failure). A failed autosave keeps the
text on screen and the drawer open.

Do **not** add a Save button to an autosave drawer for consistency with node forms —
match the task, not the chrome.

### Short sub-editors (exception)

A nested, single-purpose editor whose only next step is "return the result and leave"
(e.g. create/edit exercise from the session log) may treat **Save as done** and close on
success. That is a return value hand-off, not a multi-tab record workspace. Prefer this
only when staying open would strand the user with nothing useful to do next.

## Server actions

Drawer forms submit through **server actions**, following the pattern already established in
`src/app/outline/actions.ts`: the action returns `{ ok: false, error }` rather than throwing,
so a rejected save renders inline instead of crashing the view.

`revalidatePath` in the action refreshes the outline, so there is no separate refresh call
to make from the form for grid data. Parents that hold client-side schedule state still
need an `onSaved` refresh callback — that callback must **not** close the drawer.

## Tabs inside the drawer

Group a record's fields into tabs when there are enough to warrant it, as Achieve does. On
save, run full validation across **every** tab and switch to the first tab containing an
error — never leave a user staring at a valid-looking tab wondering why save did nothing.

---

## Standard: components/navigation

# Navigation & Commands

> For the philosophy these rules serve, see `ux-principles.md`. For how each surface
> reshapes below the breakpoint, see `responsive.md`.

Achieve Planner reached all sixteen of its views through the **Go** menu, and kept only the
ones you had opened as tabs. We inherited the tabs without the Go menu, so every view had to
be a permanent tab and the eleventh was already too many.

Six surfaces now, each answering a different question.

| Surface                    | Question it answers              | Role                                                 | Where                                  |
| -------------------------- | -------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| **Sidebar**                | "Where can I go?"                | Visual catalog of destinations. Commands… opens `⌘K` | Desktop, always                        |
| **Menu bar**               | "What can I do here?"            | **Complete catalog of commands**                     | Application chrome, above the page bar |
| **Page bar**               | "Where else can I go _in here_?" | Destinations inside this module                      | Below the menu, above page toolbars    |
| **Commands panel**         | "…show me all of it at once"     | The same tree left open                              | Desktop, opt-in, remembered            |
| **Row context menu**       | "What can I do to _this_ row?"   | Narrow, row-scoped subset                            | Right-click / long-press a row         |
| **Command palette** (`⌘K`) | "What can this app do?"          | Searchable overlay + Go-to extras                    | Desktop, on demand                     |

The menu bar is the **source of truth for completeness**. Toolbars and the Commands panel / palette are accelerators. A user who never opens `⌘K` must still be able to find every command by reading the menus.

**Panel vs palette.** Complementary accelerators of the same catalog, not two versions of
one control. The panel is the menu tree left open — spatial, hierarchical, no typing. The
palette is the only command-search surface (`⌘K`, View ▸ Command palette, and the sidebar
**Commands…** row, which teaches the chord rather than implementing a second search). Do
**not** add a filter box to the panel: that would make the two compete, and the panel's value
is that the organization stays visible.

That row was labelled `Search…` until **Find** joined the rail beneath it. Two rows promising
to search — one reaching commands, one reaching records — is the ambiguity this whole table
exists to prevent, and the row's own tooltip already said "commands" while its label did not.
**Searching commands and searching content are different questions and get different
surfaces**: `⌘K` for what the app can do, `/find` for what is written in it. Neither grows
into the other. Nested families stay expanded as headed groups in the
panel; folding is for the menu bar and the row menu, where space is scarce.

Below `md` the sidebar is replaced by the bottom nav plus the More sheet, there is no palette and
no desktop menu bar, and no panel — **`⋯` becomes the menu bar**, rendering the same tree with the
section names as headings. It is **shell-owned**, so a destination without a page toolbar still
has it. See `responsive.md`.

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

Four tiers, in this order, even though this is a hybrid web app with a sidebar:

1. **Application menu** — File / New / Item / Organize / View / Tools. Belongs to the app.
2. **Page bar** — sibling destinations inside this module. Belongs to the module.
3. **Page verb row** — icon buttons and the selection chip. “What can I _do_?” Belongs to
   the page.
4. **Lens row** — view picker, search, `Filter…`, `Group by`, density. “How am I _looking_
   at it?” Belongs to the grid, so it sits **immediately above the data**.

Achieve put a Win32 toolbar directly under the menus. We do not copy that. The verb row is
the page's actions; the lens changes what the grid shows, and proximity is the rule that
wins: cause sits next to effect. Reversing them to look more like 2005, or folding both
into one strip because “the desktop app had one toolbar,” is the mistake these rows exist
to prevent. A single combined strip is allowed only when both sets are short; the moment
verbs or lens controls fill the width, they stay two rows, verbs above, lens on the data.

On a dual-grid page the verb row stays page-level. Each grid keeps (or shares) a lens that
is visibly about that grid. Selection-specific verbs grow on the verb row so they do not
push Filter / Group / Search farther from the rows they affect.

Not folded into the command row: navigation sits at the rank of the sidebar, and putting it
among the verbs is the flattening `TabToolbar`'s two-row split already exists to prevent, one
tier up. Putting the page bar **above** the menu is the other inversion: the menu then reads as
belonging to the current tab, and it jumps when you switch pages.

It renders **only at two or more built pages**. A single tab spends a row saying "you are in the
only place there is", so modules with one destination pay nothing.

Below `md` the page bar is the row that survives. The desktop menu is hidden down there, so the
bar is the _only_ path to a sibling page: it scrolls sideways and its tabs are 44px. `⋯` is the
phone's menu, on the shell.

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
the bar, and they suppress the application menu. The test: **in the bar you leave by tapping a
sibling; a focused flow has an exit.**

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

**A destination may carry a chord**, and exactly one does: `⇧⌘F` for Find, declared on the
generated `go.find` in `globalCommands.ts` beside quick capture's, so every surface prints the
same binding. It is not a second placement rule — the sidebar is still Find's catalog. It
earns a key because it is reached from the middle of other work, which is not true of a
destination you navigate to deliberately. Achieve put Advanced Find on **Edit**; we have no
Edit menu (`menu-completeness`), and Find is a place you go and come back to rather than a
verb applied to what is in front of you, so it is a destination.

### The menu belongs to the application, not the tab

The menu bar is not another toolbar. It is the application-level command catalog. `AppShell`
draws it, above the page bar, from `useCommands()`. File is always there. New / Item /
Organize / View / Tools appear when the destination has something for them.

That placement is load-bearing even though the rest of the chrome is modern (sidebar, page
tabs, local toolbars):

- The menu does not belong to the current tab, so it does not jump when the page bar changes.
- A destination that is merely simple — Insights, Dashboard, Overview, Journal — still has
  it. A page without a menu forces people into a toolbar or `⌘K`, which is the
  discoverability failure the catalog rule exists to prevent.
- Icon buttons, the selection chip, and the lens stay on the page, next to the data. Those
  are accelerators. They are never the only path.

**Focused flows may suppress the menu.** Weekly wizard (`/schedule/plan`), `/fitness/log`,
the time-chart editor, and the fitness session/exercise editors have their own exit and are
not destinations. Settings stays outside `AppShell`. Detect those flows with a pure path
helper next to `pageForPathname`. Do **not** treat "no page bar" as the signal — Chooser and
Metrics have no page bar and still need File.

### Targeting when two grids share a page

Command ids are unique across the merged catalog. Two toolbars both publishing `view.filter`
is last-wins, which silently filters only the grid that mounted second.

Each grid gets a stable `CommandScope` (`id` + label) from `src/lib/commands/scope.ts`. The
View menu (and `⌘K`) then carries both:

- A **focused shortcut** — `Filter…`, `Clear filters` — acting on the last-interacted grid
  (default: the top one). A visible focus ring makes "current grid" real.
- **Explicit per-grid rows** — `Filter for Subscriptions & bills…`, `Clear filters for
Recurring spend` — so the user can target a grid without focusing it first.

One grid: only the unscoped rows. Do not invent `Filter for Tasks…` on a page that has one
grid. Compact and flat: no extra "Top grid" submenu. The same commands appear in the palette
with the grid name in the label.

The lens `Filter…` button still opens **that** grid's panel only. `Clear filters` is a menu
and palette command, disabled with the specific reason when nothing is filtered. It is not a
toolbar button — `data-grid.md`.

### Complete everywhere, sectioned everywhere

Every surface lists everything it is responsible for, and **sections** are what keep that
readable. "Short" was the old answer and it was the wrong one: the `⋯` menu was kept short by
leaving things out and unsorted, which is how it ended up as a traditional app menu with the
organization removed.

- The **menu bar is the complete catalog**, drawn by the shell above the page bar. File is
  leftmost and always present. New / Item / Organize / View / Tools appear when the
  destination has something for them. A command that is not in a menu does not exist to
  anyone not already holding `⌘K`.
- The **toolbar is a subset.** `toolbar` is a weight meaning "also an icon button." Every
  toolbar item must also be a menu command, because that row is hidden below `md`. Frequency
  and immediacy, not completeness.
- The **Commands panel is the same tree left open.** Same labels, same sections, same
  disabled reasons. Nested families stay expanded as headed groups — folding is a menu-bar
  and row-menu concern. It is not a search surface. Register File and the named menus at the
  shell — a File menu that exists only as a `CommandBar` prop is invisible to the panel, to
  `⋯`, and to any destination that never mounts a `CommandBar`.
- The **palette lists every menu command, plus Go-to.** Shortcuts and icons are printed.
  **View ▸ Command palette** and the sidebar Search… row are the discoverable invocations;
  do not rely on people already knowing `⌘K`.
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

## Standard: components/responsive

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
| `⌘K` command palette           | `⋯` on the shell                        | There is no `⌘K` on touch — see `navigation.md`              |
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

---

## Standard: components/ux-principles

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
complete catalog of what you can do, sitting **above the page bar** as application chrome;
an **icon row** of page verbs; a **lens** (filter, search, grouping) immediately above the
grid — not a 2000s toolbar glued to the menu; a pinnable **Commands panel** as that same
tree left open; a `⌘K` **palette** as the searchable overlay (plus Go-to). Below `md`,
**`⋯` is the menu bar**, on the shell. Views and commands each live in exactly one
registry. Full rules, including why a command without a menu row is not shipped:
**`navigation.md`**.

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

## Standard: components/modal-pattern

# Modal Pattern

> For _when_ a modal is allowed at all, see `ux-principles.md`. Three cases only.

Every centered dialog is built on **`ModalShell`** (`src/components/detail/ModalShell.tsx`).
Never hand-roll the backdrop — four dialogs each carried their own copy before it was
extracted, and they had already drifted apart on backdrop opacity.

```tsx
const titleId = useId();

<ModalShell open={open} onClose={close} labelledBy={titleId} width="max-w-lg">
  <div className="p-5">
    <h2 id={titleId}>Show Fields</h2>…
  </div>
</ModalShell>;
```

`ModalShell` supplies the backdrop and click-away, focus-in / Tab-trap / focus-restore
(`useModalFocus`), the Escape handler, and the `role` wiring. It renders nothing when `open`
is false. **Padding is yours** — the shell sets no padding so a dialog can have a flush
header or footer.

Focus handling stays for keyboard reasons, not accessibility ones: it is why Escape returns
you to the row you opened the dialog from, and why Tab does not wander into the grid behind
it.

## Rules

- **The `role` is functional, not decoration.** `"alertdialog"` for a destructive
  confirmation, `"dialog"` for everything else — and `isModalOpen()` finds a dialog by
  exactly these, so dropping the role breaks the capture shortcut's guard (below).
- **`labelledBy` points at the dialog's own heading.** A `useId` and an `id` on the `<h2>`;
  it keeps every dialog's API uniform for no real cost.
- **Escape is handled in the capture phase.** A grid's own keydown listener would otherwise
  see it first and cancel an inline edit _behind_ the dialog.
- **A visible button always accompanies a keyboard shortcut.** Touch has no Enter key, and
  a gesture nobody can see is not a discoverable action. `responsive.md` generalises this to
  hover, right-click and double-click as well.
- **Below `md`, `ModalShell` renders a bottom sheet** — anchored to the bottom edge, rounded
  top corners, `max-h-[85dvh]` with its own internal scroll, padded with `.pb-safe`. This is
  handled once in the shell, so every dialog gets it; a dialog that needs to opt out is a
  dialog worth reconsidering.

## Unmount a dialog that holds a draft

**Closing discards. Unmount the dialog rather than hiding it**, so the next open starts
clean:

```tsx
{
  open && <QuickCaptureDialog onClose={close} />;
} // not: <Dialog open={open} …>
```

Both draft-holding dialogs do this — `NoteFilterDialog` via an outer wrapper that returns
`null`, `QuickCaptureDialog` via the parent. It is what makes Cancel mean cancel, and it
avoids the bug it replaces: reseeding state from props inside an effect.

Passing `open` down and letting `ModalShell` unrender is right only for a dialog with no
draft of its own, like `ConfirmDialog`.

## Closing is the success signal (modals only)

A failed submit **keeps the dialog open** and renders the error inline; a successful one
closes it. The dialog disappearing is what tells the user it worked.

**Drawers are different.** Structured record drawers keep Save and leave separate — Save
stays open and shows "Saved"; Cancel / × leaves. Save & Close is the finishing commit.
Both surfaces still obey "never close over a failed save." See `drawer-pattern.md`.

Do not add a toast on top of that. There are none in the app, and a feedback convention
should be chosen for the whole app rather than introduced by whichever feature happened to
want one first.

## Modals are invisible to their own guard unless they use the shell

The app-wide capture shortcut suppresses itself with `isModalOpen()`
(`src/lib/keyboard.ts`), which queries `[role="dialog"], [role="alertdialog"]`. A dialog
built outside `ModalShell`, or missing its `role`, will not be seen — and `c` will open
quick capture on top of it.

## Deliberately not provided

No stacking, no scroll lock, no portal. Nothing here needs them, and `ux-principles.md`
names stacked modals as the specific Achieve behaviour worth leaving behind. If you find
yourself wanting a second modal over the first, the second one is probably a drawer.
