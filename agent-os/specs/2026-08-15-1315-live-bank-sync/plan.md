# Live bank sync

**Status: frozen / complete** (2026-08-25)
Spec folder: `agent-os/specs/2026-08-15-1315-live-bank-sync/`

This is the as-built record of the **SimpleFIN** feed. Teller and Plaid were abandoned
before the feed shipped. Available-to-spend, Capital One pending scrape, and Chase
pending scrape are later specs built on this one. Further change opens a new delta-spec.

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

**D1 — SimpleFIN Bridge, $15/year.** Both banks confirmed supported by name. One access
URL covers every institution the user adds, so there is no per-bank enrollment and no
per-bank cap.

**Plaid was chosen first and abandoned once the account's real terms were known.** The
Trial plan requires a team created on or after 2026-04-15; this contract dates from
2025-09-14, so it never applied. The actual rate card, read from the dashboard:

| Item                 | Rate                      |
| -------------------- | ------------------------- |
| Transactions         | $0.30 per item / month    |
| Transactions Refresh | $0.12 per successful call |
| Balance              | $0.10 per call            |

D7 calls `/accounts/balance/get` once per connection per refresh, so a refresh costs
$0.20 in balance calls plus $0.12 to force Chase's transactions. Against SimpleFIN's flat
$15/year, **break-even is roughly twice a month** — and a daily refresh runs about
$124/year. The metered product is precisely the one the requirement asks for: "refresh at
any time" is billed per look.

On top of the money, Chase and Capital One are OAuth institutions, which need OAuth
registration (app name, logo, user-facing details), a security questionnaire about how the
_company_ protects customer data, and **2–4 weeks of bank review** — for a personal tool
reading its owner's own two accounts.

What is given up: Chase's live balance and forced transaction refresh. Everything else was
already daily. Kept as the fallback if SimpleFIN's data proves too stale to act on; the
OAuth registration can run in parallel at no cost, since the wait is the same whenever it
starts.

**D2 — Synced accounts link to existing `finance_accounts` rows; they do not create new
ones.** Account identity is `(userId, externalSource, externalKey)`, so syncing under a new
feed would silently fork every account into a CSV twin and a live twin. Two tables instead,
named for the concept rather than the vendor since this is the third vendor:

- `bankConnections` — one row per SimpleFIN access URL.
- `bankAccountLinks` — SimpleFIN account id → `finance_accounts.id`, plus the balance
  snapshot.

`finance_accounts.externalSource` is never rewritten, so re-importing an old CSV still
resolves to the same row. Follows the `googleContactSyncs` precedent: authoritative
integration state gets its own table, not `user_settings`.

**One connection covers every bank**, unlike Plaid's one-Item-per-institution. The
SimpleFIN bridge is the account; Chase and Capital One are both reached through the same
access URL, and adding a third bank is done at SimpleFIN, not here.

Link candidates are pre-matched on the trailing digits of SimpleFIN's account name against
`externalKey`, but the user confirms each one. A wrong auto-link merges two real accounts
and is near-impossible to unpick.

**D3 — `FinanceFeed` gains `api:simplefin`** (`src/lib/finances/types.ts:8`). Its doc
comment anticipated exactly this: "a later Plaid or SimpleFIN sync should be a new member
here and nothing else." Synced rows carry `externalSource: "api:simplefin"` and
`externalId: <simplefin transaction id>`. `import.ts:405` already prefers a feed-supplied id
over a computed fingerprint, so those ids bypass `fingerprint.ts` entirely.

The feed name stays **vendor-specific on purpose** even though the module and tables are
vendor-neutral: it is provenance, and a row synced by SimpleFIN should still say so after a
later switch.

**D4 — A real `pending` boolean on `finance_transactions`.** Unchanged. SimpleFIN carries
`pending` on a transaction and `posted: 0` while unposted.

**D5 — The fetched window is reconciled; there are no deltas.** SimpleFIN has no cursor and
no `added`/`modified`/`removed`. Each sync asks for a date window and gets the current truth
for it, so the sync compares that against what it holds:

- ids not stored → insert
- ids stored and changed → update Plaid-owned columns only
- **stored pending rows absent from the window → delete**

