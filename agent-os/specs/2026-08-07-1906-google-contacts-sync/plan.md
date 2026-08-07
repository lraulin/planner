# Google Contacts sync

**Status: active — implementation complete and verified; awaiting live Google reconnect**
Spec folder: `agent-os/specs/2026-08-07-1906-google-contacts-sync/`

## Context

Planner's Contacts domain was deliberately shaped around Google People API v1, including
stable external identity on contacts and value-based reconciliation for repeated phone,
email, address, and URL rows. Google Calendar already links an existing Planner account to
Google through Better Auth and owns token refresh. This delta makes the reserved People API
path real without adding a second OAuth system.

The first release is an **inbound mirror**, matching Achieve Planner's safe default of
importing external contacts without writing back. Planner must never create, edit, or delete
a Google Contact. Local-only contacts remain fully editable.

## Decisions

- Reuse the existing Better Auth Google account and add the least-privileged
  `contacts.readonly` scope. Existing Calendar-only grants require an explicit reconnect.
- A successful first sync enables Contacts sync. Opening `/contacts` refreshes an enabled
  mirror when it is more than five minutes old; Settings also offers Sync now.
- Use `people.connections.list` with `requestSyncToken=true`, pagination, and
  `READ_SOURCE_TYPE_CONTACT`. Persist the returned cursor in a one-row-per-user sync-state
  table. On `EXPIRED_SYNC_TOKEN`, retry as a full sync.
- Google is authoritative only for Google-origin contact fields. A full sync removes
  Google-origin contacts no longer returned; a delta removes only explicit tombstones.
  Planner-only contacts are never matched by name or email and are never swept.
- Google-origin contacts cannot be deleted locally. The command is disabled with a reason
  and the mutation enforces the same rule; delete in Google instead so the next delta
  carries an authoritative tombstone rather than letting the row disappear temporarily.
- Preserve the existing local-only contract: contact `contexts`, contact-item `notes`,
  discussion-item task links, and contact-history note links are never written by sync.
- Reconcile repeated rows by `(kind, normalised value)`. A matched row keeps its local id,
  sort key, and notes; only unmatched remote rows are inserted and unmatched mirrored rows
  are deleted.
- Resolve People resource-name changes through `metadata.previousResourceNames` before
  inserting, preventing duplicate contacts after Google relinks a person.
- Disconnecting Google removes the sync cursor and mirrored Google contacts, just as it
  removes mirrored calendar events. It does not change anything in Google.
- Do not add `googleapis`; the existing plain-`fetch` client style remains sufficient.

## Acceptance criteria

- [x] Settings describes one Google connection covering Calendar and Contacts.
- [ ] A signed-in user can enable Contacts sync and explicitly reconnect for the new scope.
- [x] The initial sync imports all Google Contacts and subsequent stale/page/manual syncs
      apply only deltas when the cursor is valid.
- [x] Expired cursors transparently fall back to a full sync.
- [x] Names, organization, birthday, photo, biography, groups, phone numbers, email
      addresses, postal addresses, URLs, relations, events, IM handles, and user-defined
      fields map into the existing Contacts schema.
- [x] Remote changes and deletes affect only that user's Google-origin contacts.
- [x] Planner refuses to locally delete a Google-origin contact and explains where to
      delete it; local-only contact deletion is unchanged.
- [x] Local contexts, contact-item notes, discussion tasks, and history notes survive
      updates; local-only contacts survive full sync and disconnect.
- [x] Existing Google Calendar sync continues to work through the shared grant.
- [x] Unit tests cover mapping and reconciliation mistakes; database tests prove a second
      user cannot read, change, or delete the first user's mirrored contact.
- [x] Lint, typecheck, tests, smoke, and production build pass with Postgres tests running.

## Changes from original plan

| #   | Change                                             | Why                                                                                                                                                       |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Disable local deletion for Google-origin contacts. | A locally deleted mirror row would stay absent until Google changed it or the seven-day cursor expired, then unexpectedly reappear on the next full sync. |

## Follow-ups (new work — not amendments once frozen)

- Optional outbound/two-way Google Contacts sync with write-through conflict handling.
- A user-facing pause control if automatic inbound refresh ever needs to remain connected
  while stopped.

## Verification completed

- Generated, read, and locally applied `0026_unusual_dormammu.sql`.
- `npm test`: 138 files and 2,023 tests passed against reachable Postgres, including the
  new five-case Google Contacts database suite and the existing Google Calendar suite.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm run build` passed.
- `npm run smoke` rendered all 23 page routes from a running development server.
- Inspected unlinked and temporarily simulated linked/enabled Settings states at desktop
  and 390px phone widths; the temporary test account/cursor rows were removed afterward.
- No live Google request was made from the deliberately unlinked dev account.

## Live completion still required

1. Enable **People API** in the Google Cloud project that owns the existing OAuth client.
2. After the pushed deployment is live, sign in to Planner and use **Reconnect Google** in
   Settings to grant `contacts.readonly`.
3. Use **Enable contacts sync** and verify the first real contact count. Then mark this spec
   frozen / complete.
