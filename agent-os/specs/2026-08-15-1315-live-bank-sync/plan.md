# Live bank sync

**Status: active**
Spec folder: `agent-os/specs/2026-08-15-1315-live-bank-sync/`

> Shaped as `2026-08-15-1315-teller-bank-sync` against Teller. Teller withdrew its API in
> early July 2026, before any code was written. The folder was renamed to a vendor-neutral
> slug and the vendor-specific decisions were rewritten for Plaid — see **Changes from
> original plan**. Commit `73c4196` carries the old path in its `Spec:` trailer.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — account
  identity, the insert-or-skip contract, integer-cents discipline.
- **Extends:** `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/` — secrets,
  error redaction, per-user scoping.
- **Supersedes:** `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/` — its
  `connect-src 'self'` / no-third-party-frames CSP decision, **narrowly**, to admit Plaid
  Link. Every other directive stands.
- **Supersedes:** `agent-os/specs/2026-08-14-1617-statement-cash-flow/` — its "Plaid is out
  of scope" deferral, and its "no change to the headline current-balance rule" decision
  **for linked accounts only**. Unlinked accounts keep the statement-anchored rule.

## Context

Every transaction in the register today arrives because Lee downloaded a file and imported
it. That works for the retrospective question ("where has my money been going") and it is
why the reconcile / statement-cash-flow machinery exists. It does not work for the
forward-looking question that actually drives behavior: **"how much do I have available
right now, before the next payday."** Answering that from a file downloaded last Tuesday
means not answering it. This is the failure mode that killed YNAB as a habit — manual entry
gets abandoned, and the tool dies with it.

**Scope is the feed only.** Getting fresh, trustworthy data into the register is a
self-contained deliverable. The "available to spend before payday" view is a follow-on spec
that should be designed against real fresh data rather than imagined ahead of it — and it
collides with envelopes, which the roadmap already names as **Next** under § Financial
planning.

Capital One and Chase are the whole target. Coinbase is closed and out of the picture;
Amazon order history stays a manual data request, because it answers the historical
question and has no API at any price.

## Decisions

**D1 — Plaid, Trial plan.** Free, real production data, capped at **10 Production Items**
for teams created on or after 2026-04-15. Chase and Capital One are both explicitly
included in the Trial plan's OAuth institution access, as are the Balance and Transactions
products. Two Items is the steady-state need.

**The cap is permanent, not a rolling allowance: `/item/remove` does not free a slot.** All
development happens in Sandbox; Production Items are created only when the flow is known to
work. Burning slots on repeated test enrollments is the one way to run out.

Rejected: **Teller**, which was the original choice and withdrew its API in early July 2026
— its docs remain online, which is how it looked viable during shaping. **SimpleFIN**
($15/yr) refreshes daily and fails the "refresh at any time" requirement; it stays the
fallback if Plaid's Trial terms change. **OFX Direct Connect** is dead at both banks.

**D2 — Plaid accounts link to existing `finance_accounts` rows; they do not create new
ones.** Account identity is `(userId, externalSource, externalKey)`, so syncing under a new
feed would silently fork every account into a CSV twin and a live twin. Two new tables
instead — `plaidItems` (access token, `itemId`, institution, sync cursor, `lastSyncedAt`)
and `plaidAccountLinks` (Plaid `account_id` → `finance_accounts.id`, plus the live balance
snapshot). `finance_accounts.externalSource` is never rewritten, so re-importing an old CSV
still resolves to the same row. Follows the `googleContactSyncs` precedent
(`src/db/schema.ts:1124`): authoritative integration state gets its own table, not
`user_settings`.

Link candidates are pre-matched on Plaid's `mask` (last four) against `externalKey`, but the
user confirms each one. A wrong auto-link merges two real accounts and is near-impossible to
unpick.