That last rule is the one carrying weight. **SimpleFIN has no equivalent of Plaid's
`pending_transaction_id`**, so a pending row that posts cannot be resolved by a link; it
simply appears as a new posted id while the pending id vanishes. Treating the pending set as
replaceable each fetch is what keeps the two from coexisting and double-counting. This is
the design the Teller draft had, discarded when Plaid offered the explicit link — and now
correct again, because the link is gone.

Known consequence, the same one Actual Budget hit: a pending row that never posts _and_ stops
being reported disappears rather than being reconciled. Acceptable, because pending rows are
transient by definition and the window is re-fetched every sync.

This **deliberately breaks the CSV importer's "insert or skip, never update" invariant**
(`import.ts:43-57`), so it lives outside `importFinanceCsvFiles`, and a `modified` row must
never clobber user-owned `category` or `notes`.

**D5a — Pending depends on the institution, not the vendor.** SimpleFIN excludes pending
unless `pending=1` is passed, which the client always does. Whether a given bank supplies
them is upstream and unchanged by the vendor switch: Capital One does not, so pending stays
a Chase capability.

**D5b — SimpleFIN amounts are stored as-is. No negation.** The protocol states "positive
values indicate deposits", which is exactly this register's rule — the inverse of Plaid,
where positive meant money out. **This is the single highest-risk line in the whole
switch**: the previous vendor required a negation and this one requires its absence, so
carrying the old code forward silently inverts every amount. Tested explicitly in both
directions.

Amounts arrive as decimal **strings**, not floats, so `parseAmountCents` reads them directly
and the float-precision problem Plaid created does not arise.

**D5c — There is no forced refresh.** SimpleFIN updates on its own roughly daily cadence and
offers nothing equivalent to `/transactions/refresh`. The refresh button re-reads what
SimpleFIN currently holds; it cannot make a bank hand over something newer. The UI must say
so plainly rather than implying a button makes data appear.

**D6 — Cross-source dedup is the sync's own matcher, not the CSV importer's, and the first
sync does not backfill.** Both halves were forced by measurement against real accounts, and
the original design — reuse `selectNewTransactions`, fetch 89 days on first sync — produced
**217 candidate rows of which only 16 were genuinely new**.

Two ways a live feed and a bank statement disagree, neither guessable:

1. **Dates are off by a day or two.** The aggregator reports when the merchant authorised
   the charge; the statement records the bank's own transaction date. 176 of the 217 rows
   differed by exactly one day with byte-identical descriptions, and an exact-date rule
   matched none of them.
2. **Descriptions get wrapped.** The Capital One 360 export writes
   `Withdrawal from RENT:RAULIN RENT:RAULI` where the feed says `RENT:RAULIN`.
   `descriptionsMatch` wants a prefix; here the feed's text sits in the middle.

So `finances/liveFeedMatch.ts` matches on **exact amount, ±2 days, and description
containment above a length floor**. `matchExisting.ts` is left alone — it serves CSV-to-CSV
dedup, which works, and loosening it would loosen that too.

**It applies in both directions, and the second one is the trap.** A sync compares the
provider's rows against what statements already wrote. An import compares statement rows
against what the sync already wrote — and that happens weeks later, when a statement covering
already-synced days finally arrives. `import.ts` therefore tags each existing row with
whether a live feed wrote it and compares tolerantly only against those; a row from a file is
still matched exactly, so nothing about CSV-to-CSV dedup changes. Both halves of that — the
tag and the widened lookup range — are covered by integration tests that fail when either is
removed.

**The first sync anchors to the newest row already on file**, not to the provider's maximum
history. The register holds complete history from statements; re-fetching it only gives the
matcher work, and every row it misses is a duplicate. With the anchor the same real run
produced 16 inserts, all dated after the newest existing row.

**The comparison window reaches back further than the fetch window**, by at least the date
tolerance. Loading existing rows from the fetch start hides statement rows dated a day or two
earlier, which duplicates every transaction on the boundary — three did, on the first real
run. `syncWindow()` is a pure function for exactly this reason: the relationship between the
three dates is the part that was wrong and is invisible when it is.

Error direction is chosen deliberately throughout: a missed match inserts a duplicate, which
is visible and deletable; an over-eager match drops a real transaction, which is invisible.
`fingerprint.ts` already names the latter as the worse outcome.

