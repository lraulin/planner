# References for Immediate navigation and an in-memory page cache

## Governing specs

### `agent-os/specs/2026-08-10-1940-daily-use-performance/`

- **Relationship:** Extends; supersedes one decision and one piece of feedback design.
- **Relevant decisions:** `useLinkStatus` pending feedback (kept, and extended into an
  optimistic active state); "no invalidation for self-reconciling writes" (kept — it is why 44
  actions pass `revalidate: []`). **Superseded:** "Do not move the route tree into a shared
  AppShell layout", and the faint overlay as the feedback for links that have an active state.

### `agent-os/specs/2026-07-31-1520-persistent-ui-state/`

- **Relationship:** Extends.
- **Relevant decisions:** "The mirror is a write queue, not a read cache" — unchanged; this
  spec adds no browser storage. Its reasoning that settings writes need no revalidation
  because "every page is `force-dynamic`, so it re-reads on navigation anyway" no longer holds
  for a cached page, which is why a page whose server render reads a client-written setting
  may not be `cached`. Cross-tab live sync stays out of scope, as it was there.

### `agent-os/specs/2026-08-13-0747-module-pages/` and `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`

- **Relationship:** Extends.
- **Relevant decisions:** one registry read by the sidebar, the page bar, the palette and the
  bottom nav; the active page resolved from the pathname rather than a prop. This spec applies
  the same rule to the active module.

### Write paths referenced, not changed

- `agent-os/specs/2026-10-03-1500-card-holds-from-alert-emails/` — `/api/finances/alerts`.
- `agent-os/specs/2026-09-24-1330-chase-to-bank-page/` — bank-page userscript pushes.
- `agent-os/specs/2026-08-13-1730-remote-mcp-transport/` — `/api/mcp`.
- `agent-os/specs/2026-07-31-2046-google-calendar-sync/` — stale pull, then `router.refresh()`.

### Independent

- `agent-os/specs/2026-10-12-2001-node-postgres-driver/` — active; shortens the server's
  database waits. Neither spec depends on the other.

## Next.js 16.3.8 — read before relying on any of it

Docs, under `node_modules/next/dist/docs/01-app/`:

- `03-api-reference/05-config/01-next-config-js/staleTimes.md` — experimental; `dynamic`
  default 0; "loading boundaries are considered reusable for the `static` period".
- `02-guides/prefetching.md` — what is prefetched for a dynamic route; `prefetch={false}`.
- `03-api-reference/02-components/link.md` — `prefetch` values, `onNavigate`.
- `03-api-reference/04-functions/use-link-status.md`.
- `03-api-reference/04-functions/use-router.md` — `router.refresh()` (says "current route").
- `03-api-reference/04-functions/revalidatePath.md` — server functions vs route handlers.
- `03-api-reference/03-file-conventions/loading.md` — why a fallback needs the layout above it.
- `04-glossary.md` — "Client Cache".

Source, under `node_modules/next/dist/`, where the docs are silent or differ:

- `client/components/layout-router.js` — segments keyed by `stateKey`.
- `client/components/router-reducer/reducers/refresh-reducer.js` — `invalidateBfCache()`.
- `client/components/router-reducer/reducers/server-action-reducer.js` — eviction only when
  `x-action-revalidated` is present.
- `client/components/segment-cache/bfcache.js` — one global version; `staleAt` per entry.
- `server/app-render/app-render.js`, `create-component-tree.js`,
  `build/segment-config/app/app-segment-config.d.ts` — `unstable_dynamicStaleTime`.

## Code

### Shell and navigation

- `src/components/shell/AppShell.tsx` — the chrome that moves into the layout.
- `src/components/shell/NavLink.tsx` — the one link component; `useLinkStatus` overlay today.
- `src/components/shell/Sidebar.tsx`, `PageBar.tsx`, `MobileNav.tsx`, `MoreSheet.tsx` — the
  surfaces that show an active state.
- `src/components/shell/modules.ts` — `destinationLabel` holds the pathname → module lookup to
  reuse; `moduleEntryHref` already points the sidebar at the remembered page.
- `src/lib/navigation/pages.ts` — `pageForPathname`, `isFocusedFlow`; React-free and tested.
- `src/components/shell/globalCommands.ts` — go-to commands that call `router.push`.
- `src/components/shell/DocumentTitle.tsx` — already follows the pathname in the root layout.
- `src/app/fitness/layout.tsx`, `src/app/notes/layout.tsx` — the existing per-module layouts.

### Invalidation

- `src/app/actionResult.ts` — `run()`, `DEFAULT_REVALIDATE`, the `revalidate: []` escape.
- `src/app/finances/actions.ts`, `src/app/notes/actions.ts`, `src/app/settings/actions.ts`,
  `src/app/settings/bankSyncActions.ts`, `src/app/schedule/actions.ts` — the 44.
- `src/components/finances/FinanceImportPanel.tsx`, `src/components/settings/AmazonImportPanel.tsx`
  — refresh after a route-handler import (the pattern to copy).
- `src/components/settings/TomboyImportPanel.tsx`, `RedNotebookImportPanel.tsx`,
  `AchieveTransferPanel.tsx` — do not refresh today.
- `src/components/schedule/ScheduleView.tsx` — `router.refresh()` after a Google pull.
- `src/app/api/finances/alerts/route.ts`, `src/app/api/agent/[tool]/route.ts`,
  `src/app/api/mcp/route.ts` — out-of-band writers.

### Day change

- `src/components/grid/useToday.ts` — midnight timer plus visibility; the subscription to reuse.
- `src/lib/dateMath.ts` (`msUntilNextLocalDay`), `src/lib/schedule/geometry.ts` (`localDateKey`).

### Server renders that read settings (criterion 9b)

- `src/app/notes/grid/page.tsx`, `src/app/finances/register/page.tsx`,
  `src/app/finances/accounts/page.tsx`, `src/app/schedule/rangePage.tsx`.

### Measurement

- `npm run build && npm start` (port 3047) for click timings; `npm run perf:routes` and
  `npm run smoke` as described in `read-latency.md` and `CLAUDE.md`.
