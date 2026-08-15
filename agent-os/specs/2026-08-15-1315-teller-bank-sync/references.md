# References for Live bank sync via Teller

## Governing specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends
- **Relevant decisions:** account identity is `(externalSource, externalKey)` and never the
  name; import inserts or skips and never updates; the database decides duplicates via the
  partial unique index on `(user_id, external_source, external_id)`; integer cents
  throughout
- **What changes:** nothing in the CSV path. The sync is a second producer into the same
  tables, and D5's pending replacement is the one place the never-update rule does not hold —
  which is why it lives outside `importFinanceCsvFiles`

### `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/`

- **Relationship:** Extends; supersedes the CSP third-party decision narrowly
- **Relevant decisions:** every mutation takes `userId` and proves ownership; error
  redaction is mandatory at every client boundary and **no** `UserFacingError` hierarchy;
  secrets are environment-only and fail closed
- **What changes:** `frame-src https://teller.io` is added so Teller Connect's iframe
  renders. `connect-src` stays `'self'` — the API is called server-side. Every other
  directive is untouched
- **Note:** that spec is frozen and says further security work opens a delta. This is it

### `agent-os/specs/2026-08-14-1617-statement-cash-flow/`

- **Relationship:** Extends; supersedes two decisions
- **Relevant decisions:** position = last official close ≤ `asOf` plus imported rows after
  it, falling back to the ledger sum when no statement exists; the discrepancy is a
  diagnostic, not a correction
- **What changes:** its "Plaid is out of scope" deferral, and its "no change to the headline
  current-balance rule" — for Teller-linked accounts only. Unlinked accounts keep the
  statement-anchored rule exactly as frozen

### `agent-os/specs/2026-08-14-1524-statement-reconcile/`

