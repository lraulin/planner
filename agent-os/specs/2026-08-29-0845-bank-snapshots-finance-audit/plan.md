# Complete bank snapshots and finance audit

**Status: frozen / complete (2026-08-29)**
Spec folder: `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-15-1315-live-bank-sync/` — SimpleFIN remains a
  historical/reconciliation source, linked accounts remain existing account rows, and the
  cross-source exact-amount / description-overlap / ±2-day matcher remains canonical.
- **Extends:** `agent-os/specs/2026-08-26-2022-split-transactions/` — pending-to-posted
  reconciliation preserves user-owned split state only when that state can be transferred
  without changing its financial meaning.
- **Supersedes:** `agent-os/specs/2026-08-16-1556-capitalone-pending-scrape/` D1–D7 — the
  browser clipboard is now a complete current-cycle bank snapshot, not a replaceable
  pending-only TSV. Capital One current is confirmed posted-only.
- **Supersedes:** `agent-os/specs/2026-08-18-1645-chase-pending-scrape/` D1–D5 — Chase
  current-cycle posted activity is copied with pending activity rather than waiting for
  SimpleFIN.
- **Supersedes:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` D7 narrowly — capped
  `finance_budget_months.notes` is replaced by the canonical append-only finance audit.

## Problem

The pending-only capture treats a bank paste as authoritative for pending rows and the
headline balance, but does not import transactions which posted since the prior paste. When
$191.92 moved from Chase pending to posted, Planner deleted that pending budget activity and
did not add the eight posted replacements. Chase's working balance did not change, but the
Budget did. The faulty contract is shared by both card scripts.

## Decisions

### D1 — Versioned, complete bank-page snapshots

`# planner-bank-snapshot v1` is followed by a versioned JSON body with source, capture
instant, last four, posted-only current balance, complete current-cycle posted activity,
complete pending activity, raw bank strings, and explicit completeness markers.

Chase captures its Activity and Pending tables. Its visible activity date is both
transaction and posted date because the purchase date exists only in individual details.
Capital One expands current-cycle rows and captures Purchased and Posted dates. Both banks'
Current balance is posted-only; available credit, not Current, reflects pending.

Every displayed card amount is negated at parse time: a displayed purchase becomes a
negative register row, while a displayed negative payment/refund becomes positive.

The parser fails closed for filtered, searched, incomplete, unknown-account, malformed, or
pending-v1 input. Failure does not mutate data. Pending-v1 tells the user to update the
userscript. Exactly one existing open USD credit card is resolved by last four; capture never
creates an account and the bank page never calls Planner.

### D2 — Atomic snapshot reconciliation

Posted rows, pending reconciliation, headline balance, classification, and audit evidence
commit in one database transaction. Incoming posted rows match existing posted history
one-to-one with the established exact-amount / description-overlap / ±2-day cross-source
matcher.

An exact pending-to-posted match converts the existing row in place and preserves identity,
envelope, notes, overrides, and split. An unambiguous amount-changed transition preserves
user-owned fields when unsplit. A changed or ambiguous split that cannot be preserved safely
is replaced and explicitly reported in the receipt and audit. Only genuinely new posted rows
are inserted; posted history outside the page window is never deleted.

The snapshot pending section reconciles pending rows from browser capture and SimpleFIN.
For 36 hours after capture, only the browser pending set participates in Register, Dashboard,
and Budget money calculations. After expiry, browser pending is excluded and the UI asks for
a fresh capture while SimpleFIN resumes. Browser-posted provenance stays on the existing
institution-specific scrape feed so later SimpleFIN and statement imports deduplicate.

### D3 — Append-only finance audit is evidence, not another ledger

Add user-owned `finance_audit_events` and `finance_audit_changes`. Events carry immutable
kind, origin, batch id, timestamp, summary, scope, warnings/reconciliation decisions, source
evidence, and before/after money checkpoints. Changes carry an ordered entity type and stable
identity plus normalized before/after money-relevant fields. Account and transaction
identities survive deletion as evidence rather than cascade-erasing history.

Every audited mutation writes its event in the same database transaction. A multi-file
import or multi-connection sync shares one batch id and renders as one logical Activity
entry. Checkpoints cover affected accounts, budget months, and envelopes: working balance,
selected pending, account pool, Ready to Assign, reconciliation, uncategorized activity, and
assigned/activity/available.

Audit bank snapshots, SimpleFIN sync/balances, CSV/PDF imports (including successful no-ops),
transaction deletion/split/category/flow/automatic filing, account membership/deletion and
statement balances, plus budget assignments/transfers/carryover/bulk funding/deletions that
alter allocations or filing. Exclude name, URL, notes, payee notes, visual ordering, and other
descriptive-only edits.

