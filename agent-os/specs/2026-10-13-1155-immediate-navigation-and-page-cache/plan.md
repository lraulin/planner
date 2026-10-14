# Immediate navigation and an in-memory page cache

**Status: active**
Spec folder: `agent-os/specs/2026-10-13-1155-immediate-navigation-and-page-cache/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-10-1940-daily-use-performance/` — `useLinkStatus` pending
  feedback and "no invalidation for self-reconciling writes" carry forward.
- **Supersedes:** `agent-os/specs/2026-08-10-1940-daily-use-performance/` — only its decision
  "Do not move the route tree into a shared AppShell layout" (deferred "in this pass"), and the
  faint link overlay as the navigation feedback for links that have an active state.
- **Extends:** `agent-os/specs/2026-07-31-1520-persistent-ui-state/` — `localStorage` stays a
  write mirror, never a read cache. Its premise "every page is `force-dynamic`, so it re-reads on
  navigation anyway" stops being true for cached pages; decision 9 below is what keeps it safe.
- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` and
  `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/` — sidebar, page bar and
  bottom nav stay registry-driven; the active page already comes from the pathname.

## Context

Measured 2026-10-12 from Lee's signed-in Chrome on production (click → last DOM change; server =
RSC response time):

| Route     | Click → done | Server     |
| --------- | ------------ | ---------- |
| Plan tabs | 210–310 ms   | 160–230 ms |
| Budget    | 404 ms       | 337 ms     |
| Accounts  | 332 ms       | 305 ms     |
| Bills     | 585 ms       | 510 ms     |
| Register  | 870–1,580 ms | 384–956 ms |

Nothing on screen changes until the whole response arrives; the only feedback is a faint overlay
on the clicked link. Each fresh view fires ~35 link prefetches (60–90 ms each). A local
production build with `experimental.staleTimes.dynamic: 60` took a tab revisit from ~171 ms to
~67 ms with zero page requests.

What shaping found (Next 16.3.8, read from `node_modules/next/dist`):

- **The shell is rebuilt on every navigation.** 34 pages plus the Fitness and Notes layouts each
  render `<AppShell active=…>`. Next keys each route segment (`layout-router.js`,
  `TemplateContext.Provider key={stateKey}`), so sidebar, menu bar, page bar and command provider
  unmount and remount with the page.
- **Prefetch carries no page data today.** A dynamic route with no `loading.js` is prefetched only
  down to its route tree / shared layout (`docs/01-app/02-guides/prefetching.md`).
- **`router.refresh()` empties the cache for every page**, not only the current route as the docs
  say: `refresh-reducer.js` calls `invalidateBfCache()`, which bumps one global version. A server
  action that revalidates does the same.
- **44 server actions pass `revalidate: []`** (34 Finances — Register edits, categorising, splits,
  all of Supplies and Scenarios; 3 Notes; Schedule sync; bank sync; every settings write). They
  send no revalidation header, so a client cache survives them.
- **Route-handler `revalidatePath` cannot reach a browser's in-memory cache.** Only this tab's own
  action responses and `router.refresh()` can.
- **Three import panels never call `router.refresh()`**: Tomboy, RedNotebook, Achieve.
- A page can set its own window with `export const unstable_dynamicStaleTime` (page-level; the
  client treats it as authoritative). It is in the source and types but not in the docs.

## Decisions

### Part 1 — respond to a click immediately

1. **One shared layout holds the shell.** Every route that renders `AppShell` today moves under one
   route group whose `layout.tsx` renders it once. URLs do not change. `/login`, `/signup`,
   `/oauth/authorize`, `/settings` and `src/app/api` stay outside. The Fitness and Notes module
   layouts go away; their job moved up.
2. **The active module comes from the pathname**, through the module registry, in one tested
   function — the same lookup `destinationLabel` already inlines. No page passes `active`.
   (Every page's `active` already equals its first path segment; `/organize` is the one `null`.)
3. **The destination takes the active look at once.** On click, the clicked module row / page tab
   / bottom-nav slot shows as active and the previous one stops, within one frame. If the
   navigation is abandoned or fails, the highlight returns to where the address bar is. Applies to
   Sidebar, PageBar, MobileNav and MoreSheet, and to go-to commands (palette, menu Go entries,
   chords). Same-page URL changes (drawer open, view switch) are not navigations for this purpose.
   Links with no active state (Process Inbox, in-page links) keep the existing overlay.
4. **The old page stays until the new one is ready. No skeletons, no `loading.tsx`.** A fallback
   that replaces content flashes on every 200–300 ms navigation; keeping the old page never does.
5. **A slow navigation gets a bar, and only a slow one.** If a navigation is still pending 300 ms
   after it began, a thin progress bar fades in under the page bar and the content area dims
   (`aria-busy`). No minimum display time. 300 ms is one named constant: Plan tabs finish under
   it, Register never does. Respects `prefers-reduced-motion`.
6. **Viewport prefetch goes off, if the timings hold.** Every in-app link goes through `NavLink`,
   which sets `prefetch={false}`. Gate: median click → last DOM change on the five measured routes
   is not worse by more than 20 ms on a production build. If it is worse, prefetch stays and the
   numbers go in **Changes from original plan**.

### Part 2 — in-memory page cache

7. **Window: 60 seconds, in memory only.** Nothing is written to `localStorage` or any other
   browser storage (already decided; finance data does not sit unencrypted in the browser).
8. **Opt-in per route, fail closed.** One registry in `src/lib/navigation/` gives every route a
   policy: `cached`, `self-patching`, or `uncached`. A route missing from the registry is treated
   as `self-patching`. A unit test fails when a `page.tsx` has no registry entry, or when its
   `unstable_dynamicStaleTime` literal disagrees with its policy (60 for `cached`, absent or 0
   otherwise).
9. **What may be `cached`.** A page qualifies only if (a) its view keeps no locally patched copy
   of server data — every write it makes revalidates or refreshes — and (b) its server render
   reads no setting that a non-revalidating write changes. Starting classification:
   - `cached`: the seven Plan pages, Finances Budget / Accounts / Bills (the measured tabs).
   - `self-patching`: Finances Register, Supplies, Scenarios; Notes (grid and journal).
   - Everything else is decided by the audit in Task 7, each non-cached entry with a one-line
     reason. Focused flows and editors are `uncached`.
10. **Your own edits.**
    - A revalidating action or `router.refresh()` empties the whole cache (framework behaviour;
      re-proved in Task 6 because the docs describe it differently).
    - A `self-patching` page is never cached, so its own edits cannot appear reverted on return.
    - **Leaving a `self-patching` page marks the cache suspect.** The mark is a timestamp that
      lapses after the window or when the cache is emptied. Arriving at a `cached` page whose
      payload predates a live mark refreshes it, with the bar shown from arrival. Page-level, not
      per-action, on purpose: a future non-revalidating action cannot forget to set it. Cost
      accepted: glancing at Register and returning to Budget refetches Budget once.
    - A destination that was not in the cache must be fetched once, not twice.
11. **Writes from outside this tab** (userscript pushes, alert emails, agent / MCP API, a second
    device or tab):
    - **Focus return.** When the tab regains focus or visibility after 30 s or more away, the
      cache is marked suspect, and the visible page is refreshed unless its policy is
      `self-patching` (a refresh there reloads rows under an edit; those pages behave as today).
    - **While the tab stays focused**, a cached tab may be up to 60 s behind an outside write.
      Accepted and stated: today the visible page is behind until the next click; with the cache a
      click inside the window can also be behind.
    - No cross-tab channel. `persistent-ui-state` ruled live cross-tab sync out; unchanged.
12. **Imports.** The Tomboy, RedNotebook and Achieve panels call `router.refresh()` on success, as
    the Finance and Amazon panels already do.
13. **Google Calendar sync** needs no change: `ScheduleView` already calls `router.refresh()`
    after a stale pull, which empties the cache.
14. **Midnight.** A payload rendered on a previous local day is never reused. The day change (the
    timer and visibility signal `useToday` already uses) is treated exactly like a focus return.
15. **Both Next knobs are unstable.** `experimental.staleTimes` is marked experimental;
    `unstable_dynamicStaleTime` is undocumented. The registry is the design; the knob is
    replaceable. Preferred: the per-page export with no global flag. Fallback if Task 6 shows the
    export alone does not cache on a production build: `staleTimes.dynamic: 60` globally plus an
    explicit `0` on every non-cached page — same registry, same test. The stale-data checks in
    Task 9 are re-run on every Next upgrade.

### Out of scope

- Persisting page data in the browser (decided against).
- Server render time and payload size (Plan's ~810 kB, Register's 384–956 ms of server work).
  The database is only ~30–45 ms of each response; that is its own spec.
- `agent-os/specs/2026-10-12-2001-node-postgres-driver/` — independent, unchanged.
- Back / Forward, which already reuse a page regardless of age.
- Skeletons, streaming, Cache Components / `cacheLife`.

## Acceptance criteria

- [x] The shell (sidebar, menu bar, page bar) is not remounted by a navigation between any two
      shell routes. Anything that used to close because the shell remounted still closes on
      navigation (More sheet, an open menu, the palette, page-bar rearrange mode across modules).
- [x] No page passes `active`; the active module resolves from the pathname in one tested function.
- [ ] Clicking a module, page tab or bottom-nav slot moves the active look within 50 ms on a
      production build, for the slowest route too (Register). _Dev: 3–15 ms on every route
      measured (and 30 ms on a 390 px viewport); production not measured._
- [ ] A navigation that finishes under 300 ms shows no bar and no dimming. Register shows both.
      _Dev, with RSC responses delayed over CDP: none under 300 ms, both from 300 ms, gone on
      arrival. Register's own production latency (384–956 ms) not measured._
- [x] Content is never replaced by a placeholder. There is no `loading.tsx` under `src/app`.
- [ ] Prefetch requests per fresh view: recorded before; zero after — or kept, with the numbers.
- [ ] Revisiting a `cached` tab inside 60 s makes no page request. After 60 s it does.
      _Production build of a scratch app: yes (Task 6). Planner on a dev server: 0 requests inside
      the window across all ten measured revisits._
- [x] Every `page.tsx` has a registry entry and a matching export; the test proves it.
- [x] Each of the 44 `revalidate: []` actions is listed with its host page(s), and every host is
      `self-patching` / `uncached` or its client refreshes after the write.
- [ ] Every row of the stale-data table (Task 9) passes on a production build.
- [ ] Timing table (Task 2 vs Task 9) is in the spec: first visit and revisit, five routes.
- [ ] `npm run smoke`, lint, typecheck, unit and integration tests (no skips), build: green.

## Changes from original plan

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Task 2's baseline is a warmed dev server, not a production build.** The numbers below are real but are not the production numbers the acceptance criteria name; the production columns stay empty until someone with a signed-in production build runs `scripts/navigation-timing.mjs`.                                                                                                                                                                                                                                                          | `next start` cannot use the dev login bypass (`dev-bypass.ts` is gated on `NODE_ENV`), and the local `test@example.com` account in the shared `planner` database no longer accepts the documented seed password. Minting a session or a second database was declined by the permission system, so nothing authenticated could be driven against a production build in this implementation session. The dev server shares the page code, the router and the database; it differs in compile-on-demand (warmed away here), no minification, and **no link prefetch at all**, so the prefetch gate (decision 6) cannot be evaluated on it. |
| 2   | **Task 2 adds `scripts/navigation-timing.mjs`**, committed, so the procedure is one command rather than prose.                                                                                                                                                                                                                                                                                                                                                                                                                                     | The plan asked for "the exact procedure so Task 9 repeats it". A script is the only form of that which cannot drift.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3   | **A click that leaves the module lights the destination row and leaves the page bar showing the module on screen, with no tab lit.** Within a module the clicked tab lights at once.                                                                                                                                                                                                                                                                                                                                                               | Decision 3 says the clicked item lights and the previous one stops; it did not say what the page bar does when the destination is in another module. Swapping the bar's tabs before the content arrives would show one module's chrome over another's page; keeping them with none lit says "you are leaving" without that. `lastPage` is still remembered from the address bar, never from a click.                                                                                                                                                                                                                                    |
| 4   | **Task 5's prefetch gate is open: viewport prefetch stays at Next's default for now.** `NavLink` carries the switch as one named constant (`PREFETCH`); every in-app link goes through it. Decision 6 flips it to `false` when the five-route table shows click → last DOM change not worse by more than 20 ms on a production build.                                                                                                                                                                                                              | The gate is a production measurement, and a dev server never prefetches, so it cannot be evaluated there (change 1). Turning prefetch off on the strength of the docs alone would be the unmeasured change the gate exists to prevent; leaving it costs only the ~35 requests per view the spec already counted.                                                                                                                                                                                                                                                                                                                        |
| 5   | **`/chooser` is `cached`**, beyond the starting classification (Plan's seven and three Finances tabs).                                                                                                                                                                                                                                                                                                                                                                                                                                             | The audit found nothing to disqualify it: its server render reads no setting, it hosts no `revalidate: []` action, and its writes are the outline's revalidating ones. It is half of the Chooser ↔ Tasks switch the phone's bottom bar exists for.                                                                                                                                                                                                                                                                                                                                                                                      |
| 6   | **The audit counts 43 non-revalidating writes, not 44.** 33 in Finances (shaping said 34), 2 in Notes (3), 1 in Schedule, 7 in Settings; bank sync has none (its `syncAction` revalidates the layout).                                                                                                                                                                                                                                                                                                                                             | The shaping count was a grep over `revalidate: []` lines; this one parses each exported action. Two Supplies actions (`renameSupplyGroupAction`, `deleteSupplyGroupAction`) have no UI caller. The totals do not change any classification.                                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | **Registry reasons and policy live in `src/lib/navigation/cachePolicy.ts`; the agreement test is `cachePolicy.test.ts`.** `uncached` and `self-patching` differ in two behaviours: leaving a `self-patching` page marks the cache suspect, and only `uncached` / `cached` pages are refreshed in place on focus return.                                                                                                                                                                                                                            | The plan named three policies without saying what separates the two non-cached ones in code. Marking suspect on leaving _every_ uncached page would make the mark permanently live (redirects, settings), which is the failure the shaping rejected for settings writes.                                                                                                                                                                                                                                                                                                                                                                |
| 8   | **How the shell knows a payload predates the mark, and that the cache was emptied:** each cached page renders a `PageStamp` (a server-drawn render id; the client records when it first saw each id), and the shell layout renders a `CacheEpoch` whose id changes only on `router.refresh()` and a revalidating action (proved on a production build). The mark is set in a layout effect on the pathname change so it exists before the arriving page's stamp decides. A payload first seen on a previous local day also refreshes, mark or not. | The plan left the mechanism open ("a render id each cached page includes … must err toward refreshing"). An effect-ordering bug found on the dev server — the mark was set after the stamp decided — is why the mark uses a layout effect; in dev, React's double-invoked effects had hidden it. `cachePolicy.test.ts` fails when a cached page lacks its stamp.                                                                                                                                                                                                                                                                        |

## Measurements

### Procedure (repeat verbatim for every "after")

1. `npx next build`, then `next start -p 3077` with `DATABASE_URL`, `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL=http://localhost:3077` exported (production: signs in through the login form
   with `PLANNER_EMAIL` / `PLANNER_PASSWORD`). A dev server with `AUTH_DEV_BYPASS=true` needs no
   sign-in; use it only to compare the same server before and after.
