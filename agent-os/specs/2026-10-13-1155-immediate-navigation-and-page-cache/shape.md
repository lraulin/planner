# Immediate navigation and an in-memory page cache — Shaping Notes

**Status: active**

## Scope

Two changes to how navigation feels, in one spec because the second depends on the first's
shell work and both are verified by the same click timings.

1. **Respond to a click immediately.** The destination shows as active at once, the old page
   stays until the new one is ready, and only a slow navigation gets a visible pending state.
2. **Reuse a tab you just looked at.** An in-memory page cache with a 60 second window, opt-in
   per route, with explicit rules for every way data changes without this tab knowing.

### Out of scope

- Persisting page data in the browser. Decided before shaping: `localStorage` is a write mirror
  for settings (`agent-os/specs/2026-07-31-1520-persistent-ui-state/`), and finance data does
  not sit unencrypted in the browser.
- Server render time and payload size. The database is ~30–45 ms of each response; the rest is
  server work (Plan ships ~810 kB, Register spends 384–956 ms on the server). That is a
  separate spec.
- The driver swap in `agent-os/specs/2026-10-12-2001-node-postgres-driver/`.
- Back / Forward, which already reuse a page regardless of its age.
- Skeletons, streaming, Cache Components / `cacheLife`.
- Live cross-tab sync.

## Decisions Lee made, and the evidence each rested on

Each question was put with the finding first.

### 1. Click feedback — highlight now, bar if slow

Chosen over a skeleton on every navigation and over a hybrid (bar everywhere, skeleton on
slow routes).

- Plan tabs take 210–310 ms. A `loading.tsx` fallback is prefetched and shown at the click, so
  every one of those switches would flash a skeleton.
- React keeps already-revealed content on screen during a transition, which is the current
  behaviour; what is missing is any sign the click registered.
- The hybrid needs a list of slow routes that goes stale as pages change speed.

### 2. Shell — one shared layout

Chosen over per-module layouts and over leaving the shell in the pages.

- `AppShell` is rendered by 34 pages and by the Fitness and Notes layouts
  (`grep -rl "<AppShell" src/app` → 36 files).
- Next keys every route segment: `node_modules/next/dist/client/components/layout-router.js`
  renders `TemplateContext.Provider` with `key={stateKey}`. A different page segment is a
  different key, so everything the page renders — the shell included — unmounts and remounts.
- Every page's `active` already equals its first path segment; `/organize` passes `null`. The
  prop restates the URL.
- `agent-os/specs/2026-08-10-1940-daily-use-performance/plan.md` said "Do not move the route
  tree into a shared AppShell layout … in this pass". Deferred, not rejected; superseded here.
- Per-module layouts would keep the shell across tab switches but still rebuild it between
  modules, and `active` would stay hand-passed.
- Known cost, accepted: folders move under a route group, so ~97 `@/app/<module>/…` imports
  change (30 Finances, 14 Library, 13 Plan, the rest smaller).

### 3. Prefetch — off, if the timings hold

Chosen over keeping it and over full-page prefetch on hover.

- `node_modules/next/dist/docs/01-app/02-guides/prefetching.md`: a dynamic page is prefetched
  "No, unless `loading.js`". With every page `force-dynamic` and no `loading.tsx`, the ~35
  requests per view (60–90 ms each in production) deliver no page data.
- Hover prefetch (`prefetch={true}` on intent) would buy the hover-to-click head start at the
  price of a full server render for every hover not followed by a click — up to 810 kB on Plan.
- It is a gate, not an assumption: decision 6 in `plan.md` keeps prefetch if clicks get slower.

### 4. Cache scope — opt-in per route, fail closed

Chosen over cache-everything-with-opt-outs and over not adopting the cache.

- A revalidating action empties the whole client cache. Lee's test confirmed it; the source
  agrees (`router-reducer/reducers/server-action-reducer.js` calls `invalidateBfCache()` when
  the `x-action-revalidated` header is present).
