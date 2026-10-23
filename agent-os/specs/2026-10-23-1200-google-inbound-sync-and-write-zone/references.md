# References for Google inbound sync for agents, duplicate-safe creates, and the write zone

**Status: active**

## Governing specs

### `agent-os/specs/2026-07-31-2046-google-calendar-sync/`

- **Relationship:** Extends — mirror, write-through, unique external ref, "background sync"
  follow-up.

### `agent-os/specs/2026-08-10-1940-daily-use-performance/`

- **Relationship:** Extends — Task 5's local-first schedule read; agent reads now opt back in.

### `agent-os/specs/2026-08-09-1130-agent-tool-contracts/`

- **Relationship:** Extends — output schemas for `get_week` and `create_appointment`.

## Code

- `src/lib/schedule/queries.ts` — `loadSchedule`, `forceSync`.
- `src/lib/google/sync.ts` — `syncWindow`, `SyncStatus`.
- `src/lib/google/writeThrough.ts` — `pushCreate`.
- `src/lib/google/dedupe.ts` — `findDuplicateEvent`.
- `src/lib/google/mapping.ts` — `writeTimeZone`, `appointmentToGoogleEvent`.
- `src/lib/schedule/mutations.ts` — `createAppointmentWithOutcome`, `adoptExistingEvent`.
- `src/lib/agent/scheduleTools.ts`, `outlineTools.ts`, `planTools.ts` — agent reads.