2. Warm every route once (`PLANNER_URL=http://localhost:3077 npm run smoke`).
3. Hold the shared timing lock, then, from the repo root:
   `PLANNER_URL=http://localhost:3077 node scripts/navigation-timing.mjs --runs 5 --group plan`
   and `... --group finances`, and for the prefetch count `... --group prefetch`
   (production only — dev never prefetches).
4. Write down `uptime` beside each table.

Each run starts from a cold full load of `/plan/overview`, so the client cache is empty. The
script clicks real links (sidebar module row, page-bar tab), observes the DOM, and counts RSC
requests over the DevTools protocol:

- **Active** — click → the clicked link carries `aria-current="page"` (the active look).
- **Done** — click → the last DOM mutation before 500 ms of quiet.
- **Server** — the navigation's RSC request, start → last byte. `-` when no request was made.
- **Page requests** — RSC page requests the click made, prefetches excluded.

"Revisit" is the same tab clicked a second time inside the same run, within the minute.

### Before (Task 2) — warmed dev server, local Postgres, commit `6d5e23c4`

Load average 22–35 (the machine was shared with two other builds); medians of 5.

| Step                              | Visit   | Active ms | Done ms | Server ms | Page requests |
| --------------------------------- | ------- | --------- | ------- | --------- | ------------- |
| Plan: Tasks                       | visit   | 149       | 168     | 39        | 1             |
| Plan: Outline                     | visit   | 210       | 250     | 42        | 1             |
| Plan: Goals                       | visit   | 182       | 217     | 37        | 1             |
| Plan: Tasks                       | revisit | 70        | 78      | 36        | 1             |
| Plan: Outline                     | revisit | 237       | 267     | 36        | 1             |
| Plan: Goals                       | revisit | 70        | 84      | 35        | 1             |
| Finances: module switch           | visit   | 204       | 211     | 74        | 1             |
| Finances: Budget                  | visit   | 148       | 171     | 55        | 1             |
| Finances: Accounts                | visit   | 185       | 214     | 109       | 1             |
| Finances: Bills                   | visit   | 210       | 231     | 124       | 1             |
| Finances: Budget                  | revisit | 132       | 156     | 46        | 1             |
| Finances: Accounts                | revisit | 149       | 156     | 101       | 1             |
| Finances: Bills                   | revisit | 188       | 200     | 107       | 1             |
| Finances: Register                | visit   | 203       | 223     | 152       | 1             |
| Finances: Bills (after Register)  | revisit | 192       | 203     | 112       | 1             |
| Finances: Register                | revisit | 197       | 208     | 148       | 1             |
| Finances: Budget (after Register) | revisit | 136       | 160     | 52        | 1             |

