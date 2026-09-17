# Standards for Houses

Applied as of standards commit `30a9c769856d`. References, not copies — see AGENTS.md.

- `agent-os/standards/components/data-grid.md` — the one shared `DataGrid`; how to declare
  columns, `allColumns` for filtering hidden columns, view-state persistence via
  `useGridState`/`useModuleViews`, why there is no grid library and no `fr`/`minmax` column
  widths.
- `agent-os/standards/components/drawer-pattern.md` — the right-sliding drawer for full-record
  editing, `DrawerFooter` Cancel|Save|Save & Close, `DrawerLeaveGuard`.
- `agent-os/standards/components/navigation.md` — Module → Page → View tier; Houses is a new
  `PageEntry` in the existing `library` module, not a new module.
- `agent-os/standards/components/ux-principles.md` — outline grid + drawer split; this section
  keeps every field in the drawer (no inline-editable cells needed for a comparison catalog).
- `agent-os/standards/api/agent-tools.md` — canonical tool registry, strict input/output
  schemas, intent descriptions, retry safety via paired `externalSource`/`externalId`.
- `agent-os/standards/api/agent-auth.md` — Bearer/API-key auth for the MCP route; nothing new
  needed, the new tools inherit it by going through `dispatchAgentTool`.
- `agent-os/standards/api/response-format.md` — the `{ ok, data }` / `{ ok, error }` envelope
  for server actions.
- `agent-os/standards/api/error-handling.md` — stable error codes (`not_found`, `validation`)
  for the new MCP tools.
- `agent-os/standards/database/migrations.md` — generate → read the SQL → migrate; commit the
  `.sql`, snapshot, and journal entry together.
- `agent-os/standards/development/clean-code.md` — `userId` first on every mutation; reuse the
  one shared priority engine, drawer form kit, and grid abstraction rather than duplicating.
- `agent-os/standards/development/security.md` — every mutation and MCP handler scoped by
  `userId`; no per-user secret involved here (Nominatim/OSRM calls carry no credentials).
- `agent-os/standards/development/testing.md` — pure logic (`route.ts`: address normalization,
  response parsing, formatting) gets a unit test; DB-touching mutations get a cross-user
  `*.integration.test.ts`; no React component tests.

## Deviations

- **`components/responsive`** is not applied deliberately: this is a disposable, desktop-first
  section (per [[desktop-is-the-priority]]), so no phone-specific polish beyond what `compact`
  column roles already provide for free.
- **Find/search registries** (`src/lib/find/*`) are intentionally skipped — Houses will not be
  surfaced in global search, since the whole section is expected to be deleted once the house
  hunt concludes.
- **No `agent-os/product/roadmap.md` entry exists for this** at shape time, since it isn't a
  durable product goal; a note will be added at freeze acknowledging it's throwaway.
