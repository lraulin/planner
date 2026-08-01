# Multi-user accounts + a separate local test identity

**Status: active**  
Spec folder: `agent-os/specs/2026-08-01-1042-multi-user-accounts/`

Delta on the frozen `agent-os/specs/2026-07-29-1630-email-password-auth/`, which built
Better Auth email/password sign-in for a **single provisioned owner** and listed
"second user via seed/script" as a follow-up. That folder stays frozen; this one owns
account provisioning and the separation of identities.

---

## Context

Local development runs as `dev@example.com` with `AUTH_DEV_BYPASS="true"`, which skips the
login screen entirely. The local Docker Postgres holds sample data, not real planning
content — but that account is **linked to the real Google account `leeraulin@gmail.com`**,
with `sync_enabled = true` on the primary calendar. Google Calendar sync
(`specs/2026-07-31-2046-google-calendar-sync`) is bidirectional and write-through, so any
local run — including the `.claude/skills/run-planner` browser driver, which is
unauthenticated under the bypass — can create, edit, and delete events on a real calendar.

The reported symptom was "running locally uses my real data even though it logs in with
`dev@example.com`". The account name says test; the Google grant behind it does not.

The cause is that **three different identities are one function**. `getOwnerUserId()`
resolves `PLANNER_AGENT_USER_EMAIL || AUTH_SEED_EMAIL || "dev@example.com"` and serves both
the dev bypass (`src/lib/auth.ts`) and the agent Bearer API (`src/lib/agent/tools.ts`),
while `src/db/seed.ts` provisions that same single account. There is no way to hold a test
identity and a real identity at once, because the seed only ever manages one user.

The schema has been multi-user since the beginning — 18 of 24 tables carry a `user_id` FK
and 12 integration suites already assert cross-user isolation. Nothing about the data model
blocks this. What is missing is **provisioning** and **identity separation**.

**Outcome:** `test@example.com` is what local dev and local agent calls run as, with no
Google link and therefore no reachable real calendar. `leeraulin@gmail.com` is the
production owner, renamed in place so all existing rows and its Google link survive.
Creating any further account — a spouse, later — is one command.

---

## Decisions

| Decision                        | Choice                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Identity model**              | Three separate seams: session user, **dev-bypass user**, **agent user**. They may all differ   |
| **Local dev identity**          | `test@example.com`, defaulted in code so an unset env var can never resolve to a real account  |
| **Production owner**            | Rename `dev@example.com` → `leeraulin@gmail.com` **in place**, preserving `users.id`           |
| **Provisioning**                | CLI: `npm run user:create`. No public sign-up, no invite flow, no admin UI                     |
| **`db:seed`**                   | Demoted to _local test bootstrap_ — provisions the dev user, refuses to run in production      |
| **Local test account + Google** | Unlinked, and not re-linked. A new **Disconnect** action makes that possible from the UI       |
| **Agent user in production**    | `PLANNER_AGENT_USER_EMAIL` becomes **required** — fail closed instead of defaulting to a guess |

### Why the default matters more than the config

The fix is not "point the env var at a test account" — that was already possible. It is that
the **default** resolves to a test account. `AUTH_DEV_BYPASS` exists because the browser
driver starts from a cold profile with no session cookie; it will keep being on. So the
question is what an unconfigured bypass resolves to, and today the answer is "whatever the
owner is". After this spec, an unset `AUTH_DEV_USER_EMAIL` gives you `test@example.com`,
which either exists as a test account or does not exist at all and throws. Neither outcome
touches real data.

The same reasoning inverts in production: there, guessing an identity is the dangerous
default, so `agentUserEmail()` throws when `PLANNER_AGENT_USER_EMAIL` is unset rather than
falling back to `dev@example.com` as it does today.

### Why disconnect deletes the mirrored rows