Reading: today a revisit costs what a first visit costs (a request every click) and the active
look arrives with the page (Active ≈ Done). Local Postgres and a warm dev compile make every
server figure smaller than production's (Budget 337 ms, Register 384–956 ms measured 2026-10-12);
what carries over is the shape — one request per click, active look = arrival.

Prefetch requests per fresh view: **not measurable on a dev server** (Next prefetches only in
production). Production count from 2026-10-12 shaping: ~35 per view, 60–90 ms each.

### Task 6 — cache mechanism proof (production build)

Next 16.3.8, `next build` + `next start`, **a scratch two-page app, not the planner** (the planner
cannot be signed in to on a production build here; change 1). Pages `a` and `b` are
`force-dynamic` with `export const unstable_dynamicStaleTime = 60` and **no** `staleTimes` flag;
`c` is `force-dynamic` with no export. The layout holds a Link per page and three buttons: a server
action that calls `revalidatePath("/", "layout")`, a server action that revalidates nothing (what
`revalidate: []` produces), and `router.refresh()`. RSC page requests counted over the DevTools
protocol, prefetches excluded; the render id is a random string drawn in the page.

| Step                                                    | Page requests   | Result                         |
| ------------------------------------------------------- | --------------- | ------------------------------ |
| a → b (first visit)                                     | 1               | fetched                        |
| b → a, inside 60 s                                      | **0**           | same render id: from the cache |
| a → c, then c → a, then a → c again (`c` has no export) | 1, 0, **1**     | `c` is refetched every time    |
| c → b, inside 60 s                                      | **0**           | same render id                 |
| silent action, then b → a, a → b                        | 0, **0**, **0** | nothing emptied                |
| revalidating action (on b), then b → a                  | **1**           | new render id: cache emptied   |
| router.refresh() (on a), then a → b                     | **1**           | new render id: cache emptied   |
| a → b, 62 s after the last fetch of b                   | **1**           | window lapsed                  |

