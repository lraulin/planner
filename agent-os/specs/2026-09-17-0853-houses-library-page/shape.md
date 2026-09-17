# Houses — Shaping Notes

**Status: active**

## Scope

A sixth Library page, `/library/houses`, for comparing houses for sale while Lee is house
shopping: the standard grid + drawer pattern, one new `houses` table, standard priority,
a 4-value status (Available default, Not Interested, No Longer Available, Offer Made), and
an automatically computed drive time/distance to Lee's parents' house at 5006 Valley Drive,
Chesapeake Beach, MD 20732. MCP tools so Grok can read and write houses directly.

### Out of scope

- Reusing or touching `residences` (a different entity — places Lee has lived, not listings)
- Find/search integration
- Saved views beyond "All Houses"
- Photos, a map view
- A settings UI for changing the destination address (it's a hardcoded constant — this section
  is disposable and the destination isn't expected to change)
- Mobile-specific work — desktop is the priority, and `compact` roles already degrade
  reasonably for free

## Decisions

- **Disposable by design.** Requested "ASAP" and "will probably soon outlive its usefulness" —
  the whole shape optimizes for "one table, one page, one MCP domain, deletable in one commit"
  over generality. No shared components created for this alone; everything reuses existing
  grid/drawer/priority/MCP infrastructure.
- **Drive time: OSRM + Nominatim, not Google.** Free, no API key/billing setup, adequate
  accuracy for comparison shopping (no live traffic, but this is about relative distance
  between candidate houses, not turn-by-turn). Computed server-side (CSP is `connect-src
'self'`, so it couldn't run client-side anyway) and cached on the row via a
  `routedAddress` sentinel column — no second table.
- **Status as text+CHECK+tuple, not pgEnum** — matches the repo's stated reason
  (`ALTER TYPE … ADD VALUE` fails on Neon's transaction-mode pooler), even for a short-lived
  table, since it costs nothing extra and is the house style.
- **Has-fence/basement/garage are nullable booleans**, not a 2-state checkbox or a text field —
  "unknown/not listed" is common and distinct from "no."
- **New MCP domain `"houses"`**, not folded into `"history"` (which owns residences/jobs/
  timeline — semantically the wrong home) or `"library"` (would misleadingly imply coverage of
  Contacts/Resources too).

## Context

- **Visuals:** None provided.
- **References:** `src/components/resources/*` and `src/components/jobs/*` (grid+drawer,
  read-only columns pattern), `src/lib/url/pageTitle.ts` (external-service-derived value,
  fail-soft), `src/lib/agent/historyTools.ts` + the history-agent-tools spec (MCP domain
  template), `src/db/schema.ts` `metrics` table (priority + flat catalog + sortKey precedent).
- **Product alignment:** N/A — no `agent-os/product/roadmap.md` item existed for this; it's
  personal/incidental. A line will be added when work completes, noting it's expected to be
  removed later.

## Standards Applied

- `components/data-grid` — the shared DataGrid; no new grid runtime, definite-width columns,
  filters reach hidden columns via `allColumns`, all view state through `useGridState`.
- `components/drawer-pattern` — right-sliding drawer, standard footer, leave guard.
- `components/navigation` — Module → Page → View tier; Houses is a `PageEntry`, not a module.
- `components/ux-principles` — grid + drawer, no inline editing here (all fields in drawer).
- `api/agent-tools` — canonical registry, strict schemas, retry-safe creates via
  `externalSource`/`externalId`.
- `api/agent-auth`, `api/response-format`, `api/error-handling` — inherited automatically by
  going through the existing `dispatchAgentTool`/action-result plumbing.
- `database/migrations` — generate, read, migrate, commit `.sql` + snapshot + journal together.
- `development/clean-code` — `userId` first on every mutation, one shared implementation per
  concern (reuse `priority/letterRank.ts`, `detail/fields.tsx`, `grid/*`, not new versions).
- `development/security` — every mutation scoped by `userId`; cross-user integration test.
- `development/testing` — pure logic (`route.ts`) tested; DB mutations get
  `*.integration.test.ts` with a second-user negative case; no React component tests.

## Deliberate divergences from standing patterns

- `"houses"` sits outside the existing MCP domain taxonomy (`core|outline|notes|schedule|
planning|metrics|finances|history`) as a new sibling, rather than being absorbed into
  `"history"` even though residences/jobs live there — the entities aren't the same thing.
- Skips Find/search registration that most Library entities get, because this page is not
  meant to be a long-term part of the app's search surface.
