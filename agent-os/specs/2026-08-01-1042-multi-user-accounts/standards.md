# Standards for Multi-user accounts + a separate local test identity

**Status: frozen / complete** (2026-08-01)

Four standards apply. The one that binds hardest is `development/testing` — this entire
spec is about the mistake that standard names first ("a refactor that drops a `userId` from
a `where` clause"), so its cross-user rule is the acceptance bar, not a suggestion.
`api/agent-auth` is unusual here: it **documents the behaviour being changed**, so it is
edited as part of the work rather than merely obeyed.

---

## development/testing

**Why it applies:** The new database logic is account provisioning (`upsertUser`) and
Google disconnection (`disconnectGoogle`) — both mutate rows keyed by `userId`, and both are
exactly the shape where a dropped scope is invisible with one user. Each gets an
`*.integration.test.ts` with a second user proving it cannot reach the first's rows. The new
identity resolvers are pure and get unit tests beside the module. No component tests for the
Settings changes.

Specific tripwires this feature needs:

- A rename preserving `users.id` — assert the id, not just that a row with the new email exists
- A rename onto an email another user already holds failing rather than merging accounts
- `disconnectGoogle(A)` leaving B's `accounts` row, calendar links, and mirrored appointments intact
- `disconnectGoogle(A)` leaving A's own local-only appointments (`external_source` null) intact
- `agentUserEmail()` throwing in production rather than returning a default

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
   month-boundary case.
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

## api/agent-auth

**Why it applies:** This spec changes how a valid Bearer key maps to a user —
`getOwnerUserId()` becomes `getAgentUserId()`, the `AUTH_SEED_EMAIL` fallback is removed,
and `PLANNER_AGENT_USER_EMAIL` becomes required in production. The **Identity** section
below is therefore rewritten as part of this work. The mechanism and the "never" list are
unchanged.

# Agent API authentication

## Mechanism (MVP)

- Environment variable: **`PLANNER_AGENT_API_KEY`** (long random secret).
- Header: **`Authorization: Bearer <key>`**.
- If the env var is **unset or empty**, agent routes fail closed with `internal` (misconfiguration),
  not open access.
- Wrong or missing header → `unauthorized` / HTTP 401.

## Identity

> Shown **as rewritten by this spec**. The version it replaced read: _"A successful key maps
> to the owner user via `getOwnerUserId()` / `resolveAgentUserId()` (email from
> `PLANNER_AGENT_USER_EMAIL` or `AUTH_SEED_EMAIL`, default `dev@example.com`)."_ That default
> is the thing this spec removed.

A successful key maps to the **agent user** via `getAgentUserId()` / `resolveAgentUserId()`
(`src/lib/auth/identity.ts`), whose address comes from **`PLANNER_AGENT_USER_EMAIL`**.

That variable is **required in production** — an unset value throws rather than falling back
to a default account. The old default (`dev@example.com`) was harmless while one account
existed and a silent cross-account write once more than one did. Outside production it falls
back to the dev-bypass user (`AUTH_DEV_USER_EMAIL`, default `test@example.com`), so a local
machine with no agent configuration points at the test account rather than at nothing.

The agent user is **not** the dev-bypass user and **not** a session user, even when the
addresses happen to coincide locally. Session cookies are for humans at `/login`; machine
clients keep Bearer auth.

The key is **not** multi-tenant: one key per deployment, one configured account. Per-user
keys would grow out of `resolveAgentUserId()`.

## Never

- Commit real keys.
- Put the key in client-side browser code or public repo docs as a live value.
- Log the full Authorization header.

---

## components/modal-pattern

**Why it applies:** Disconnecting Google deletes the account link, the calendar links, and
every mirrored appointment. That is a destructive confirmation — one of the two cases
`ux-principles` allows a modal at all — so it uses the existing `ConfirmDialog`
(`role="alertdialog"`, Cancel takes focus) rather than a hand-rolled dialog or a
`window.confirm`.

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

---

## database/migrations

**Why it applies:** No schema change is expected — provisioning uses columns that already
exist. The standard is listed because it also owns the `db:seed` rules, and this spec
changes what `db:seed` is for: its "deletes the dev user's nodes, appointments and time
charts" warning becomes the reason the script now refuses to run in production. If a
migration does turn out to be needed, it is generated, never hand-written.

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