- **Relationship:** Extends, unchanged
- **Relevant decisions:** `reconcileAccounts` compares the bank's `opening + activity =
closing` against the register and reports `CoverageHole[]` and `mismatchCents`
- **Why it matters here:** a live feed does not supply statement boundaries, so this keeps
  needing real statements. It is also the trust gate — a synced balance that disagrees with
  the register is exactly what `balanceMismatchCents` should now surface

### `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`

- **Relationship:** Neither — read to establish the boundary
- **Why listed:** it froze "the set-aside figure is a number to read, not a balance the app
  maintains. Envelopes are still the next Finances spec." That is the line this spec stops
  at

## Similar implementations

### `src/lib/google/` — the whole shape to copy

- **Location:** `client.ts`, `sync.ts`, `mirror.ts`, `mutations.ts`
- **Relevance:** the only existing third-party integration with per-user credentials, an
  outbound API, and a refresh story
- **Key patterns:** thin `client.ts` with a class-per-remediation error split
  (`client.ts:18-40`); pure planner (`mirror.ts`) versus untested plumbing (`sync.ts`), the
  split stated at `sync.ts:1-6`; `SyncStatus` discriminated union at `sync.ts:29-37` with
  `off` and `skipped` deliberately distinct so the UI knows whether to offer Refresh;
  `syncWindowIfStale` + `SYNC_MAX_AGE_MS` at `sync.ts:26,188`; per-item failures collected
  rather than thrown (`sync.ts:64-73`)
- **Where it differs:** Better Auth owns Google's token refresh. Teller has no Better Auth
  provider, so this is the first integration that owns its own credential row — a new
  decision, not a pattern to copy

### `src/lib/finances/matchExisting.ts`

- **Location:** `selectNewTransactions` at `:71`, `descriptionsMatch` at `:38`
- **Relevance:** the cross-source dedup that makes D6 free. Reused unchanged
- **Key patterns:** date + signed cents + folded/fuzzy description, occurrence-counted so
  two identical charges on one day both survive. The module comment states the exact reason
  it exists — the fingerprint index cannot see cross-source overlap

### `src/lib/finances/import.ts`

- **Location:** `resolveAccount` at `:74`, the invariants at `:43-57`, the id preference at
  `:405`
- **Relevance:** the contract the sync must honor, and the one line that already anticipates
  a feed-supplied id: `externalId: transaction.externalId ?? ids[i]`
- **Key patterns:** one `db.transaction` per account; `onConflictDoNothing().returning()`
  with the database as duplicate arbiter; chunked inserts

### `src/lib/finances/fingerprint.ts`

- **Location:** the known-limitation note at `:29-31`
- **Relevance:** states that a pending→posted amount change fingerprints twice, and that it
  "does not arise today" only because the CSV feeds are posted-only. A live feed is exactly
  the case that breaks the assumption — D4 and D5 are the answer

### `src/lib/finances/queries.ts`

- **Location:** `listAccounts` at `:47`, the balance derivation at `:128`
- **Relevance:** the seam for D7. `balanceCents = latest ? closing + postCents :
ledgerBalanceCents` becomes a three-source precedence, and `balanceMismatchCents` gains
  its better meaning
- **Caveat:** the LEFT JOIN carries `userId` on both sides on purpose (`:65-67`) — "keeps
  the user scope on both sides of the join rather than trusting the foreign key." Preserve
  that when extending

### `src/db/schema.ts` — `googleContactSyncs` at `:1124`

- **Relevance:** the precedent for a per-integration sync-state table, with the rule stated
  in its doc comment: authoritative integration state does not belong in `user_settings`
- **Key patterns:** `userId` PK, opaque sync token, `lastSyncedAt`

### `src/lib/oauth/` — pieces, not the shape

- **Location:** `origin.ts:17` (`oauthSigningSecret`), `clients.ts:109-145`, `tokens.ts:70`
- **Relevance:** it is an authorization _server_, so there is no client token-storage pattern
  to reuse. What is reusable: the fail-closed env accessor shape, `AbortSignal.timeout`,
  `redirect: "error"`, and timing-safe comparison

### `src/lib/security/safeError.ts` and `csp.ts`

- **Location:** `safeError.ts:31-35`, `csp.ts:39-73`
- **Relevance:** the two files the integration must not fight. Anything with a `code` is
  redacted — so user-facing bank errors are plain `Error`s. `script-src` already has
  `'strict-dynamic'`, so a nonced `next/script` can pull `connect.js` with no host
  allowlist; the iframe is the only thing needing a new directive

### `src/app/actionResult.ts`

- **Location:** `run` at `:70`, `runWithData` at `:99`, `runQuery` at `:120`
- **Relevance:** `userId` is resolved once at the action boundary and passed in; actions
  return `{ ok }` and never throw

## External documentation

Teller's docs are the authority for the API surface; captured here so the shaping is not
re-derived.

- **Environments** — <https://teller.io/docs/guides/environments>. Development connects to
  real institutions with real credentials, free, 100-enrollment cap. Production needs KYB.
- **Authentication** — <https://teller.io/docs/api/authentication>. mTLS is required for all
  requests involving end-user data; the access token is HTTP Basic username with an empty
  password. "Access tokens are useless without a Teller client certificate."
- **Connect** — <https://teller.io/docs/guides/connect>. `https://cdn.teller.io/connect/connect.js`;
  `applicationId`, `environment`, `products`, `onSuccess` → `{ accessToken, enrollment.id,
user.id }`. Re-auth by re-initializing with `enrollmentId`.
- **Transactions** — <https://teller.io/docs/api/account/transactions>. Fields: `id`,
  `account_id`, `date`, `description`, `amount` (signed string), `type`, `status`
  (`posted` | `pending`), `running_balance` (posted only), `details.category`,
  `details.counterparty`, `details.processing_status`. Pagination `count` / `from_id`, plus
  `start_date` / `end_date`. Ids are stable **except** when a pending transaction changes
  substantially on posting, which issues a new id.
- **Balances** — <https://teller.io/docs/api/account/balances>. `ledger` and `available`
  (ledger net pending); at least one is always present. Fetched live from the bank.
- **Accounts** — <https://teller.io/docs/api/accounts>. `id`, `enrollment_id`,
  `institution{id,name}`, `name`, `type` (`depository` | `credit`), `subtype`, `last_four`,
  `currency`, `status`, `links`.