All four mechanism claims hold with the per-page export alone, so decision 15's fallback
(`staleTimes.dynamic` plus explicit zeros) is **not** taken. Two things the proof also showed, both
on the safe side: the page re-rendered by a revalidating action is _not_ kept as a fresh entry
(leaving it and coming back fetches again), while the page re-rendered by `router.refresh()` is (it
revisits with no request) — which is why the arrival rule in Task 8 does not rely on either. The
server sends the stale time on dynamic renders in `next dev` too (`app-render.js`), so the planner's
own rows can be exercised on a dev server (Task 9).

### Task 7 — audit

The registry is `src/lib/navigation/cachePolicy.ts` (policy and one-line reason per route; a route
not listed is `self-patching`); `cachePolicy.test.ts` fails when a `page.tsx` has no entry, when an
entry has no page, or when the exported `unstable_dynamicStaleTime` literal disagrees with the
policy. Eleven pages export `60`: Plan's seven, Chooser, Budget, Accounts, Bills.

**Non-revalidating writes → host page → why it is safe.** Host pages come from the import graph
(every `page.tsx` that can reach a component calling the action), not from memory.

| Action(s)                                                                                                                                                                                                                                                                                                          | Host page(s)                                               | Disposition                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `updateTransactionAction`, `splitTransactionAction`, `updateSplitChildrenAction`, `unsplitTransactionAction`, `setTransactionBudgetCategoryAction`, `setTransactionBudgetCategoriesAction` (6)                                                                                                                     | `/finances/register`                                       | `self-patching`; leaving it marks the cache suspect, so a cached Budget refetches                        |
| `mergePayeesAction` (1)                                                                                                                                                                                                                                                                                            | `/finances/budget`, `/finances/payees`                     | Budget (`cached`) calls `router.refresh()` in `onMerged`; Payees refreshes in `finishMerge` (`uncached`) |
| `createSupplyItemAction`, `updateSupplyItemAction`, `setSupplyItemGroupAction`, `deleteSupplyItemAction`, `createSupplyOptionAction`, `updateSupplyOptionAction`, `deleteSupplyOptionAction`, `setSupplyOptionInUseAction`, `createSupplyItemFromSuggestionAction`, `mergeSupplyItemsAction` (10)                  | `/finances/supplies`                                       | `self-patching`                                                                                          |
| `renameSupplyGroupAction`, `deleteSupplyGroupAction` (2)                                                                                                                                                                                                                                                           | none — no UI caller                                        | nothing to host; `cached` pages cannot reach them                                                        |
| `addSupplyFromAmazonItemAction`, `addSupplyOptionFromAmazonAction`, `previewAmazonSnapshotAction` (3)                                                                                                                                                                                                              | `/finances/orders`, `/finances/supplies`                   | both `self-patching`                                                                                     |
| `createScenarioAction`, `updateScenarioAction`, `duplicateScenarioAction`, `deleteScenarioAction`, `createScenarioLineAction`, `updateScenarioLineAction`, `moveScenarioLineAction`, `deleteScenarioLineAction`, `setScenarioOverrideAction`, `clearScenarioOverrideAction`, `seedScenarioFromSpendingAction` (11) | `/finances/scenarios`                                      | `self-patching`                                                                                          |
| `updateNoteAction`, `saveJournalNoteAction` (2)                                                                                                                                                                                                                                                                    | `/notes/grid`, `/notes/journal`                            | `self-patching`                                                                                          |
| `syncGoogleAction` (1)                                                                                                                                                                                                                                                                                             | `/schedule/calendar`, `/schedule/agenda`, `/schedule/plan` | `ScheduleView` calls `router.refresh()` on success (`uncached`)                                          |
| `syncGoogleContactsAction` (1)                                                                                                                                                                                                                                                                                     | `/library/contacts`, `/settings`                           | Contacts refreshes after the sync and is `self-patching`; Settings is `uncached`                         |
| `saveSettingsAction`, `resetSettingScopeAction`, `resetSettingScopesAction` (3)                                                                                                                                                                                                                                    | every page, via `SettingsProvider`                         | decision 9(b): see the next table                                                                        |
| `createInviteAction`, `revokeInviteAction`, `changePasswordAction` (3)                                                                                                                                                                                                                                             | `/settings`                                                | nothing else shows invites or the password; `uncached`                                                   |

