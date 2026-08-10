# Standards for Google Calendar Event Colors

Pointers (full text lives under `agent-os/standards/`). Key constraints for this slice:

## database/migrations

- Edit `src/db/schema.ts`, then `npm run db:generate` — never hand-write a migration without
  its snapshot.
- Commit `.sql`, snapshot, and `_journal.json` together.
- `npm run db:migrate` locally after generate.

## development/testing

- Real logic in `src/lib/**` with adjacent unit tests.
- No React component tests.
- Tripwire tests only — fail on plausible mistakes (missing colorId map, clear path, unknown ids).

## development/clean-code

- `app → components → lib → db`; mutations take `userId`.
- Thin `actions.ts`; mapping stays pure.

## components/drawer-pattern

- Stay-open Save; Save & Close closes; dirty tracking for unsaved leave.