**D3 — `FinanceFeed` gains `api:plaid`** (`src/lib/finances/types.ts:8`). Its doc comment
already anticipates exactly this: "a later Plaid or SimpleFIN sync should be a new member
here and nothing else." Synced rows carry `externalSource: "api:plaid"` and
`externalId: <plaid transaction_id>`. `import.ts:405` already prefers a feed-supplied id
over a computed fingerprint, so Plaid's ids bypass `fingerprint.ts` entirely.

**D4 — A real `pending` boolean on `finance_transactions`.** Not an overload of nullable
`postedDate`, which already means "this feed does not supply one" — true of every Chase
statement.

**D5 — `/transactions/sync` deltas are applied literally.** The endpoint returns `added`,
`modified` and `removed` against a stored cursor, so the sync inserts, updates and deletes
exactly what Plaid says changed rather than inferring it. A posted transaction carries
`pending_transaction_id` pointing at the pending row it replaced — so pending→posted is a
**resolved link, not a heuristic match**, and the restaurant-tip case that
`fingerprint.ts:29` names as its known unhandled limitation is answered outright.

This **deliberately breaks the CSV importer's "insert or skip, never update" invariant**
(`import.ts:43-57`). It therefore lives in a separate `syncPlaidItem` path and must not be
folded into `importFinanceCsvFiles`. User edits to a row that Plaid later modifies or
removes do not survive — acceptable for pending rows, and the reason `modified` must not be
allowed to clobber user-owned `category` and `notes` on a **posted** row.

**D5a — Capital One supplies no pending transactions, and only 90 days of history.** This is
a source-side limitation, documented by Plaid, and would be identical under any aggregator.
Pending is therefore a **Chase-only** capability. The 90-day window is harmless because
full history already exists from statements, but the initial sync cannot backfill the card.

**D5b — Plaid `amount` is negated on the way in, uniformly.** Confirmed against Sandbox
payloads: 42 of 48 transactions carry a positive `amount`, and the negatives are exactly the
inflows (a −500 airline refund, a −4.22 interest payment). Positive = money out, on both
depository and credit accounts, so `mapping.ts` negates without branching. Amounts arrive as
JSON floats and must go through `money.ts` rather than `* 100`.

**D5c — Chase supports `transactions_refresh`; Capital One does not.** Confirmed from
`/institutions/get_by_id`, which costs no Item. `/transactions/refresh` forces an immediate
pull from the institution; without it, Capital One's transactions arrive on Plaid's own
cadence, roughly daily, and the refresh button cannot make them appear sooner.

The card's **balance** is still live on demand — `balance` is supported — so "what do I have
available" holds for both banks. It is the card's transaction list that lags. Together with
D5a this means the Capital One card is materially less live than Chase, and the UI must not
imply otherwise: a refresh that silently no-ops on one account reads as a bug.

**Verified in Sandbox (Task 2), so the implementation may rely on it:** a second
`/transactions/sync` with the stored cursor returns `added: 0, modified: 0, removed: 0,
has_more: false`. That is the mechanism behind "refresh twice inserts nothing."

**Not verifiable in Sandbox:** the pending→posted transition. A pending row arrives with
`pending: true` and `pending_transaction_id: null` — the link appears on the **posted** row
that later replaces it, and Sandbox time cannot be advanced to produce one. D5 relies on
that field, so it must be confirmed against real Chase data over a day or two before the
pending path is called done.

**D6 — Cross-source dedup reuses `selectNewTransactions`** (`matchExisting.ts:71`)
unchanged — date + signed cents + fuzzy `descriptionsMatch`, occurrence-counted. It was
built for exactly this ("the index will not recognise overlap"). Because D2 puts synced rows
on the _same_ account row, a later Chase statement import skips what Plaid already synced
**for free**, with no new code.

**D7 — Live balance becomes the headline for linked accounts.** `FinanceAccountRow`
(`types.ts:146`) already models headline-vs-ledger with a mismatch delta; the synced balance
slots in as a third source ahead of statement-closing. `balanceMismatchCents` then reads as
register-vs-bank drift, which is the number that says whether the register is complete.

