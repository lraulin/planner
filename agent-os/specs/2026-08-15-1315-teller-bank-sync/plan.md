# Live bank sync via Teller

**Status: active**
Spec folder: `agent-os/specs/2026-08-15-1315-teller-bank-sync/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — account
  identity, the insert-or-skip contract, integer-cents discipline.
- **Extends:** `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/` — secrets,
  error redaction, per-user scoping.
- **Supersedes:** `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/` — its
  `connect-src 'self'` / no-third-party-frames CSP decision, **narrowly**, to admit Teller
  Connect's iframe. Every other directive stands.
- **Supersedes:** `agent-os/specs/2026-08-14-1617-statement-cash-flow/` — its "Plaid is out
  of scope" deferral, and its "no change to the headline current-balance rule" decision
  **for Teller-linked accounts only**. Unlinked accounts keep the statement-anchored rule.

## Context

Every transaction in the register today arrives because Lee downloaded a file and imported
it. That works for the retrospective question ("where has my money been going") and it is
why the reconcile / statement-cash-flow machinery exists. It does not work for the
forward-looking question that actually drives behavior: **"how much do I have available
right now, before the next payday."** Answering that from a file downloaded last Tuesday
means not answering it. This is the failure mode that killed YNAB as a habit — manual entry
gets abandoned, and the tool dies with it.

Teller's development environment is functionally identical to its production environment —
real institutions, real credentials, live real-time balances — free, capped at 100 bank
logins, with no Know-Your-Business verification. That cap is ~2 for this app forever. It is
the one option that satisfies "as current as checking the bank's own app" at zero cost.

**Scope is the feed only.** Getting fresh, trustworthy data into the register is a
self-contained deliverable. The "available to spend before payday" view is a follow-on spec
that should be designed against real fresh data rather than imagined ahead of it — and it
collides with envelopes, which the roadmap already names as **Next** under § Financial
planning.

Capital One and Chase are the whole target. Coinbase is closed and out of the picture;
Amazon order history stays a manual data request, because it answers the historical
question and has no API at any price.

## Decisions

**D1 — Teller, development environment, permanently.** Free, real banks, 100 enrollments.
Accepted risk: Teller could change dev-tier terms. Fallback if they do is SimpleFIN
($15/yr, daily refresh only), which would slot in behind the same internal seam. SimpleFIN
was rejected as the primary because daily-only refresh fails the stated requirement.

**D2 — Teller accounts link to existing `finance_accounts` rows; they do not create new
ones.** Account identity is `(userId, externalSource, externalKey)`, so syncing under
`api:teller` would silently fork every account into a CSV twin and a live twin. Two new
tables instead — `tellerEnrollments` (access token, institution, `lastSyncedAt`) and
`tellerAccountLinks` (Teller `account_id` → `finance_accounts.id`, plus the live balance
snapshot). `finance_accounts.externalSource` is never rewritten, so re-importing an old CSV
still resolves to the same row. Follows the `googleContactSyncs` precedent
(`src/db/schema.ts:1124`): authoritative integration state gets its own table, not
`user_settings`.

Link candidates are pre-matched on Teller's `last_four` against `externalKey`, but the user
confirms each one. A wrong auto-link merges two real accounts and is near-impossible to
unpick.

**D3 — `FinanceFeed` gains `api:teller`** (`src/lib/finances/types.ts:8`). Its doc comment
already anticipates exactly this: "a later Plaid or SimpleFIN sync should be a new member
here and nothing else." Synced rows carry `externalSource: "api:teller"` and
`externalId: <teller txn id>`. `import.ts:405` already prefers a feed-supplied id over a
computed fingerprint, so Teller's stable ids bypass `fingerprint.ts` entirely.

**D4 — A real `pending` boolean on `finance_transactions`.** Not an overload of nullable
`postedDate`, which already means "this feed does not supply one" — true of every Chase
statement.

**D5 — Pending rows are transient and replaceable.** Each sync fetches the account's current
pending set, deletes local pending rows absent from it, and inserts the current ones. This
is correct precisely because Teller may issue a **new** id when a pending transaction
changes materially on posting — the restaurant-tip case that `fingerprint.ts:29` names as
its known unhandled limitation. Consequence to accept: user edits to a pending row
(category, notes) do not survive posting.

This **deliberately breaks the CSV importer's "insert or skip, never update" invariant**
(`import.ts:43-57`). It therefore lives in a separate `syncTellerAccount` path and must not
be folded into `importFinanceCsvFiles`.

**D6 — Cross-source dedup reuses `selectNewTransactions`** (`matchExisting.ts:71`)
unchanged — date + signed cents + fuzzy `descriptionsMatch`, occurrence-counted. It was
built for exactly this ("the index will not recognise overlap"). Because D2 puts synced rows
on the _same_ account row, a later Chase statement import skips what Teller already synced
**for free**, with no new code.

**D7 — Live balance becomes the headline for linked accounts.** `FinanceAccountRow`
(`types.ts:146`) already models headline-vs-ledger with a mismatch delta; the synced balance
slots in as a third source ahead of statement-closing. `balanceMismatchCents` then reads as
register-vs-bank drift, which is the number that says whether the register is complete.
Teller's `available` (ledger net pending) is the headline; `ledger` is kept alongside.

**D8 — Manual refresh button plus a stale-on-load throttle. No scheduler.** Copies
`syncWindowIfStale` / `SYNC_MAX_AGE_MS` (`src/lib/google/sync.ts:26,188`) and the
`SyncStatus` discriminated union. A cron would be the first scheduler in this repo and
deserves its own decision — and it buys nothing here, because the data only needs to be
fresh at the moment Lee opens the app.

**D9 — Sync triggers `reclassifyTransactions` when it inserted anything.** Synced rows land
with `derivedFlow = null` like every imported row. Query-time `effectiveFlow` fallbacks
(`analytics.ts:94`) mean nothing is broken if it does not run, but leaving a manual button
in the loop reintroduces exactly the manual step this spec exists to delete.

**D10 — CSP delta.** `script-src` already carries `'strict-dynamic'`, so `connect.js` loaded
from a nonced `next/script` needs no host allowlist. Teller Connect's **iframe** does:
`frame-src https://teller.io` must be added to `src/lib/security/csp.ts`, which currently
falls through to `default-src 'self'` and would silently render a blank modal.