**D7 — The synced balance leads for linked accounts.** `FinanceAccountRow` already models
headline-vs-ledger with a mismatch delta; the synced balance slots in ahead of
statement-closing, and `balanceMismatchCents` reads as register-vs-bank drift.

**D7a — SimpleFIN's `balance` is already in module sign, so it is stored as-is.** Positive
means money held, which makes a credit-card balance negative without a branch — the opposite
of Plaid, where a card's `current` was the amount owed and had to be negated. `available-balance`
is optional and stored where present.

**Unverified until the first real sync**, and the thing to check first: that a credit card
does come back negative. If a card reports positive, the mapping needs the branch back. The
integration test asserts pass-through, so a change here is a deliberate edit, not a drift.

**D7b — `balance-date` is what gets stored, not the request time.** SimpleFIN states when
each balance was true, and stamping a day-old figure with "now" is the lie this feature
exists to stop telling. Carried over from the Plaid design unchanged in spirit.

**D8 — Manual refresh button plus a stale-on-load throttle. No scheduler.** Unchanged, and
cheaper to justify now: there is no per-call charge, so refreshing costs nothing but a
request against the 24/day allowance. Windows are capped at **45 days**, not the protocol's
90: a wider request comes back with "Requested date range exceeds recommended range of 45
days. In the future, this may be capped."

**D8a — `available-balance` is unusable and must not be built on.** Every account came back
with `available-balance: 0`, including a checking account holding $571.45. It is stored as
reported but nothing reads it. The follow-on available-to-spend spec has to derive that
figure from the balance and pending rows, not from this field.

**D9 — Sync triggers `reclassifyTransactions` when it inserted anything.** Unchanged.

**D10 — The CSP concessions are reverted in full.** SimpleFIN has no browser widget: the user
pastes a setup token into a form and the server does the rest. So `frame-src` is removed
entirely and `connect-src` goes back to `'self'`.

This **un-supersedes** the security-hardening spec's `connect-src 'self'` decision, which
now stands unmodified. The one change in this spec that enlarged the attack surface is gone,
and that is a genuine argument for SimpleFIN independent of cost: nothing third-party runs
in the page.

**D11 — Plain `fetch` with HTTP Basic auth.** The access URL embeds credentials as
`scheme://user:pass@host`; the client splits them out and sends an `Authorization` header
rather than leaving them in a URL that could reach a log. Environment holds nothing —
**the access URL is per-user data and lives in the database**, unlike Plaid's app-wide
`client_id`/`secret`. There is consequently nothing to add to `.env.example`.

**D12 — Error classes as before.** `safeError.ts:31` still redacts anything carrying a
`code`, so user-facing errors stay plain `Error`s. SimpleFIN's mapping: **403** on `/accounts`
means the access URL was revoked → reconnect; **402** means the subscription lapsed →
a distinct message, since paying is a different remedy from re-authenticating; `errlist`
entries are per-connection problems that must surface without failing the whole sync.

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

## Acceptance criteria (as built — SimpleFIN)

Plaid Link, Production Items, and `pending_transaction_id` were abandoned with the vendor
switch (change 16). The criteria below are the SimpleFIN contract that shipped.

- [x] Chase and Capital One enroll through one SimpleFIN setup-token paste. They link to
      existing `finance_accounts` rows; they do not create duplicates.
- [x] Each SimpleFIN account is linked by confirmation, pre-matched on trailing last-4.
- [x] A refresh re-reads SimpleFIN's current 45-day window and a `balance-date` snapshot.
      There is no forced refresh (D5c); the UI must not imply the button makes data appear.
- [x] The Capital One card headline is **negative** (owed) and its age is the provider's
      `balance-date`, not the request time.
- [x] Re-running a refresh inserts nothing new.
- [x] Importing a statement CSV that overlaps already-synced dates inserts nothing new
      (tolerant live-feed match in both directions).
- [x] Stored SimpleFIN pending absent from the window is deleted. Pending rows are
      excluded from cross-source comparison so a posted replacement is not skipped. There
      is no `pending_transaction_id`.
- [x] Pending rows are visibly distinct in the register (Pending badge in the Posted
      column; unweighted amount).