Refresh must call **`/accounts/balance/get`**, which forces a live fetch from the
institution. The `balances` object returned by `/accounts/get` and `/transactions/sync` is
**cached** — using it would quietly reintroduce the staleness this spec exists to remove.

**D7a — The balance mapping branches on account type; the transaction mapping does not.**
Confirmed against Sandbox payloads:

| Plaid `type` | `current`       | `available`                  | Register balance |
| ------------ | --------------- | ---------------------------- | ---------------- |
| `depository` | funds held      | funds net pending            | `+current`       |
| `credit`     | **amount owed** | remaining credit, often null | `−current`       |

A card reporting `current: 410` means $410 **owed**, and storing that unbranched would make
the card read as a $410 asset — matching the module-sign convention `financeStatements`
already uses, where a card's New Balance is stored negative. `available` is **not** a
drop-in headline: it is null on one Sandbox card and means remaining credit on the other,
so `current` is the field that carries the balance and `available` is only meaningful for
depository accounts.

Transactions need no such branch — negation is uniform across both types (D5b).

**D8 — Manual refresh button plus a stale-on-load throttle. No scheduler.** Copies
`syncWindowIfStale` / `SYNC_MAX_AGE_MS` (`src/lib/google/sync.ts:26,188`) and the
`SyncStatus` discriminated union. A cron would be the first scheduler in this repo and
deserves its own decision — and it buys nothing here, because the data only needs to be
fresh at the moment Lee opens the app.

**D9 — Sync triggers `reclassifyTransactions` when it inserted anything.** Synced rows land
with `derivedFlow = null` like every imported row. Query-time `effectiveFlow` fallbacks
(`analytics.ts:94`) mean nothing is broken if it does not run, but leaving a manual button
in the loop reintroduces exactly the manual step this spec exists to delete.

Plaid's own `personal_finance_category` and `merchant_name` are **not** adopted. The
existing classifier is tuned to this register, and a second categorisation authority would
make `effectiveCategory`'s fallback chain ambiguous. `merchant_name` may be reconsidered
later as a `merchant.ts` hint; not in this spec.

**D10 — CSP delta.** `script-src` already carries `'strict-dynamic'`, so
`link-initialize.js` loaded from a nonced `next/script` needs no host allowlist. Plaid
Link's **iframe** does: `frame-src https://cdn.plaid.com` must be added to
`src/lib/security/csp.ts`, which currently falls through to `default-src 'self'` and would
silently render a blank modal.

**D11 — Plain `fetch`; no mTLS, no new dependency.** Plaid authenticates with `client_id`
and `secret` in the request body over ordinary HTTPS. Both are environment-only, read
through a fail-closed accessor in the shape of `oauthSigningSecret()`
(`src/lib/oauth/origin.ts:17`), documented in `.env.example`. Neither is ever logged, and
neither reaches the browser — Link is initialised from a server-minted `link_token`.

**D12 — Error classes mirror `src/lib/google/client.ts`.** Critical trap: `safeError.ts:31`
redacts any error carrying a `code`, and Plaid's error envelope has `error_code` alongside
Node's network `code`. `ITEM_LOGIN_REQUIRED` must surface as "reconnect your bank", thrown
as a plain `Error` with no `code`, the way `GoogleNotLinkedError` is.

### Out of scope

- Available-to-spend / safe-to-spend / envelopes — the next Finances spec.
- Retiring statement or CSV imports. Statements remain the reconciled system of record;
  `reconcile.ts` and `statementCashFlow.ts` still need real statement boundaries.
- Plaid products beyond Transactions and Balance — no Auth, Identity, Liabilities,
  Investments, Assets, Statements. Adding a subscription product during the Trial incurs
  charges on any later upgrade.
