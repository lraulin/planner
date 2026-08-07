# References — Google Contacts sync

**Status: frozen / complete** (2026-08-07)

## Existing implementation

- `src/lib/auth/server.ts` — Better Auth Google provider, offline refresh grant, shared
  account linking.
- `src/lib/google/client.ts`, `mapping.ts`, `mirror.ts`, `sync.ts` — plain-fetch Calendar
  client and pure mapping / mirror / impure orchestration split to preserve.
- `src/lib/google/mutations.integration.test.ts` — Google sync database isolation pattern.
- `src/db/schema.ts` — `contacts` and `contact_items` document the People mapping and
  local-only columns; `google_calendar_links` is the sync-state precedent.
- `agent-os/specs/2026-08-05-1458-remaining-go-menu-modules/` — frozen parent feature that
  reserved this delta and its schema constraints.
- `agent-os/specs/2026-07-31-2046-google-calendar-sync/` — frozen Google Calendar mirror.

## Product reference

- `docs/achieve-planner/user-manual.md` §6.5 and
  `docs/achieve-planner/online-help.md` Contact Options — Achieve defaults to import-only
  synchronization and makes export/deletes explicit opt-ins.

## Google API source of truth

- `https://developers.google.com/people/api/rest/v1/people.connections/list` — required
  field mask, pagination, sync tokens, seven-day expiry, and deleted-person tombstones.
- `https://developers.google.com/people/api/rest/v1/people` — Person field and metadata
  shapes, primary fields, source update times, previous resource names.
- `https://developers.google.com/people/api/rest/v1/contactGroups/list` — group resource
  names to display-name lookup.
- `https://developers.google.com/identity/protocols/oauth2/scopes` —
  `contacts.readonly` least-privilege scope and consent requirements.