**D11 — mTLS via `node:https`, no new dependency.** Bare `fetch` cannot present a client
cert without an undici `Agent`, and undici is not a direct dependency. Cert and key are
base64 PEM env vars read through a fail-closed accessor in the shape of `oauthSigningSecret()`
(`src/lib/oauth/origin.ts:17`), documented in `.env.example`.

**D12 — Error classes mirror `src/lib/google/client.ts`.** Critical trap: `safeError.ts:31`
redacts any error carrying a `code`, and every Node TLS/network failure has one
(`ECONNRESET`, `CERT_HAS_EXPIRED`). "Reconnect your bank" must be thrown as a plain `Error`
with no `code`, the way `GoogleNotLinkedError` is.

### Out of scope

- Available-to-spend / safe-to-spend / envelopes — the next Finances spec.
- Retiring statement or CSV imports. Statements remain the reconciled system of record;
  `reconcile.ts` and `statementCashFlow.ts` still need real statement boundaries.
- Teller payments/transfers (`products` stays `["balance", "transactions"]`).
- Amazon, PayPal, Coinbase.
- Any scheduled or background refresh.

## Acceptance criteria

- [ ] Chase and Capital One enroll through Teller Connect and return an access token.
- [ ] Each Teller account is linked to its existing `finance_accounts` row by confirmation,
      pre-matched on last four. No duplicate accounts appear in the register.
- [ ] A refresh pulls posted + pending transactions and a live balance; the headline balance
      for a linked account matches what the bank's own app shows.
- [ ] Re-running a refresh inserts nothing new.
- [ ] Importing a Chase statement CSV that overlaps already-synced dates inserts nothing new.
- [ ] A pending transaction that posts ends up as exactly one posted row, not two.
- [ ] Pending rows are visibly distinct in the register.
- [ ] Newly synced rows are classified without pressing Reclassify.
- [ ] A second user cannot read, refresh, relink, or delete the first user's enrollment.
- [ ] A revoked or expired enrollment surfaces "reconnect", not "Something went wrong."
- [ ] `npm run smoke` passes; `/finances`, `/finances/register`, `/settings` all render.

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create this folder with `plan.md` (**Status: active**), `shape.md`, `standards.md`,
`references.md`. No visuals.

## Task 2: Connectivity spike — gate everything on this

Before any schema work. Sign up for Teller, download the development cert/key, and with a
throwaway script (scratchpad, not committed) confirm end to end:

- Chase **and** Capital One 360 + card actually enroll on the development tier.
- `GET /accounts`, `/accounts/:id/balances`, `/accounts/:id/transactions` all return.
- `last_four` values match the `externalKey`s already in `finance_accounts`.
- Pending transactions are present, and whether Capital One supplies them at all — Plaid
  documents Capital One as not providing pending data, and Teller may inherit that.
- The amount sign convention on a credit card versus a checking account.

**Stop and reassess if an institution fails.** Everything below assumes this is green.
Capture the real payloads; they become the Task 5 test fixtures.

## Task 3: Schema