- Adopting Plaid's categorisation as an authority (see D9).
- Amazon, PayPal, Coinbase.
- Any scheduled or background refresh.

## Acceptance criteria

- [ ] Chase and Capital One enroll through Plaid Link and produce a stored Item.
- [ ] Each Plaid account is linked to its existing `finance_accounts` row by confirmation,
      pre-matched on mask. No duplicate accounts appear in the register.
- [ ] A refresh pulls transactions and a **live** balance; the headline balance for a linked
      account matches what the bank's own app shows.
- [ ] The Capital One card's headline balance is **negative** (owed), not a positive asset.
- [ ] Re-running a refresh inserts nothing new.
- [ ] Importing a Chase statement CSV that overlaps already-synced dates inserts nothing new.
- [ ] A Chase pending transaction that posts ends up as exactly one posted row, not two,
      resolved via `pending_transaction_id`.
- [ ] Pending rows are visibly distinct in the register.
- [ ] A `modified` delta does not overwrite user-owned `category` or `notes` on a posted row.
- [ ] Newly synced rows are classified without pressing Reclassify.
- [ ] A second user cannot read, refresh, relink, or delete the first user's Item.
- [ ] An `ITEM_LOGIN_REQUIRED` Item surfaces "reconnect", not "Something went wrong."
- [ ] No more than 2 Production Items have been consumed.
- [ ] `npm run smoke` passes; `/finances`, `/finances/register`, `/settings` all render.

## Changes from original plan

| #   | Change                                                                                                                                                    | Why                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Vendor switched from Teller to Plaid; folder renamed `teller-bank-sync` → `live-bank-sync`. D1, D2, D3, D10, D11, D12 rewritten.                          | Teller withdrew its API in early July 2026, before any code was written. Its documentation is still online, which is why it read as viable during shaping. Slug made vendor-neutral so a third switch is a content edit.      |
| 2   | D5 replaced: "pending rows are a replaceable set" → "apply `/transactions/sync` deltas literally, resolving pending→posted via `pending_transaction_id`." | Plaid supplies the link explicitly. The original design was a heuristic invented to work around Teller reissuing ids; it is strictly worse than using the answer the API gives.                                               |
| 3   | D5a added: pending is Chase-only; Capital One supplies no pending data and only 90 days of history.                                                       | Source-side limitation documented by Plaid, identical under any aggregator. Materially narrows the "matches your bank app" criterion for the card, so it is stated rather than discovered.                                    |
| 4   | D7 tightened to require `/accounts/balance/get`.                                                                                                          | The `balances` object on `/accounts/get` and `/transactions/sync` is cached and can be a day or more stale — it would silently reintroduce the exact problem this spec exists to remove.                                      |
| 5   | D11 inverted: mTLS via `node:https` → plain `fetch` with `client_id`/`secret`.                                                                            | Plaid needs no client certificate. Removes the one genuinely unprecedented piece of infrastructure in the original plan.                                                                                                      |
| 6   | D9 extended to reject Plaid's `personal_finance_category` as a classification authority.                                                                  | A second authority would make `effectiveCategory`'s fallback chain ambiguous. Not a question the original plan had to answer, because Teller's enrichment was thinner.                                                        |
| 7   | Task 2 spike narrowed to Sandbox; sign convention moved out of it into D-known facts.                                                                     | Plaid documents `amount` as positive = money out, the inverse of this register's rule. That was a spike question under Teller; it is now a documented fact and belongs in `mapping.ts` tests.                                 |
| 8   | **D7a added: the balance mapping branches on account `type`.** New acceptance criterion that the card's headline balance is negative.                     | Found in the Task 2 Sandbox run. A credit account's `current` is the amount **owed**, so an unbranched mapping would show the Capital One card as a positive asset. D7 as written did not branch and would have shipped that. |
| 9   | D5b added: negation confirmed uniform across account types; amounts arrive as JSON floats.                                                                | Task 2 measured it — 42/48 positive, negatives exactly the inflows. Removes the risk from the detail shape.md calls highest-risk, and fixes cents conversion as a `money.ts` concern rather than a `* 100`.                   |
| 10  | D5 caveat recorded: `pending_transaction_id` could not be verified in Sandbox.                                                                            | A pending row carries `pending: true` and a **null** link; the link appears on the posted row that replaces it, and Sandbox time cannot be advanced. D5 depends on it, so it stays unverified until real Chase data lands.    |
| 11  | D5c added: Chase supports `transactions_refresh`, Capital One does not. Task 4 adds `/transactions/refresh` to the client surface.                        | Found via `/institutions/get_by_id`, which costs no Item. The refresh button cannot force new transactions on the card — only a new balance. The UI has to say so rather than appear broken.                                  |