`disconnectGoogle()` deletes the user's `appointments` where `external_source = "google"`
rather than nulling their `external_*` columns. Nulling would leave a frozen copy of a
calendar that no longer syncs, and a later re-link would re-insert every event as a new row
— the partial unique index is on `(user_id, external_source, external_id)`, so orphaned rows
with the source cleared no longer collide. Deleting keeps re-linking idempotent, and those
rows still exist in Google, which is their source of truth.

---

## Non-obvious constraints

- **Renaming must be by `users.id`, never delete-and-recreate.** Every one of the 18 scoped
  tables cascades on `users.id`, and the linked Google `accounts` row hangs off it too.
  The existing `dev@localhost → dev@example.com` migration in `src/db/seed.ts` is the
  precedent and the code to generalise.
- **Linking and unlinking Google need a real session**, not the dev bypass — Better Auth's
  `linkSocial` has no session to attach to otherwise. Local cutover therefore starts with an
  actual sign-in. (`GoogleCalendarPanel` already documents this.)
- **Do not revoke the Google grant** at `myaccount.google.com`. The OAuth client is shared
  with production, so revoking to clean up locally would break the production link.
- **`db:seed` is destructive** for the user it targets (nodes, appointments, time charts).
  That is tolerable for a test account and not for an owner — hence the production refusal.
- **`agent-os/standards/api/agent-auth.md` documents the old resolution** (`getOwnerUserId()`,
  `AUTH_SEED_EMAIL`, `dev@example.com` default). It is a standard, not a spec, so it must be
  edited rather than superseded.

---

## Schema changes

**None.** Every column needed already exists (`users.email`, `accounts.providerId`,
`accounts.password`). If implementation turns up a genuine need, generate it with
`npm run db:generate` per `database/migrations.md` — never hand-write the SQL.

---

## Code map

| Concern                         | Location                                             |
| ------------------------------- | ---------------------------------------------------- |
| Identity resolvers              | `src/lib/auth/identity.ts` (was `owner.ts`)          |
| Session user / dev bypass       | `src/lib/auth.ts`                                    |
| Dev bypass gate (unchanged)     | `src/lib/auth/dev-bypass.ts`                         |
| Agent user resolution           | `src/lib/agent/tools.ts` — `resolveAgentUserId()`    |
| Account provisioning (logic)    | `src/lib/auth/provision.ts`                          |
| Account provisioning (CLI)      | `src/db/create-user.ts` → `npm run user:create`      |
| Local test bootstrap            | `src/db/seed.ts` → `npm run db:seed`                 |
| Google disconnect (logic)       | `src/lib/google/mutations.ts` — `disconnectGoogle()` |
| Google disconnect (action + UI) | `src/app/settings/actions.ts`, `GoogleCalendarPanel` |
| Signed-in account display       | `src/app/settings/page.tsx`                          |

---

## Acceptance criteria

- [x] `getCurrentUserId()` under the dev bypass resolves the **dev user**, not the agent/owner user
- [x] With `AUTH_DEV_USER_EMAIL` unset, the dev user is `test@example.com` — never an owner account
- [x] `agentUserEmail()` throws in production when `PLANNER_AGENT_USER_EMAIL` is unset
- [x] `npm run user:create --email … --password …` creates a working sign-in, and re-running is idempotent
- [x] `npm run user:create --rename-from old@ --email new@` preserves `users.id` and every scoped row
- [x] `npm run db:seed` refuses to run when `NODE_ENV=production`
- [x] Settings has a **Disconnect** action that removes the Google account row, calendar links, and mirrored appointments — for that user only
- [x] Settings shows which account is signed in, marked when it is the dev-bypass account
- [x] Local: the app runs as `test@example.com`, Google reads as not connected, `google_calendar_links` is empty
- [x] Local agent Bearer calls resolve to the test account
- [ ] Production: sign-in works as `leeraulin@gmail.com`, data is unchanged, Google is still linked
- [x] Integration tests prove a second user cannot read, change, or delete the first's rows through the new code paths

