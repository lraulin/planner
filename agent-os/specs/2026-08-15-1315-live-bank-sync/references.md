# References for Live bank sync

## Governing specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends
- **Relevant decisions:** account identity is `(externalSource, externalKey)` and never the
  name; import inserts or skips and never updates; the database decides duplicates via the
  partial unique index on `(user_id, external_source, external_id)`; integer cents
  throughout
- **What changes:** nothing in the CSV path. The sync is a second producer into the same
  tables, and D5's application of `modified` / `removed` deltas is the one place the
  never-update rule does not hold — which is why it lives outside `importFinanceCsvFiles`

### `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/`

- **Relationship:** Extends; supersedes the CSP third-party decision narrowly
- **Relevant decisions:** every mutation takes `userId` and proves ownership; error
  redaction is mandatory at every client boundary and **no** `UserFacingError` hierarchy;
  secrets are environment-only and fail closed
- **What changes:** `frame-src https://cdn.plaid.com` is added so Plaid Link's iframe
  renders. `connect-src` stays `'self'` — the API is called server-side. Every other
  directive is untouched
- **Note:** that spec is frozen and says further security work opens a delta. This is it

### `agent-os/specs/2026-08-14-1617-statement-cash-flow/`

- **Relationship:** Extends; supersedes two decisions
- **Relevant decisions:** position = last official close ≤ `asOf` plus imported rows after
  it, falling back to the ledger sum when no statement exists; the discrepancy is a
  diagnostic, not a correction
- **What changes:** its "Plaid is out of scope" deferral, and its "no change to the headline
  current-balance rule" — for linked accounts only. Unlinked accounts keep the
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
- **Where it differs:** Better Auth owns Google's token refresh. Plaid has no Better Auth
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
  `'strict-dynamic'`, so a nonced `next/script` can pull `link-initialize.js` with no host
  allowlist; the iframe is the only thing needing a new directive

### `src/app/actionResult.ts`

- **Location:** `run` at `:70`, `runWithData` at `:99`, `runQuery` at `:120`
- **Relevance:** `userId` is resolved once at the action boundary and passed in; actions
  return `{ ok }` and never throw

## External documentation

Plaid's docs are the authority for the API surface; captured here so the shaping is not
re-derived.

- **Trial plan** — <https://plaid.com/docs/account/billing/>. Free for US/Canada teams
  created on or after 2026-04-15. **10 Production Items, and `/item/remove` does not free a
  slot.** Bundles Auth, Transactions (+ Refresh), Balance, Identity, Assets, Liabilities,
  Investments, Statements. Trial OAuth access covers Chase **and Capital One**, plus BoA,
  Wells Fargo, Citi, Navy Federal, PNC, US Bank, Amex. Caveat: adding a subscription product
  (Transactions, Liabilities, Investments) during the Trial bills on any later upgrade.
- **`/transactions/sync`** — <https://plaid.com/docs/api/products/transactions/>. Cursor
  model returning `added` / `modified` / `removed` plus `next_cursor` and `has_more`; a
  fully-drained cursor stays valid at least a year. Transaction fields: `transaction_id`,
  `account_id`, `date`, `authorized_date`, `name` (raw), `merchant_name` (cleaned),
  `amount` (**positive = money out**), `pending`, `pending_transaction_id`,
  `personal_finance_category`. Transactions are explicitly **not immutable** and can be
  removed by the institution — which is why the deltas are applied literally.
- **Balance** — <https://plaid.com/docs/balance/>. `/accounts/balance/get` forces a live
  fetch from the institution. The `balances` object on `/accounts/get` and
  `/transactions/sync` is **cached** — an Item with Transactions refreshes it about once a
  day, an Auth-only Item as rarely as every 30 days.
- **Capital One limitations** —
  <https://support.plaid.com/hc/en-us/articles/25286986638231-Are-pending-transactions-returned-for-Capital-One-accounts>.
  No pending transactions, and only 90 days of history. Source-side; identical under any
  aggregator.
- **Link** — <https://plaid.com/docs/link/>. `link-initialize.js` from `cdn.plaid.com`,
  initialised with a server-minted `link_token`; `onSuccess` yields a `public_token`
  exchanged server-side via `/item/public_token/exchange`. Re-auth uses a link token in
  update mode against the existing Item.
- **Item errors** — <https://plaid.com/docs/errors/item/>. `ITEM_LOGIN_REQUIRED` is the
  reconnect signal.

### Teller (rejected — API withdrawn)

Teller was the original choice and its documentation is **still online**, as is its
marketing site advertising the service. It withdrew the API in early July 2026
(<https://news.ycombinator.com/item?id=48841633>), citing an inability to attract large
customers. Recorded here so the next reader does not re-derive the same dead end from docs
that still read as current.