---

## Task 1: Save spec documentation

Done — this folder. Amended in place for the vendor change per the standing rule.

## Task 2: Sandbox spike — gate everything on this

### 2a. Sandbox — **done 2026-08-15**

`/sandbox/public_token/create` mints a token with no Link widget and no browser, so this ran
headlessly and consumed **no Production Items**. Settled:

- ✅ Token mint → `/item/public_token/exchange` round-trip, `client_id`/`secret` only.
- ✅ `/accounts/get` carries `mask`, `type`, `subtype`. Types beyond the expected three
  appear (`investment/ira`, `loan/mortgage`), all of which `financeAccountKindEnum` covers.
- ✅ `/accounts/balance/get` — and it forced **D7a**: `current` on a credit account is the
  amount owed, `available` is remaining credit and is sometimes null.
- ✅ `/transactions/sync` cursor is idempotent: a second call with the stored cursor returns
  `added: 0, modified: 0, removed: 0, has_more: false`.
- ✅ Sign convention — **D5b**. 42/48 positive, negatives exactly the inflows.
- ✅ Pending rows render (`pending: true`) via a custom Sandbox user with a future
  `date_posted`. Payload captured as a fixture.
- ❌ **`pending_transaction_id` could not be verified.** It is null on the pending row; the
  link lives on the posted row that replaces it, and Sandbox time cannot be advanced.

Two traps worth keeping, since both cost a run: a custom-user config needs `version` as a
**number** (a quoted `"1"` returns `INVALID_CREDENTIALS`, which says nothing about the
credentials), and the first `/transactions/sync` can return empty with `has_more: false`
while Plaid is still generating data — so the poll must loop on row count, not `has_more`.

### 2b. Production — outstanding

One Production Item against Chase, then Capital One. Confirm the real institutions behave as
Sandbox did, and specifically that a Chase pending charge posts with a populated
`pending_transaction_id`.

**Stop and reassess if an institution fails.**

## Task 3: Schema

**Done 2026-08-15** — `drizzle/0041_previous_thunderbolt.sql`.

Migration adding `plaidItems`, `plaidAccountLinks`, and
`finance_transactions.pending boolean not null default false`. Both new tables `userId`-scoped
with cascade delete; the sync cursor lives on `plaidItems`. Add `api:plaid` to `FinanceFeed`,
`FINANCE_FEEDS`, `FEED_LABELS`.

Note: `BankCsvFeed` in `formats.ts` was `Exclude<FinanceFeed, "csv:coinbase">`, so a new feed
member silently joined the set of formats expected to have a header row. Now excludes
`api:plaid` explicitly — the typecheck caught it, which is the point of that `Record`.

Registering the query module in `src/lib/db/crossUserReads.integration.test.ts` moved to
**Task 7**: that sweep imports real query functions, which do not exist until then.

## Task 4: `src/lib/plaid/client.ts` — outbound calls