- [x] An update of a live row does not overwrite user-owned `category` or `notes`.
- [x] Newly synced rows are classified without pressing Reclassify.
- [x] A second user cannot read, refresh, relink, or delete the first user's connection.
      `listConnections` / `listLinks` are in `crossUserReads.integration.test.ts`.
- [x] 403 on `/accounts` surfaces reconnect; 402 surfaces a lapsed subscription.
- [x] First real sync against the live file inserted 16 genuinely new rows; the rest
      already existed from statements.
- [x] `npm run smoke` passes; `/finances`, `/finances/register`, `/settings` all render.

Capital One pending is not on the SimpleFIN feed (D5a). That gap is
`2026-08-16-1556-capitalone-pending-scrape`. Chase pending lag is
`2026-08-18-1645-chase-pending-scrape`.

## Changes from original plan

| #   | Change                                                                                                                                                                                                                                                                               | Why                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Vendor switched from Teller to Plaid; folder renamed `teller-bank-sync` → `live-bank-sync`. D1, D2, D3, D10, D11, D12 rewritten.                                                                                                                                                     | Teller withdrew its API in early July 2026, before any code was written. Its documentation is still online, which is why it read as viable during shaping. Slug made vendor-neutral so a third switch is a content edit.                                                                                                                                                                                                                   |
| 2   | D5 replaced: "pending rows are a replaceable set" → "apply `/transactions/sync` deltas literally, resolving pending→posted via `pending_transaction_id`."                                                                                                                            | Plaid supplies the link explicitly. The original design was a heuristic invented to work around Teller reissuing ids; it is strictly worse than using the answer the API gives.                                                                                                                                                                                                                                                            |
| 3   | D5a added: pending is Chase-only; Capital One supplies no pending data and only 90 days of history.                                                                                                                                                                                  | Source-side limitation documented by Plaid, identical under any aggregator. Materially narrows the "matches your bank app" criterion for the card, so it is stated rather than discovered.                                                                                                                                                                                                                                                 |
| 4   | D7 tightened to require `/accounts/balance/get`.                                                                                                                                                                                                                                     | The `balances` object on `/accounts/get` and `/transactions/sync` is cached and can be a day or more stale — it would silently reintroduce the exact problem this spec exists to remove.                                                                                                                                                                                                                                                   |
| 5   | D11 inverted: mTLS via `node:https` → plain `fetch` with `client_id`/`secret`.                                                                                                                                                                                                       | Plaid needs no client certificate. Removes the one genuinely unprecedented piece of infrastructure in the original plan.                                                                                                                                                                                                                                                                                                                   |
| 6   | D9 extended to reject Plaid's `personal_finance_category` as a classification authority.                                                                                                                                                                                             | A second authority would make `effectiveCategory`'s fallback chain ambiguous. Not a question the original plan had to answer, because Teller's enrichment was thinner.                                                                                                                                                                                                                                                                     |
| 7   | Task 2 spike narrowed to Sandbox; sign convention moved out of it into D-known facts.                                                                                                                                                                                                | Plaid documents `amount` as positive = money out, the inverse of this register's rule. That was a spike question under Teller; it is now a documented fact and belongs in `mapping.ts` tests.                                                                                                                                                                                                                                              |
| 8   | **D7a added: the balance mapping branches on account `type`.** New acceptance criterion that the card's headline balance is negative.                                                                                                                                                | Found in the Task 2 Sandbox run. A credit account's `current` is the amount **owed**, so an unbranched mapping would show the Capital One card as a positive asset. D7 as written did not branch and would have shipped that.                                                                                                                                                                                                              |
| 9   | D5b added: negation confirmed uniform across account types; amounts arrive as JSON floats.                                                                                                                                                                                           | Task 2 measured it — 42/48 positive, negatives exactly the inflows. Removes the risk from the detail shape.md calls highest-risk, and fixes cents conversion as a `money.ts` concern rather than a `* 100`.                                                                                                                                                                                                                                |
| 10  | D5 caveat recorded: `pending_transaction_id` could not be verified in Sandbox.                                                                                                                                                                                                       | A pending row carries `pending: true` and a **null** link; the link appears on the posted row that replaces it, and Sandbox time cannot be advanced. D5 depends on it, so it stays unverified until real Chase data lands.                                                                                                                                                                                                                 |
| 11  | D5c added: Chase supports `transactions_refresh`, Capital One does not. Task 4 adds `/transactions/refresh` to the client surface.                                                                                                                                                   | Found via `/institutions/get_by_id`, which costs no Item. The refresh button cannot force new transactions on the card — only a new balance. The UI has to say so rather than appear broken.                                                                                                                                                                                                                                               |
| 12  | **D7b added: the Capital One card balance is not real-time.** `min_last_updated_datetime` is now sent on every `/accounts/balance/get`, and `balanceAsOf` stores Plaid's reported timestamp rather than the request time. Acceptance criteria split Chase from the card.             | Found while implementing Task 9. Capital One serves no live balance for non-depository accounts, and omitting the field fails the **whole** request with `INVALID_FIELD`. With D5a and D5c this makes the card a daily feed in every respect, which materially narrows what the feature delivers for it and had to be stated rather than discovered on the deployed app.                                                                   |
| 13  | **D10 corrected: the CSP delta is two directives, not one.** `connect-src` gains the two Plaid API hosts alongside `frame-src`.                                                                                                                                                      | Link calls Plaid from the browser, so `frame-src` alone leaves the picker unable to talk to anything. This widens `connect-src` past `'self'` for the first time — the only change in the spec that enlarges the attack surface rather than adding capability, so it is named as such rather than folded in silently.                                                                                                                      |
| 14  | **Matching accounts no longer goes through Link.** A new `loadAccountsAction` reads the connection's accounts server-side, and "Manage accounts" calls it; Link is now reserved for the reconnect case.                                                                              | Found on first use. Binding is a purely local decision about which register account a feed lands in, and routing it through Link implied re-authenticating was required to change one's mind. It also stranded the matching screen: it existed only in the moment after enrollment and was unreachable after a reload.                                                                                                                     |
| 15  | **The unmatched-account warning is transient**; surfacing it persistently moved into Task 10.                                                                                                                                                                                        | Measured in the Sandbox run: the first sync reported "4 unmatched account(s) skipped", the second reported nothing, because the cursor had moved past those transactions. D5's promise that unlinked accounts are reported rather than dropped silently only holds for one refresh, which is the same silent-gap failure it was written to prevent.                                                                                        |
| 16  | **Vendor switched again, Plaid → SimpleFIN.** D1–D3, D5–D5c, D7–D7b, D10–D12 rewritten. `src/lib/plaid/` deleted; `src/lib/banksync/` replaces it. Tables renamed `plaid_items`/`plaid_account_links` → `bank_connections`/`bank_account_links`; feed `api:plaid` → `api:simplefin`. | The Plaid account turned out to predate the free Trial cutoff, so Transactions is $0.30/item/month plus $0.10 per balance call and $0.12 per forced refresh — break-even against SimpleFIN's flat $15/yr is about twice a month. On top of the money, both banks are OAuth institutions needing registration, a corporate security questionnaire and 2–4 weeks of review. Named for the concept this time, since it is the third provider. |
| 17  | **The CSP concessions are reverted.** `frame-src` removed, `connect-src` back to `'self'`, and the security-hardening spec is no longer superseded on that point.                                                                                                                    | SimpleFIN needs no browser widget — the user pastes a setup token and the server does the rest. The one change in this spec that enlarged the attack surface is gone, which is an argument for the provider independent of cost.                                                                                                                                                                                                           |
| 18  | **The sign convention inverted back.** SimpleFIN reports positive-is-a-deposit, matching the register, so amounts are stored unmodified where Plaid's had to be negated.                                                                                                             | The highest-risk line in the switch: carrying the old negation forward would invert every amount while looking entirely plausible. Asserted in both directions, and the previous provider's requirement is named in the comment so the absence reads as deliberate.                                                                                                                                                                        |
| 19  | **PenFed is supported by SimpleFIN**, unlike the previous providers. Noted as a follow-up, not acted on.                                                                                                                                                                             | `2026-08-14-2001-external-transfer-provenance` classifies PenFed as `external_transfer` _because_ it was unimportable — "PenFed is still unimported". If it can now be synced, that frozen decision's premise no longer holds and deserves its own delta-spec.                                                                                                                                                                             |
| 20  | Freeze rewrote the still-Plaid acceptance list to the SimpleFIN contract that actually shipped, and marked Task 2b Production abandoned.                                                                                                                                             | The decisions and code had already switched (change 16); the leftover **Status: active** and unchecked Plaid criteria were why this folder looked unfinished.                                                                                                                                                                                                                                                                              |

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