Local verification, 2026-08-01: 1046 tests across 69 files pass with **no** skipped
integration suites. The disconnect was exercised through the real UI — 11 mirrored
appointments and both calendar links removed, the one planner-native appointment kept, the
`google` row in `accounts` gone. Screenshots in `.artifacts/planner-shots/` (`01`–`05`).

### Remaining: the production rename (run by hand)

The spec stays **active** until this is done. Nothing is broken meanwhile —
`PLANNER_AGENT_USER_EMAIL` is already set in production, so the new fail-closed check
passes and the deployed app keeps working as `dev@example.com`.

**The connection string must come from the Neon console, not from Vercel.** These are Vercel
**sensitive** environment variables — write-only by design — so `vercel env pull` writes the
literal placeholder `[SENSITIVE]` in place of every value. Feeding that to `postgres()`
fails with `ERR_INVALID_URL`, confusingly _after_ the pull looks like it worked. Neon
dashboard → the `planner` project → Connection Details → copy the string. Pooled or direct
both work here; this is plain DML, and only migrations care about the distinction.

`psql` is not installed on this machine and does not need to be — the `planner-postgres`
container has it and can reach Neon.

```sh
# 1. Paste the Neon connection string (read -rs keeps it out of shell history).
read -rs NEON_URL && export NEON_URL

# 2. Confirm what production actually holds, before changing anything.
docker exec planner-postgres psql "$NEON_URL" -c 'select id, email, name from users;'

# 3. Rename in place. Same trick for the password.
read -rs USER_PASSWORD && export USER_PASSWORD
DATABASE_URL="$NEON_URL" npm run user:create -- \
  --email leeraulin@gmail.com --rename-from dev@example.com --name "Lee"

# 4. Repoint the agent identity — in BOTH environments, since previews share the database.
#    One line each, never a for-loop: pasting a multi-line loop into zsh mangles it, and the
#    failure mode is asymmetric — the `rm` succeeds with an empty target while the `add`
#    errors out, leaving the variable deleted. In production that is a fail-closed throw in
#    `agentUserEmail()`, i.e. every agent call down until it is restored.
vercel env rm PLANNER_AGENT_USER_EMAIL production --yes
vercel env rm PLANNER_AGENT_USER_EMAIL preview --yes
printf 'leeraulin@gmail.com' | vercel env add PLANNER_AGENT_USER_EMAIL production
printf 'leeraulin@gmail.com' | vercel env add PLANNER_AGENT_USER_EMAIL preview
vercel env ls | grep AGENT_USER   # confirm both rows came back before deploying

# 5. Redeploy — env changes only take effect on a new deployment.
vercel --prod

unset USER_PASSWORD NEON_URL
rm -f .env.production.local
```

Then verify: sign in at the production URL as `leeraulin@gmail.com`; the outline still shows
your data (same `users.id`); Settings reports Google as linked; an agent call with the
production Bearer key returns your tree.

**What production actually turned out to hold (2026-08-01):** the account was _already_
`leeraulin@gmail.com` (`de3a32c2-…`, name "Dev User") — only the local database ever used
`dev@example.com`. So no rename happened: `--rename-from` found nothing, converged to an
update, and set the name and password on the existing row. That is the designed behaviour
for a rename that has already happened, and it is why the flag is safe to re-run. The
production `users.id` differs from the local one, as separate databases should.