Plain `fetch` against the Plaid API with `client_id`/`secret` from a fail-closed env
accessor. `/link/token/create`, `/item/public_token/exchange`, `/accounts/get`,
`/accounts/balance/get`, `/transactions/sync`, and `/transactions/refresh` (Chase only, per
D5c). Error classes per D12, mapping `error_code`
(especially `ITEM_LOGIN_REQUIRED`) to a remediation. Thin and effectively untested by design,
mirroring `src/lib/google/client.ts`. No Plaid SDK — the surface used here is five endpoints.

## Task 5: `src/lib/plaid/mapping.ts` — pure, fully tested

Plaid account → `ParsedAccount`; Plaid transaction → `ParsedTransaction` + `pending`.
**Sign inversion is the load-bearing detail**: Plaid `amount` is positive = money out, this
register is positive = money in, on both depository and credit accounts. Float dollars →
integer cents via `money.ts`. Mask → `externalKey` match candidates. A pure `planSync` that
turns `added`/`modified`/`removed` plus `pending_transaction_id` into row operations, with
the rule that a `modified` posted row never touches user-owned `category` or `notes`. The
Task 2 payloads are the fixtures.

## Task 6: `src/lib/plaid/sync.ts` — the sync itself

`syncItem(userId, itemId)` and `syncIfStale(userId)`. Per Item: page `/transactions/sync`
until `has_more` is false, apply `planSync`'s operations, call `/accounts/balance/get` for
linked accounts, persist the new cursor and `lastSyncedAt` **in the same transaction as the
rows** so a crash cannot advance the cursor past unapplied data. `selectNewTransactions`
guards the first sync against rows already present from statements. `SyncStatus` union;
per-Item failures collected, never thrown. Calls `reclassifyTransactions` if anything was
inserted.

## Task 7: `src/lib/plaid/mutations.ts` + `queries.ts`

`userId`-first, ownership proved before every write, in the shape of `requireTransaction`
(`finances/mutations.ts:29`). Store Item, link/unlink accounts, delete Item.
`*.integration.test.ts` including the full cross-user battery, **and** register the new query
functions in `src/lib/db/crossUserReads.integration.test.ts` (moved here from Task 3).

## Task 8: Balance seam

Extend `listAccounts` (`queries.ts:47`) so a fresh Plaid snapshot outranks statement-closing
as `balanceCents`, with `balanceMismatchCents` becoming register-vs-bank drift (D7). Surface
the snapshot age — a stale balance presented as live is worse than no balance.

## Task 9: CSP + Plaid Link UI

`frame-src https://cdn.plaid.com` in `src/lib/security/csp.ts` with a doc comment explaining
the concession, plus its unit test. A settings-page client component loading
`https://cdn.plaid.com/link/v2/stable/link-initialize.js` via nonced `next/script`,
initialised from a server-minted `link_token`, POSTing the `public_token` to a server action
that exchanges it. Re-auth path mints a link token in update mode for the existing Item.

## Task 10: Register UI

Refresh button with `SyncStatus` states, last-synced timestamp, pending rows visibly
distinct, account-link confirmation screen. Reconnect prompt on `ITEM_LOGIN_REQUIRED`.
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

Automated gates cannot prove this one works. The whole feature is an outbound call to a
third party plus a browser widget, and the test suite evaluates neither.

1. **Pure logic** — `npm run test:unit`. `mapping.ts` carries the real reasoning (sign
   inversion, cents, pending resolution, the modified-row rule) and gets real Plaid payloads
   as fixtures.
2. **Database** — `npm run test:integration` with Postgres up. Watch for the skip warning.
   Cross-user battery on every new mutation.
3. **Live** — enroll both banks, refresh, compare the headline balance against the Chase and
   Capital One apps side by side. Refresh twice; the second must insert nothing.
4. **Overlap** — import a Chase statement CSV covering already-synced dates. Must insert
   nothing.
5. **Pending** — let a real Chase pending charge post over a day or two; confirm one row,
   not two. Capital One will show none, by D5a.
6. **Routes** — `npm run smoke` against a running dev server.