### 2b. Production — abandoned with the vendor switch

Plaid Production enrollment never happened. Change 16 replaced Plaid with SimpleFIN;
setup-token paste against the live Chase and Capital One accounts is the production proof
instead. The Data Transparency Messaging / `INVALID_LINK_CUSTOMIZATION` note is kept only
as history of why Plaid Production never started.

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

## Task 9: CSP + Plaid Link UI — **done 2026-08-16**

`frame-src https://cdn.plaid.com` **and** the two Plaid API hosts on `connect-src` in
`src/lib/security/csp.ts` (D10), each with a doc comment explaining the concession, plus unit
tests asserting the hosts are enumerated rather than wildcarded and that `script-src` gains
nothing. A settings-page client component loading
`https://cdn.plaid.com/link/v2/stable/link-initialize.js` via nonced `next/script`,
initialised from a server-minted `link_token`, POSTing the `public_token` to a server action
that exchanges it. Re-auth path mints a link token in update mode for the existing Item.

## Task 10: Register UI — **done 2026-08-16**

Pending rows carry a **Pending** badge in the **Posted** column — that cell is empty
precisely because the row has not posted, so the caveat belongs there rather than beside the
date, where it collided with the account name. The amount renders unweighted, because a
pending figure is provisional and rendering it like a settled one invites it to be totalled
as final. The column filters and sorts as "Pending", so the register can be narrowed to them
without a column of its own, and it is visible on a phone where the exact posting day is not.

