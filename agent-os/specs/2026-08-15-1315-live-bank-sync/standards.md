# Standards for Live bank sync via Teller

The following standards apply to this work.

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

---

## development/commits

# Commits

Agents commit and push here at their own discretion — `CLAUDE.md` says so, and that is not
going to change. So there is no reviewer standing between a bad commit and `master`. What
that removes is the safety net; what it does not remove is the reader. The reader is a
future agent running `git log -S` or `git blame` on a line it is about to change, six
months from now, with none of today's context and no way to ask.

That is the whole job of a commit here: **leave the next agent enough to change this line
safely.** Everything below follows from it.

The division of labour with `agent-os/specs/` is: a spec says what we meant to build and
why we wanted it. A commit says what this diff does to the code and why _this_ shape. They
answer different questions, and `git blame` only reaches one of them.

Use them in that order and only as far as the work needs:

- For established behavior, read the governing spec's decisions and acceptance criteria,
  following only deltas that affect the same concern.
- Read commits when implementation history matters — a regression, a non-obvious line, an
  earlier rejected approach, or verification that cannot be inferred from the tree. Start
  with `git log -- <paths>`, then inspect the few matching commits or blame lines.
- If a spec, the code, and history disagree, report it. A commit explains a change; it does
  not create a requirement or silently supersede a spec.

## One logical change per commit

This is the rule that pays for all the others, and the one agents break by default. An
agent can produce a forty-file diff in a minute, and a forty-file diff can only ever get a
vague message, because there is no single thing to say about it.

- A commit is one thing that could be reverted on its own. If the subject needs an "and",
  that is usually two commits.
- Mechanical churn — a rename, a move, a formatting pass — goes in its own commit, apart
  from behaviour change. `Move the filter rules and item-kind config down into src/lib` is
  a move; the deduplication it enabled is described in its body because it happened in the
  same motion, but a behaviour change would not have ridden along.
- Large commits are legitimate when the change genuinely is one thing — replacing the
  command row touched 57 files because a half-replaced command row does not run. That is
  the exception that needs the body to carry it, not the default.

Small commits are also cheap insurance against the failure mode in `clean-code.md`:
confident, plausible, and wrong. A wrong commit that touched one domain folder is a
one-line revert.

## Subject line

Imperative mood, capitalised, no trailing period, **72 characters hard maximum** and
aim for 50–60. The log averages 51 and has crossed 72 five times in 305 commits; hold that.

Write the **effect on the product or the code**, not the files touched and not the
activity. Complete the sentence "If applied, this commit will…".

| Instead of              | Write                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| `Refactor actions.ts`   | `Give every server action one run() instead of eleven copies`         |
| `Fix date bug`          | `Refuse a date that does not exist instead of rolling it over`        |
| `Update grid selection` | `Select the rows the grid is showing, not the ones handed to it`      |
| `Improve fitness UI`    | `Give Fitness one create button instead of two identical plus glyphs` |

The pattern in the good column is doing real work: naming both the new behaviour and the
old one in the same breath tells a reader scanning `git log --oneline` whether this is the
commit they are hunting for, without opening it. Use it whenever a change replaces
something.

Deliberately **not** Conventional Commits — no `feat:` / `fix(scope):` prefix. Nothing in
this repo consumes them: no changelog generation, no semantic versioning, no release
tooling, and one developer. They would spend ten to fourteen characters of a 72-character
budget on a label that no tool reads and that `git log --oneline` already conveys better in
prose. This is a decision, not an oversight — do not "fix" it, and do not start half a
second era in the log.

## Body

Wrap at 72 characters. Explain **why**, and what the diff cannot say for itself. The diff
already shows how.

A body is **required** when any of these is true:

- The change is not obviously correct from the diff — a subtle condition, an ordering
  dependency, a boundary case.
- Something was deliberately left alone, or deliberately not generalised. Say which and
  why, or the next agent will "finish the job" and break something.
- An alternative was considered and rejected.
- The change touches a layer boundary, a `userId` scope, the date encoding, or any other
  invariant named in the standards.
- It is a bug fix: say what the old behaviour was. A subject like "Refuse a date that does
  not exist instead of rolling it over" is only half the story without "February 30th
  silently became March 2nd on import".

A subject alone is fine for the genuinely self-evident: a typo, a log entry, a doc tweak,
a version bump. About a fifth of the log has no body and that is the right proportion.

Things worth putting in a body that are easy to forget:

- **What you verified.** "Verified end to end in a browser", "added the cross-user
  isolation case", "the integration tests ran against real Postgres" — this matters more
  here than in a reviewed repo, because it is the only signal that the gate in
  `development/testing.md` was actually met and not skipped past a `SKIP` warning.
- **What was left for later**, if the change is knowingly partial.
- **A number, when it makes the point**: "274 lines deleted, 86 added" says more about a
  deduplication than a paragraph.

## Trailers

Use this exact trailer when the work implements a shaped spec:

```
Spec: agent-os/specs/YYYY-MM-DD-HHMM-feature-slug
```

No trailing slash and no bare folder name. Cite the current implementing spec or delta,
not its whole predecessor chain; the delta owns those relationships. Repeat `Spec:` only
when one logical change is genuinely governed by more than one spec. Unshaped maintenance
does not need a trailer. This is the link from a blamed line back to intent.

**No AI attribution.** No `Co-Authored-By`, no "Generated with", no tool names — this is
already a hard rule in `CLAUDE.md`, and the reason it makes sense here rather than being
mere preference is that almost every commit in this repo is agent-written. A marker present
on everything distinguishes nothing; it would only add four lines of noise to 305 commits
and counting. The transparency argument for attribution assumes a reader deciding which
changes to scrutinise harder. Here, the answer is all of them.

## The one part of this that is enforced

`.husky/commit-msg` rejects three things because they cannot be repaired after push:

- **A subject over 72 characters.** The hard maximum above.
- **A body line over 120 characters.** Not the 72-column wrap — that is a preference the log
  breaks 637 times in 200 commits and is none of a hook's business. 120 catches a different
  failure: an entire body arriving as **one line**, which is what happens when the blank line
  between paragraphs is written as a literal `\n` inside `-m "…"` by a shell that does not
  interpret it. Seven commits in two days landed that way, one of them a single
  583-character line. Use a heredoc or repeated `-m` flags.
- **A malformed or nonexistent `Spec:` path when the trailer is present.** The hook accepts
  only the canonical form above and checks that its directory exists. It does not require
  every commit to cite a spec.

The two length thresholds were measured against the existing log; the trailer check is
forward-only, and older spelling variants remain in immutable history. `--no-verify` skips
the hook for a message that genuinely needs an exception.

## Before committing

- Run the gates from `clean-code.md` — `npm test`, `npm run lint`, the typecheck — and read
  the diff. A commit that does not build is worse than no commit; `git bisect` has to step
  over it forever.
- Check `git status` for files that wandered in. Staging everything is how a debug script
  or a stray `.env` ends up in the permanent record.
- Push to `origin/master` when the working tree is green. Long-lived local work is a
  liability nobody is reviewing anyway.
- Never rewrite published history. A confusing message that is already pushed gets a
  clarifying follow-up commit, not a rebase.