Every host is `self-patching`, or `uncached` with a refresh after the write, or has no caller:
the criterion holds. `bankSyncActions.ts` has no non-revalidating write — `syncAction` revalidates
the layout and the rest take the default.

**Server renders that read a setting (criterion 9b).**

| Page / reader                | Scope read             | Written by                                                          | Result                                        |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `notes/grid/page.tsx`        | `notes` filter scope   | the client, `saveSettingsAction` (non-revalidating)                 | `self-patching`: never cached                 |
| `schedule/rangePage.tsx`     | `schedule` (day count) | the client, `saveSettingsAction`                                    | `uncached`: re-read every visit               |
| `finances/register/page.tsx` | `budget`               | server-side budget mutations only (`membership.ts`, `mutations.ts`) | `self-patching`                               |
| `finances/accounts/page.tsx` | `budget`               | the same server-side mutations, all behind revalidating actions     | `cached`: written only by revalidating writes |
| `loadBudget` (Budget, Bills) | `budget`               | the same                                                            | `cached`                                      |
| `moduleEntry.ts` (redirects) | `shell` (`lastPage`)   | the client, on every navigation                                     | redirect pages are `uncached`                 |
| Plan pages, Chooser          | none                   | —                                                                   | `cached`                                      |

The root layout reads every scope, but it is not re-rendered by a navigation, so it is not a
cached payload.