- `router.refresh()` also empties it for every page. The docs say it clears "the current
  route"; `router-reducer/reducers/refresh-reducer.js` calls `invalidateBfCache()`, and
  `segment-cache/bfcache.js` implements that as one global version bump.
- 44 actions pass `revalidate: []`: 34 in `src/app/finances/actions.ts`, 3 in
  `src/app/notes/actions.ts`, 1 in `src/app/schedule/actions.ts`, 1 in
  `src/app/settings/bankSyncActions.ts`, and the wrapper in `src/app/settings/actions.ts` that
  covers every settings write. No header is sent, so the cache survives them. Two failure
  modes follow:
  - Edit on a page that patches itself, leave, come back inside the window: the cached
    pre-edit payload remounts and the edit looks lost.
  - Categorise in Register, open a cached Budget: pre-edit activity.
- With opt-outs, a new self-patching page is cached by default and shows the first failure
  until someone notices. With opt-in it cannot.

### 5. Window — 60 seconds

Chosen over 30 s and 5 minutes. Own edits and focus return both empty the cache, so the window
only bounds writes that land while the tab stays focused. 60 s is the value Lee tested.

### 6. Focus return — drop the cache, refresh if safe

Chosen over dropping the cache without refreshing and over no focus handling.

- Out-of-band writers act while attention is elsewhere: the bank-page userscripts run in
  another tab, the agent / MCP API is driven from Claude, the second device is the phone.
  Returning to the tab is the moment they become relevant.
- "If safe" exists because the self-patching pages pass `revalidate: []` for a reason: a
  refresh "reloads every row and discards the grid state the user is mid-edit in"
  (`src/app/finances/actions.ts`, Supplies) and "freezes the drawer that just saved"
  (`updateTransactionAction`).

## Decisions made in shaping without a question

- **The mark is set by leaving a self-patching page, not by each action.** Per-action marking
  is more precise but fails open: the 45th action can forget. Page-level fails closed. Cost:
  glancing at Register and returning to Budget refetches Budget once.
- **Settings writes do not mark the cache.** `useRememberPage` writes `lastPage` on every
  navigation, so a mark there would be permanently live and the cache useless. Instead a page
  whose server render reads a client-written setting cannot be `cached` (criterion 9b).
- **Route-handler writers need no server change.** Their `revalidatePath` cannot reach a
  browser cache; the window and focus return are what cover them.
- **The registry is the design; the Next knob is replaceable.** Both knobs are unstable, so
  nothing but the page exports and one config line may depend on which is used.

## Mechanism notes (non-binding)

- `router.refresh()` is the only public way to empty the client cache, and it also re-renders
  the current route. That is why the suspect mark is resolved on arrival rather than at the
  click: refreshing first would re-render the heavy page being left.
- Telling "came from cache" from "just fetched" on arrival: one option is a render id each
  `cached` page includes, with the client recording when it first saw each id. Whatever is
  used must err toward refreshing.
- `useLinkStatus` already tracks the lifetime of a link navigation, including a superseded
  click; feeding the pending store from it avoids re-deriving when a navigation ends.
- `unstable_dynamicStaleTime` is read in `server/app-render/create-component-tree.js` and
  `app-render.js` (`getDynamicStaleTime`, sent as `d` on dynamic renders only) and declared in
  `build/segment-config/app/app-segment-config.d.ts`. Segment config is analysed statically, so
  expect a literal per page rather than an imported constant — hence the agreement test.

## Context

- **Visuals:** None. The optimistic state reuses the existing active styles; the bar follows
  the shell tokens.
- **References:** see `references.md`.
- **Product alignment:** the mission's "fast, keyboard-driven" interface; the tech stack's
  free Vercel tier (dropping ~35 function invocations per view). Sits beside the roadmap's
  "Daily-use performance & responsiveness" item.

## Standards Applied

See `standards.md`.
