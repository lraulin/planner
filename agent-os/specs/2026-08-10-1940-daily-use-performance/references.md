# References for Daily-use Performance and Responsiveness

## Governing specs

### `agent-os/specs/2026-07-29-1045-notes-markdown-editor/`

- **Relationship:** Extends.
- **Relevant decisions:** Drawer-only Markdown editing, autosave, body snippets, exact title/body/Subject/Contexts filtering, deep-link behavior, and no raw HTML.

### `agent-os/specs/2026-07-31-1520-persistent-ui-state/`

- **Relationship:** Extends.
- **Relevant decisions:** Postgres settings, localStorage write queue, server-first settings, and force-dynamic pages.

### `agent-os/specs/2026-08-04-0924-grid-control-surface/`

- **Relationship:** Extends.
- **Relevant decisions:** One hand-rolled DataGrid, hierarchy-preserving filtering/grouping, persisted grid state, and virtualization out of scope until measured.

### `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`

- **Relationship:** Extends.
- **Relevant decisions:** Single module registry, shared shell settings, command discoverability, and visible unavailable states.

### `agent-os/specs/2026-07-31-2046-google-calendar-sync/`

- **Relationship:** Extends and supersedes only the decision to mirror Google before Schedule renders.
- **Relevant decisions:** Google source of truth, local appointment mirror, staleness throttle, partial-failure banner, and manual refresh.

### `agent-os/specs/2026-08-07-1906-google-contacts-sync/`

- **Relationship:** Extends and supersedes only the decision to complete stale sync before Contacts renders.
- **Relevant decisions:** Google-authoritative fields, incremental cursor, stale refresh, and reconnect/failure messaging.

## Code references

- `src/app/actionResult.ts` — shared action result and layout-wide invalidation behavior.
- `src/lib/auth.ts` and `src/lib/settings/session.ts` — repeated request identity/settings resolution.
- `src/lib/notes/queries.ts`, `src/lib/notes/filter.ts`, `src/components/notes/NotesGrid.tsx`, and `src/components/notes/NoteDrawer.tsx` — Notes payload, filtering, rendering, and autosave.
- `src/components/grid/DataGrid.tsx` and `src/components/grid/columns.ts` — shared row rendering and column context contracts.
- `src/lib/schedule/queries.ts`, `src/lib/google/sync.ts`, `src/app/contacts/page.tsx`, and `src/lib/google/contacts/sync.ts` — blocking Google sync paths.

## Official framework references

- [React `cache`](https://react.dev/reference/react/cache) — request-scoped deduplication of repeated server reads.
- [Next.js `useLinkStatus`](https://nextjs.org/docs/app/api-reference/functions/use-link-status) — immediate pending navigation feedback.
- [Next.js prefetching](https://nextjs.org/docs/app/guides/prefetching) — dynamic-route prefetch tradeoffs and loading boundaries.
- [Next.js `refresh`](https://nextjs.org/docs/app/api-reference/functions/refresh) and [`revalidatePath`](https://nextjs.org/docs/app/api-reference/functions/revalidatePath) — current-route refresh versus broader invalidation semantics.

## Performance evidence

Measured against the local production build with 389 notes and 142 outline nodes: Notes navigation ~278 ms / ~485 KB compressed RSC, Notes DB read ~11 ms / ~1.14 MB JSON, Notes selection ~54 ms, and eager Markdown parser cost ~55 KB compressed. These figures are the baseline for the acceptance budgets in `plan.md`.