### After (Task 9) — warmed dev server, local Postgres, commit `8bdc5b20`

Same procedure, same machine state class (load average 6–10 while measuring; the baseline's was
22–35, so absolute "Done" figures are not directly comparable — **Active** and **Page requests**
are, because they do not depend on load). Medians of 5.

| Step                              | Visit   | Active ms (before → after) | Done ms (before → after) | Server ms | Page requests (before → after)                                       |
| --------------------------------- | ------- | -------------------------- | ------------------------ | --------- | -------------------------------------------------------------------- |
| Plan: Tasks                       | visit   | 149 → 15                   | 168 → 176                | 39 → 40   | 1 → 1                                                                |
| Plan: Outline                     | visit   | 210 → 8                    | 250 → 234                | 42 → 41   | 1 → 1                                                                |
| Plan: Goals                       | visit   | 182 → 13                   | 217 → 232                | 37 → 47   | 1 → 1                                                                |
| Plan: Tasks                       | revisit | 70 → 8                     | 78 → 51                  | 36 → -    | 1 → **0**                                                            |
| Plan: Outline                     | revisit | 237 → 10                   | 267 → 256                | 36 → -    | 1 → **0**                                                            |
| Plan: Goals                       | revisit | 70 → 3                     | 84 → 57                  | 35 → -    | 1 → **0**                                                            |
| Finances: module switch           | visit   | 204 → 11                   | 211 → 193                | 74 → 64   | 1 → 1                                                                |
| Finances: Budget                  | visit   | 148 → 8                    | 171 → 130                | 55 → -    | 1 → 0 (cached by the module switch's landing page)                   |
| Finances: Accounts                | visit   | 185 → 8                    | 214 → 166                | 109 → 39  | 1 → 1                                                                |
| Finances: Bills                   | visit   | 210 → 7                    | 231 → 134                | 124 → 53  | 1 → 1                                                                |
| Finances: Budget                  | revisit | 132 → 7                    | 156 → 116                | 46 → -    | 1 → **0**                                                            |
| Finances: Accounts                | revisit | 149 → 7                    | 156 → 66                 | 101 → -   | 1 → **0**                                                            |
| Finances: Bills                   | revisit | 188 → 7                    | 200 → 90                 | 107 → -   | 1 → **0**                                                            |
| Finances: Register                | visit   | 203 → 8                    | 223 → 130                | 152 → 55  | 1 → 1                                                                |
| Finances: Bills (after Register)  | revisit | 192 → 7                    | 203 → 189                | 112 → 66  | 1 → 1 (Register is self-patching: the one refetch the spec accepted) |
| Finances: Register                | revisit | 197 → 5                    | 208 → 79                 | 148 → 52  | 1 → 1 (never cached)                                                 |
| Finances: Budget (after Register) | revisit | 136 → 7                    | 160 → 157                | 52 → 52   | 1 → 1 (same)                                                         |

What the table supports: the active look moves in **3–15 ms for every route, Register
included** (criterion: within 50 ms; the "first frame" is the click's own task), against 70–237 ms
before. Every cached tab's revisit makes **no page request**; Register is never reused;
Budget/Bills after Register refetch once, as designed. "Done" for revisits is the client render of
the cached payload (the Outline's 256 ms is that grid mounting, not the network). What it cannot
support: production figures, or the prefetch count (a dev server never prefetches).

### Task 9 — stale-data table

Exercised on the **dev server against the shared local `planner` database**, with the one write
reversed afterwards. The router, the segment cache and the server's `unstable_dynamicStaleTime`
are the same code as production (Task 6 proved the production behaviour on a scratch app); what a
dev server does not reproduce is prefetching and bundling, neither of which this table depends on.
**Not run on a production build of the planner** — no signed-in production session was available
(change 1). Re-run on a production build before freezing.

| Write path                                               | Expect                                       | Result                                                                                                                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revalidating action (rename a task on Tasks)             | Every cached tab refetches on next visit     | **Pass.** Outline was cached (revisit: 0 requests); after the rename its next visit made 1 request and showed the new name. Restored.                                                                       |
| Categorise in Register → open cached Budget              | Budget shows the new activity                | **Mechanism passes**, write not performed: leaving Register (self-patching) marks the cache suspect; Budget → Register → Budget made 1 request with the bar shown at once, Budget → Accounts → Budget none. |
| Edit in Register / Notes / Supplies / Scenarios → return | The edit is still shown                      | **Pass by construction, one case observed:** those routes are `self-patching` (never cached; `cachePolicy.test.ts`); Register's revisit makes a request every time (table above).                           |
| Finance import, Amazon import                            | Cached tabs refetch                          | Not run (needs import files). Both panels already called `router.refresh()`; unchanged.                                                                                                                     |
| Tomboy, RedNotebook, Achieve import                      | Cached tabs refetch                          | Not run (needs import files). `router.refresh()` added to all three on success; `router.refresh()` empties every cached page (Task 6).                                                                      |
| Userscript push from the bank page, then back to the tab | Visible page and next tab are fresh          | Not run (no writer). Covered by the focus-return rule below.                                                                                                                                                |
| Alert email POST to `/api/finances/alerts`, tab focused  | Visible within 60 s on the next tab visit    | Not run. Follows from the window: a cached payload is reused for at most 60 s.                                                                                                                              |
| Agent API write; MCP write                               | Fresh on focus return; ≤ 60 s while focused  | Not run (no agent key locally). Focus return **passes**: 31 s away on a cached page → 1 refresh request; 3 s away → none; on a self-patching page → none, cache marked.                                     |
| Edit in a second tab                                     | Fresh on focus return                        | Not run as a second tab; same path as the focus-return row.                                                                                                                                                 |
| Google Calendar stale pull                               | Cached tabs refetch                          | Not run (the test account is not linked to Google, deliberately). `ScheduleView` already calls `router.refresh()` after the pull.                                                                           |
| Settings write that feeds a server render                | Host page is not cached, or shows the change | **Pass by audit** (Task 7 table): the two pages whose render reads a client-written scope are `self-patching` / `uncached`.                                                                                 |
| Local day rolls over                                     | No tab shows yesterday's "today"             | **Pass.** Local `Date` shifted a day, `visibilitychange` dispatched: 1 refresh request on a cached page; a payload first seen on a previous day also refreshes on arrival (unit-tested).                    |

### Acceptance — what is and is not met

See the checklist under **Acceptance criteria**; the unchecked boxes are exactly the ones that
need a production build of the planner (timings, prefetch count, the stale-data table "on a
production build") or a deploy. The spec is therefore **left active**.

## Task 1: Save spec documentation

Create `agent-os/specs/2026-10-13-1155-immediate-navigation-and-page-cache/`:

- **plan.md** — this plan (Status: active).
- **shape.md** — scope, the six answers Lee gave (feedback style, shared layout, prefetch, cache
  scope, window, focus return), the evidence behind each with file references, rejected options
  (skeleton `loading.tsx`, hybrid, per-module layouts, hover prefetch, cache-everything, per-action
  marking, 30 s / 5 min windows), and non-binding mechanism notes.
- **standards.md** — references pinned to standards commit `99ebb0f4`: `components/navigation`,
  `components/responsive`, `database/read-latency`, `development/testing`,
  `development/clean-code`, `development/dates`. Deviation to record: the registry-agreement test
  reads `page.tsx` source text, which is a completeness tripwire, not a restated implementation.
- **references.md** — governing specs above; Next source and doc paths cited in Context; code
  references (`NavLink.tsx`, `Sidebar.tsx`, `PageBar.tsx`, `MobileNav.tsx`, `AppShell.tsx`,
  `modules.ts`, `pages.ts`, `actionResult.ts`, `useToday.ts`, the five import panels).
- No visuals.

Shaping ends here. Implementation starts at Task 2 in a fresh session.

## Task 2: Record the baseline

Before any change, on a local production build (`npm run build && npm start`), signed in for real:
median of five for click → active look, click → last DOM change, and server time, on Plan tabs,
Budget, Accounts, Bills, Register — first visit and revisit. Count prefetch requests on a fresh
view. Write the table into `plan.md`. Write down the exact procedure so Task 9 repeats it.

## Task 3: Move the shell into one layout

- Route group with the shell layout; `git mv` the shell routes; rewrite the ~97 `@/app/<module>/…`
  imports and every live path reference (scripts, lint config, standards, `CLAUDE.md`). Frozen
  specs are not edited.
- `moduleForPathname` beside `destinationLabel` in `src/components/shell/modules.ts`, reusing its
  lookup; tests in `modules.test.ts`.
- Remove `<AppShell>` and `active` from the pages; delete the Fitness and Notes layouts.
- Check every piece of shell state that relied on a remount (see acceptance). `npm run smoke`.

## Task 4: Optimistic active state and the slow-navigation bar

- A pending-navigation store read by the shell; pure resolution of "what is active" from
  `(pathname, pending destination)` in `src/lib/navigation/`, reusing `pageForPathname`, with tests
  (pending wins; a focused-flow destination resolves to no tab; query-only changes ignored;
  cleared on arrival and on abandon).
- `NavLink` feeds the store; Sidebar, PageBar, MobileNav, MoreSheet read it; go-to commands in
  `globalCommands.ts` feed it too.
- The bar and dimming, driven by the same store, after the 300 ms constant.

## Task 5: Prefetch off, behind the measurement

`prefetch={false}` in `NavLink`; move the remaining direct `next/link` uses inside the shell onto
`NavLink`. Re-measure against Task 2 and apply the gate in decision 6.

## Task 6: Prove the cache mechanism before building on it

On a production build, with one page exporting `unstable_dynamicStaleTime = 60` and no global flag:
revisit makes no request; a revalidating action empties every cached page; `router.refresh()`
empties every cached page; a `revalidate: []` action empties nothing. If the first fails, switch
to the fallback in decision 15 and record it.

## Task 7: Cache policy registry and audit

- The registry, the page exports, and the agreement test.
- Audit table in `plan.md`: each `revalidate: []` action → host page(s) → policy or client refresh.
- Audit of server renders that read settings (`notes/grid`, `finances/register`,
  `finances/accounts`, `schedule/rangePage`) against criterion 9(b).

## Task 8: Freshness rules

- Suspect mark with injected clock, pure, in `src/lib/navigation/`, with tests (set on leaving a
  `self-patching` route, lapses after the window, cleared when the cache is emptied).
- Arrival refresh for a `cached` page that predates a live mark, without double-fetching an
  uncached destination.
- Focus return (30 s) and day change, sharing one handler; reuse `msUntilNextLocalDay` and the
  `useToday` subscription rather than a second midnight timer.
- `router.refresh()` on success in the Tomboy, RedNotebook and Achieve panels.

## Task 9: Verify

Repeat Task 2's procedure and fill the after column; then on production after deploy.

Stale-data table — each row on a production build, expected result in the spec:

| Write path                                               | Expect                                       |
| -------------------------------------------------------- | -------------------------------------------- |
| Revalidating action (assign $1 on Budget)                | Every cached tab refetches on next visit     |
| Categorise in Register → open cached Budget              | Budget shows the new activity                |
| Edit in Register / Notes / Supplies / Scenarios → return | The edit is still shown                      |
| Finance import, Amazon import                            | Cached tabs refetch                          |
| Tomboy, RedNotebook, Achieve import                      | Cached tabs refetch                          |
| Userscript push from the bank page, then back to the tab | Visible page and next tab are fresh          |
| Alert email POST to `/api/finances/alerts`, tab focused  | Visible within 60 s on the next tab visit    |
| Agent API write; MCP write                               | Fresh on focus return; ≤ 60 s while focused  |
| Edit in a second tab                                     | Fresh on focus return                        |
| Google Calendar stale pull                               | Cached tabs refetch                          |
| Settings write that feeds a server render                | Host page is not cached, or shows the change |
| Local day rolls over                                     | No tab shows yesterday's "today"             |

## Task 10: Standards

Update `components/navigation.md` (shell in one layout, active from pathname, pending state, one
link component, prefetch). Record the cache policy rule — what may be `cached`, and that a new
non-revalidating write needs a `self-patching` host — where an author of a new page will meet it;
run `/index-standards` if that becomes a new file.

## Task 11: Verify, freeze spec, update roadmap

- Confirm acceptance criteria; align plan and shape with as-built; complete the Changes table.
- Mark `plan.md` and `shape.md` **Status: frozen / complete** (date); pin the standards SHA.
- Add the delivered work beside "Daily-use performance & responsiveness" in
  `agent-os/product/roadmap.md`. List follow-ups as new work (server render cost, payload size).

> While this spec is **active**, when we make a material change to requirements, design, or scope
> (including from feedback on what was implemented), update the relevant sections and append to
> **Changes from original plan**. Skip pure implementation details. Freeze when verified.
