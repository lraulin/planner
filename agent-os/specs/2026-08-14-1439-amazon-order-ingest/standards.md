# Standards for Amazon order ingest

The following standards apply. Full text lives in `agent-os/standards/`; this file
records why each one is in play. Include by reference, not by copy.

@agent-os/standards/database/migrations.md
@agent-os/standards/development/testing.md
@agent-os/standards/development/security.md
@agent-os/standards/development/dates.md
@agent-os/standards/development/clean-code.md
@agent-os/standards/components/data-grid.md
@agent-os/standards/components/navigation.md
@agent-os/standards/api/response-format.md
@agent-os/standards/api/error-handling.md

## database/migrations

New tables. Generate the migration, read the SQL, commit `.sql` + snapshot + journal
together. Do not hand-write a migration without its snapshot.

## development/testing

Pure slim/parse/collapse tests beside `src/lib/amazon/`. Integration tests must prove
first import, re-import upsert (0 created, status refreshed), and that a second user
cannot read, change, or delete the first user’s rows. Register in
`crossUserReads.integration.test.ts`. No React component tests. No real dump in
fixtures.

## development/security

Every mutation takes `userId` and scopes by it. The dump contains addresses and
payment last-4; fixtures are invented. Do not log raw CSV. Import errors go through
`safeErrorMessage`.

## development/dates

Order/ship/refund instants become calendar days (`YYYY-MM-DD` via UTC date
components). Never `new Date("YYYY-MM-DD")` and never `startOfDay`.

## development/clean-code

Parse and collapse in `src/lib/amazon/`. Persistence in `import.ts`. The CLI script
only reads files and writes JSON. Components do not touch the db.

## components/data-grid

Orders is a flat DataGrid. Hierarchy is grouping by order id, not a tree. Filters
and search reach hidden columns.

## components/navigation

A Finances **page**, not a new module. Register it in `pages.ts`. A command without
a menu is not shipped.

## api/response-format + api/error-handling

`{ ok, data }` or `{ ok, error }`. Size-cap and parse failures are 400s with a
stable message, not a stack.
