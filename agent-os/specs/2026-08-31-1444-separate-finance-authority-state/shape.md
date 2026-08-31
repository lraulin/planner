# Shaping: separate finance authority state

**Status: frozen / complete** (2026-08-31)

## Appetite

A deliberate model correction spanning the linked-account schema, three ingestion paths,
Budget pending selection, audit normalization, migration repair, and regression coverage.
The work should be complete enough that browser snapshots, SimpleFIN syncs, and checking
CSV imports are safe in any order.

## Scope

### In scope

- Separate provisional posted-balance precedence from browser pending authority.
- Preserve and backfill live state without treating migration time as evidence freshness.
- Make browser snapshot, SimpleFIN, and CSV ownership independent and idempotent.
- Keep existing stale-snapshot UI behavior on the correct authority timestamp.
- Record authority changes clearly in normalized finance audits.
- Prove the reported Capital One failure and adjacent checking CSV path with tests.

### Out of scope

- New dashboard diagnostics or other new UI.
- Changes to the 36-hour product window.
- Changes to feed watermark, transaction handover, matching, or envelope formulas.
- Rewriting historical finance audit events.
- Reconstructing pending transactions that are no longer present in any stored feed.

## Key decisions

The legacy timestamp is renamed rather than copied so its existing data retains its true
meaning: posted-balance precedence. Browser pending authority gets a new timestamp because
it is a separate fact with a different writer set and lifecycle.

The browser timestamp is durable evidence, not a lease that writers clear. Its predicate
decides whether it is fresh. This prevents an unrelated SimpleFIN or CSV write from
revoking authority and lets expiry hand selection back to SimpleFIN without cleanup work.

Audit events are the repair source because they are immutable, user-scoped evidence of a
successful complete snapshot. The latest event per account supplies its original event
time. That restores fresh live authority while leaving expired snapshots expired.

## Failure anatomy

1. A complete Capital One browser snapshot selected three pending transactions totaling
   $240.30 and marked `scrape_balance_as_of` fresh.
2. SimpleFIN later returned the same posted balance.
3. The balance-precedence code correctly decided the provisional hold was no longer needed
   and cleared `scrape_balance_as_of`.
4. Budget pending selection read that same field as browser authority, switched back to
   SimpleFIN's incomplete pending view, and excluded the three stored transactions.
5. Pizza, Eating Out, and Groceries therefore regained available funds even though no
   transaction settled or was deleted.

## Risks and boundaries

- A blind null backfill would leave current Budget values wrong; stamping every row with
  migration time would make stale browser data authoritative. The audit-derived event time
  avoids both failures.
- A shared freshness helper or timestamp would preserve the coupling under a new name.
  The concepts require separate modules and constants.
- Updating only Budget would hide the symptom while CSV and SimpleFIN writers continued to
  damage shared state. Every reader and writer of the legacy field must move intentionally.
- Database coverage must use a real Postgres instance and include a second user, because a
  dropped ownership predicate is invisible in single-user tests.

## Visuals

None. This is a data-authority correction with no new interface.
