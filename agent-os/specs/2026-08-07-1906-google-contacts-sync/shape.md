# Shape — Google Contacts sync

**Status: frozen / complete** (2026-08-07)

## Outcome

Google Contacts appear in Planner's Contacts module and stay fresh without Planner taking
write authority over the user's Google address book.

## Scope

### In

- Shared Google OAuth grant with the read-only Contacts scope
- Full and incremental People API connection sync
- Cursor persistence, expiry recovery, pagination, remote tombstones
- Contact-group name lookup
- Automatic stale refresh on `/contacts` and manual Settings refresh
- Disconnect cleanup
- Pure mapping/reconciliation tests and real-database user-isolation tests

### Out

- Creating, editing, or deleting Google Contacts
- Importing Google "Other contacts" or Workspace directory profiles
- Name/email fuzzy matching with existing local contacts
- Background jobs, webhooks, or cron-driven refresh
- Contact photos copied into Planner storage; the Google photo URL is mirrored as-is

## Interaction

The existing Settings panel becomes a Google account panel. Calendar retains its calendar
picker. Contacts adds an Enable contacts sync / Sync now control and last-sync timestamp.
The shared Disconnect action clearly states that mirrored events and contacts disappear
locally while Google data is untouched.

An enabled sync refreshes opportunistically when `/contacts` is opened and the cursor is
stale. A missing/old grant produces a visible reconnect message rather than breaking the
Contacts page.

## Safety model

The OAuth scope is read-only. Google-origin rows are an inbound mirror; local-only contacts
carry no external source and are outside every sweep. Repeated contact items are reconciled
instead of replaced so their Planner-only notes survive. Every query and mutation takes a
`userId`, and the database suite exercises a second user's read/update/delete attempts.
Deleting a Google-origin contact is unavailable in Planner; the remote delete must happen
in Google so its tombstone and the local mirror cannot drift.
