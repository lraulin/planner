# Standards for Brain

Applied as of standards commit `5e153504`. References, not copies — see AGENTS.md.

- `agent-os/standards/database/migrations.md` — new tables; generate, read the SQL, commit snapshot + journal together.
- `agent-os/standards/database/read-latency.md` — `loadPlex` must be one round trip (CTE); no sequential neighbour reads.
- `agent-os/standards/development/testing.md` — pure logic in `src/lib/brain/` with tests; every mutation gets a cross-user case; no component tests.
- `agent-os/standards/development/security.md` — every mutation takes `userId`; composite FKs make cross-user links impossible at the schema.
- `agent-os/standards/development/clean-code.md` — app→components→lib→db direction, thin `actions.ts`.
- `agent-os/standards/development/dates.md` — `lastVisitedAt` is an instant, not a calendar day.
- `agent-os/standards/components/modal-pattern.md` — delete confirmation on `ModalShell`.
- `agent-os/standards/components/navigation.md` — every verb has a menu entry; registry-driven page and commands.
- `agent-os/standards/components/responsive.md` — below md, stacked lists with 44px targets and 16px inputs.
- `agent-os/standards/components/ux-principles.md` — note autosaves, no Save button; icon-only buttons get titles.
- `agent-os/standards/api/agent-tools.md` — typed registry, compact lists, natural-key replay for the `brain` domain.

## Deviations

- The plex is neither a data grid nor a drawer page, so `components/data-grid.md` and
  `components/drawer-pattern.md` are deliberately not applied; the note pane autosaves like the notes drawer.
