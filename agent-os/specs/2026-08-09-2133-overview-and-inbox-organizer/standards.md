# Standards for Overview and Inbox Organizer

**Status: active**

The implementation uses references so the active code follows the current canonical
standards rather than a copied snapshot.

- `agent-os/standards/components/ux-principles.md` — dedicated organizer page,
  progressive disclosure, feedback, and careful destructive behavior.
- `agent-os/standards/components/navigation.md` — Overview in the module registry and
  Process Inbox in the shared command system with visible shell paths.
- `agent-os/standards/components/responsive.md` — adaptive `md` layout, 44px touch targets,
  16px mobile inputs, safe areas, dark mode, and desktop/mobile verification.
- `agent-os/standards/development/clean-code.md` — domain logic under `src/lib`, thin
  actions/components, and one shared picker rule.
- `agent-os/standards/development/testing.md` — pure logic tests, real database integration
  tests, and explicit second-user isolation coverage.
- `agent-os/standards/development/dates.md` — canonical date keys, UTC-noon calendar fields,
  and local wall-clock appointment instants.
- `agent-os/standards/product/date-model.md` — Defer is the postponed shelf with a required
  expiry in this workflow, not a second independent state axis.
- `agent-os/standards/database/migrations.md` — generated Drizzle SQL/snapshot/journal,
  reviewed backfill, and migration through the direct database connection.