Migration adding `tellerEnrollments`, `tellerAccountLinks`, and
`finance_transactions.pending boolean not null default false`. Both new tables `userId`-scoped
with cascade delete. Add `api:teller` to `FinanceFeed`, `FINANCE_FEEDS`, `FEED_LABELS`.
Register the new query module in `src/lib/db/crossUserReads.integration.test.ts`.

## Task 4: `src/lib/teller/client.ts` — outbound calls

`node:https` with cert/key from a fail-closed env accessor; HTTP Basic with the access token
as username and empty password. Typed responses for accounts, balances, transactions
(`count` / `from_id` / `start_date` pagination). Error classes per D12. Thin and effectively
untested by design, mirroring `src/lib/google/client.ts`.

## Task 5: `src/lib/teller/mapping.ts` — pure, fully tested

Teller account → `ParsedAccount`; Teller transaction → `ParsedTransaction` + `pending`.
Amount sign convention verified against the existing "positive = money in" rule for **both**
depository and credit accounts — a credit card is where this most easily inverts. String
amounts → integer cents via `money.ts`. Last-four → `externalKey` match candidates. This is
where the tricky reasoning lives; the Task 2 payloads are the fixtures.

## Task 6: `src/lib/teller/sync.ts` — the sync itself

`syncEnrollment(userId, enrollmentId)` and `syncIfStale(userId)`. Per linked account: fetch
balances + transactions since the last sync with overlap, run `selectNewTransactions`
against existing rows in range, insert new posted rows, replace the pending set per D5,
write the balance snapshot, bump `lastSyncedAt`. `SyncStatus` union; per-account failures
collected, never thrown, so one dead enrollment cannot wipe the other. Calls
`reclassifyTransactions` if anything was inserted.

## Task 7: `src/lib/teller/mutations.ts` + `queries.ts`

`userId`-first, ownership proved before every write, in the shape of `requireTransaction`
(`finances/mutations.ts:29`). Store enrollment, link/unlink accounts, delete enrollment.
`*.integration.test.ts` including the full cross-user battery.

## Task 8: Balance seam

Extend `listAccounts` (`queries.ts:47`) so a fresh Teller snapshot outranks statement-closing
as `balanceCents`, with `balanceMismatchCents` becoming register-vs-bank drift (D7). Surface
the snapshot age — a stale balance presented as live is worse than no balance.

## Task 9: CSP + Teller Connect UI

`frame-src https://teller.io` in `src/lib/security/csp.ts` with a doc comment explaining the
concession, plus its unit test. A settings-page client component loading
`https://cdn.teller.io/connect/connect.js` via nonced `next/script`, running Connect with
`environment: "development"` and `products: ["balance","transactions"]`, POSTing the
`onSuccess` token to a server action. Re-auth path re-initializes Connect with the stored
`enrollmentId`.

## Task 10: Register UI

Refresh button with `SyncStatus` states, last-synced timestamp, pending rows visibly
distinct, account-link confirmation screen. Reconnect prompt on a revoked enrollment.
Phone-first: this is validated on the deployed iPhone.

## Task 11: Verify, freeze spec, update roadmap

- Run the acceptance criteria against real Chase and Capital One data.
- `npm run test:unit`, `npm run test:integration` (confirm no Postgres skip warning),
  `npm run typecheck`, `npm run lint`, `npm run build`, then **`npm run smoke`** with the dev
  server up — Tasks 9 and 10 touch `src/app/**`.
- Deploy to `master` and confirm on the iPhone.
- Update `plan.md` / `shape.md` for as-built drift; complete **Changes from original plan**.
- Mark **Status: frozen / complete**; move leftovers to Follow-ups.
- Update `agent-os/product/roadmap.md` § Financial planning — this closes the deferred
  aggregator item and leaves Envelopes as **Next**.

---

> **Standing rule while this spec is active:** material changes to requirements, design, or
> scope — including feedback on what was actually built — go into `plan.md` / `shape.md`
> plus a row in **Changes from original plan**. Skip pure implementation detail.

## Verification

Automated gates cannot prove this one works. The whole feature is an outbound mTLS call to a
third party plus a browser widget, and the test suite evaluates neither.

1. **Pure logic** — `npm run test:unit`. `mapping.ts` carries the real reasoning (sign
   conventions, cents, pending) and gets real Teller payloads as fixtures.
2. **Database** — `npm run test:integration` with Postgres up. Watch for the skip warning.
   Cross-user battery on every new mutation.
3. **Live** — enroll both banks, refresh, compare the headline balance against the Chase and
   Capital One apps side by side. Refresh twice; the second must insert nothing.
4. **Overlap** — import a Chase statement CSV covering already-synced dates. Must insert
   nothing.
5. **Pending** — let a real pending charge post over a day or two; confirm one row, not two.
6. **Routes** — `npm run smoke` against a running dev server.