---

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Dropped** the planned "warn when the dev and agent users are the same address".                                                                                                                                             | Outside production `agentUserEmail()` _deliberately_ falls back to the dev user, so the warning would have fired on every local run — noise that trains you to ignore it. Replaced with something better targeted: the existing bypass warning now names the account it is serving, which is the fact that was missing when this bug went unnoticed. |
| 2   | **Added** `normalizeEmail()` and made every stored address lowercase.                                                                                                                                                         | Not in the plan; found while writing the script. Better Auth signs in via `findUserByEmail(email.toLowerCase())`, so a row stored with any uppercase is an account that exists, has a correct password, and can never be signed into.                                                                                                                |
| 3   | **Extracted** `src/db/sample-data.ts` from `seed.ts`.                                                                                                                                                                         | `user:create --sample-data` and `db:seed` both need the demo content; leaving it inside the seed would have meant the provisioning script importing the script it replaced.                                                                                                                                                                          |
| 4   | **Added** `getCurrentAccount()` (id + email + `viaDevBypass`) to `src/lib/auth.ts`.                                                                                                                                           | The Settings display needs the address _and_ whether anyone actually signed in. "Signed in as X" is reassuring and false under the bypass, which is the precise failure this spec is about.                                                                                                                                                          |
| 5   | **Reversed** the local cutover order: rename first, disconnect second.                                                                                                                                                        | With the bypass pointed at a `test@example.com` that did not exist yet, every page threw and the app could not be driven at all. Disconnecting under the bypass turned out to be fine — only `linkSocial` needs a real session.                                                                                                                      |
| 6   | **Widened** the doc updates beyond `.env.example` and `README.md` to `docs/agent-api.md`, `tools/alfred/README.md`, `tools/shortcuts/README.md`, `agent-os/product/tech-stack.md`, and `.claude/skills/run-planner/SKILL.md`. | All of them documented "the single owner user" as the identity model. A standard or skill left describing the old resolution is how the collapse gets rebuilt later.                                                                                                                                                                                 |

---

## Tasks

1. **Save spec documentation** — this folder.
2. **Split the identity seam into three** — `owner.ts` → `identity.ts`; add `devUserEmail()`
   / `getDevUserId()`; `ownerEmail()` → `agentUserEmail()` (throws in production);
   `getOwnerUserId()` → `getAgentUserId()`; delete `LEGACY_DEV_USER_EMAIL`, `seedEmail()`,
   and the deprecated re-export in `src/lib/auth.ts`. Repoint the bypass and the agent
   dispatcher. Warn when the dev and agent users collapse to the same address. Unit tests
   beside the module. Update `agent-os/standards/api/agent-auth.md`.
3. **`npm run user:create`** — `upsertUser({ email, password, name, renameFrom })` in
   `src/lib/auth/provision.ts`, extracted from `ensureOwnerCredentials()`; non-interactive
   CLI wrapper in `src/db/create-user.ts`; `provision.integration.test.ts` with the
   cross-user case.
4. **Reframe `db:seed`** — provisions the dev/test user via `upsertUser()`, refuses in
   production; `AUTH_SEED_*` → `AUTH_DEV_USER_*`; update `.env.example` and `README.md`.
5. **Disconnect Google** — `disconnectGoogle(userId)`, server action, `ConfirmDialog`-backed
   button in `GoogleCalendarPanel`, integration cases.
6. **Show the signed-in account** in Settings.
7. **Cut local development over** — disconnect Google, rename to `test@example.com`, reseed,
   set `AUTH_DEV_USER_EMAIL`.
8. **Rename the production owner** — Vercel env, then `user:create --rename-from` over the
   Neon direct connection, then verify.
9. **Verify, freeze spec, update roadmap.**

---

## Out of scope (this spec)

- Invite-code or public sign-up
- Roles, permissions, or an owner/admin concept
- **Per-user agent API keys** — still one `PLANNER_AGENT_API_KEY` per deployment mapping to
  one configured user. Remains a follow-up from the auth spec
- Account/profile editing UI (change email, change password from the app)
- Sharing, collaboration, or anything one user can see of another
- Provisioning a second real person — the mechanism ships here, the account does not

---

## Standards applied

- `development/testing.md` — cross-user isolation is the point of this spec; new DB logic
  gets an `*.integration.test.ts`, pure resolvers get unit tests, no component tests
- `api/agent-auth.md` — the agent identity resolution changes, so the standard changes
- `components/modal-pattern.md` — the disconnect confirmation is destructive: `ConfirmDialog`
  on `ModalShell`, `role="alertdialog"`
- `database/migrations.md` — no migration expected; if one is needed it is generated