The unmatched-account count is **persisted on the connection and shown for as long as it is
true** (change 15). Computing it would need a network call on every page render; reporting it
once is worse, because the refresh that carries an unmatched account's transactions mentions
it and the next has moved past them — leaving an account unsynced with no sign at all.

A connection is labelled from the institutions it actually reaches ("Chase Bank, Capital
One"), since one SimpleFIN connection covers several banks and the provider's own name is the
same on every row.

## Task 11: Verify, freeze spec, update roadmap

Done 2026-08-25. The SimpleFIN feed had already been in daily use (dashboard available,
Cap One scrape, Chase scrape). This freeze closes the leftover **Status: active** and
rewrites the still-Plaid acceptance list to the as-built contract.

## Follow-ups (new work — not amendments to this frozen spec)

- **PenFed via SimpleFIN** — `2026-08-14-2001-external-transfer-provenance` classified
  PenFed as `external_transfer` because it was unimportable. That premise no longer holds
  if it can be synced; that is its own delta.
- **Plaid as a metered fallback** if SimpleFIN staleness is unacceptable. The OAuth
  registration wait is the same whenever it starts.
- Available-to-spend shipped as `2026-08-16-1338-finances-dashboard-available`.
- Cap One pending scrape shipped as `2026-08-16-1556-capitalone-pending-scrape`.
- Chase pending scrape shipped as `2026-08-18-1645-chase-pending-scrape`.

---

Further change opens a new delta-spec. Do not reopen this folder.

## Verification

Automated gates cannot prove an outbound bank feed. What ran:

1. **Pure logic** — `npm run test:unit`. `src/lib/banksync/mapping.ts` stores SimpleFIN
   amounts unmodified (the Plaid negation is named in the comment so its absence is
   deliberate). Pending-excluded cross-source comparison has a tripwire.
2. **Database** — integration tests with Postgres up, including the cross-user battery on
   connections and links.
3. **Live** — first real sync against two live accounts: 16 genuine inserts, no
   duplicates, nothing missed (the unanchored design would have inserted 217). Refresh
   twice inserts nothing.
4. **Overlap** — statement re-import of already-synced dates inserts nothing (tolerant
   match in both directions).
5. **Pending** — SimpleFIN pending is a replaceable set; Cap One supplies none, so that
   institution's pending is the scrape spec. Chase pending that SimpleFIN lags is the
   later Chase scrape.
6. **Routes** — `npm run smoke` against a running dev server.
