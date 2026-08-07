# Standards — Google Contacts sync

**Status: active — implementation complete; awaiting live Google reconnect**

## `database/migrations.md`

- Generate the sync-state migration with Drizzle; commit SQL, snapshot, and journal entry.
- Read the generated SQL and apply it through the direct database connection.
- Sync state is authoritative data, not a UI preference, so it belongs in a table rather
  than `user_settings`.

## `development/clean-code.md`

- Keep pages and actions thin. Mapping, reconciliation, API calls, queries, and mutations
  live under `src/lib/google/contacts/`.
- Keep API mapping and reconciliation pure; isolate fetch and database effects.
- Every mutation and query takes `userId` and scopes every statement by it.
- Use the existing Better Auth token lifecycle and plain-fetch Google client; add no SDK.

## `development/testing.md`

- Adjacent unit tests cover People field mapping, resource-name changes, full versus delta
  deletion, unchanged etags, and repeated-row note preservation.
- A real Postgres integration suite covers import/update/delete and proves a second user
  cannot read, change, or delete another user's mirrored contact.
- No React component or server-action tests.
- Because files under `src/app/**` change, run the dev server and `npm run smoke`.

## `components/ux-principles.md`

- Keep progressive disclosure: no contact-sync controls before Google is connected, and
  no operational detail beyond enabled state, last sync, and an actionable error.
- Destructive disconnect uses the existing confirmation dialog and states local versus
  remote effects precisely.