Bank evidence retains the exact clipboard text. Uploaded evidence retains filename, size,
SHA-256, detected format, and normalized changes, not duplicate file bytes. Credentials,
cookies, full card numbers, and unrelated page detail are never retained. Events have no edit
or delete interface and are retained forever. History begins at deployment except for one
clearly labeled legacy event per existing budget-month notes value; the notes column is then
dropped and Budget's Movement log reads the audit.

### D4 — Finance Activity is the read-only audit surface

Add `/finances/activity` after Register in the canonical Finance page registry. The shared
DataGrid is newest-first and searches/filters time, action, origin, account, budget month, and
headline impact. Opening a row shows a read-only drawer with checkpoints, ordered changes,
warnings and reconciliation decisions, and collapsible source evidence including the exact
bank snapshot. Below `md`, use the standard list → full-screen sheet adaptation.

Rename Dashboard's pending panel to **Bank snapshot**. Its receipt reports posted
transitions, pending replacements, balance and budget deltas, and links to the Activity entry.
Finance import and SimpleFIN receipts also carry audit batch ids for direct links.

### D5 — Compatibility and boundaries

Tampermonkey copy/paste, SimpleFIN, CSV, and statement imports remain. Add typed
`BankBrowserSnapshotV1`, parsed rows, reconciliation plan/result, `FinanceAuditEvent`,
`FinanceAuditChange`, and `FinanceMoneyCheckpoint`; replace the pending paste action/result
with a bank-snapshot action. No public HTTP/MCP audit API, audit-based undo, checking-account
browser capture, or screenshot retention is introduced.

## Acceptance criteria

- [x] Chase fixture parses current −$370.80, eight newly posted rows totaling −$191.92,
      and two pending rows totaling −$84.71 from complete raw bank values.
- [x] Capital One fixture parses posted-only current −$43.77, pending −$12.71, purchase/post
      dates, and a displayed `-$657.62` payment as +$657.62.
- [x] Empty sections, equal duplicate charges, refunds/payments, old-script input, and
      filtered/incomplete capture rejection are covered by pure parser tests.
- [x] Reconciliation covers one-to-one duplicates, exact and amount-changed
      pending-to-posted transitions, ambiguous/split handling, the 36-hour authority window,
      and cross-source precedence.
- [x] The Chase regression moves current −$178.88 → −$370.80, pending −$276.63 → −$84.71,
      and adds eight posted rows totaling −$191.92 while working balance stays −$455.51,
      Ready to Assign stays $0, and reconciliation/envelopes remain unchanged.
- [x] A second identical paste inserts no duplicate and records a successful no-op event.
- [x] A later SimpleFIN sync or statement import deduplicates browser-posted rows.
- [x] Snapshot application rolls back completely on failure and a second user cannot read,
      change, or delete another user's snapshot/audit data.
- [x] Legacy movement notes migrate once and Budget's Movement log reads the audit ledger.
- [x] Relevant imports, syncs, transaction/account/budget mutations write atomic audit
      evidence; descriptive-only edits do not.
- [x] `/finances/activity` works at 1280×800 and 390×844 in light and dark schemes; all
      routes smoke, and unit/integration/lint/typecheck/build gates pass.
- [x] Both installed userscripts produce accepted fresh Chase and Capital One captures.

## Tasks

- [x] Save the active delta-spec and governing references.
- [x] Replace the parser/types and both userscripts with the complete JSON snapshot contract.
- [x] Build pure one-to-one snapshot reconciliation and authority-aware pending selection.
- [x] Add audit schema, generated migration, legacy notes migration, and atomic audit writer.
- [x] Apply audit to snapshot, sync, import, transaction/account/budget money mutations.
- [x] Add the Activity page/drawer and update Dashboard receipts and finance navigation.
- [x] Add unit/integration/regression/isolation coverage.
- [x] Update the roadmap, verify end to end, record material implementation changes, and freeze.

## Assumptions

- Browser captures target the existing USD cards ending 9910 and 3448.
- Bank source categories are evidence; Planner's envelope/category rules remain authoritative.
- Audit can explain prior mutations but cannot restore state.
- Frozen specs stay frozen; this delta records every deliberately superseded decision.

## Changes from original plan

| #   | Change                                                                                                                                | Why                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Capital One payment rows use Posted as their transaction date when the live detail has no Purchased date.                             | The observed payment detail exposes only Posted; retaining the row is safer than rejecting an otherwise complete current-cycle capture. |
| 2   | The upload client carries one validated audit batch ID across size-limited requests and preserves original CSV bytes through parsing. | A single user selection must appear as one Activity entry, and its SHA-256 must describe the uploaded file bytes exactly.               |

## Follow-ups (new work — not amendments to this frozen spec)

- Remove superseded legacy Tampermonkey scripts from installed managers once v2.1 has been
  adopted everywhere.
- Add a dedicated Activity export if audit evidence needs to leave Planner.
