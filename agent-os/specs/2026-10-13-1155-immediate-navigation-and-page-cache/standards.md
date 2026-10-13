# Standards for Immediate navigation and an in-memory page cache

Applied as of standards commit `99ebb0f4`. References, not copies — see AGENTS.md.
`git show 99ebb0f4:agent-os/standards/<path>` recovers what applied.

- `agent-os/standards/components/navigation.md` — the sidebar, page bar and bottom nav are
  the surfaces that gain the optimistic active state; the registry stays their one source, and
  the active page already resolves from the pathname via `pageForPathname`.
- `agent-os/standards/components/responsive.md` — below `md` the phone navigates through
  `MobileNav` and `MoreSheet`, which get the same active state and the same bar.
- `agent-os/standards/database/read-latency.md` — "Measure": the before/after timings are
  taken on a production build, because local Postgres hides what production costs.
- `agent-os/standards/development/testing.md` — the active-state resolution, the suspect mark
  and the cache policy registry are pure logic in `src/lib/**` with tests beside them; no React
  component tests; browser behaviour is verified by the stale-data table, not mocked.
- `agent-os/standards/development/clean-code.md` — "When the model is wrong, change the model":
  a hand-passed `active` on 34 pages and a shell rebuilt per navigation are the two workarounds
  for a missing shared layout. Also the app → components → lib direction: the registry and the
  mark live in `src/lib/navigation/`, the router calls in components.
- `agent-os/standards/development/dates.md` — the day-change rule uses the browser's local day
  (`localDateKey`, `msUntilNextLocalDay`), not a stored calendar field.

## Deviations

- **The registry-agreement test reads `page.tsx` source text.** `testing.md` rules out tests
  that restate the implementation. This one does not restate it: it fails when a new page has
  no cache policy, or when a page's `unstable_dynamicStaleTime` literal disagrees with the
  registry. Next analyses segment config statically, so the literal cannot be derived from the
  registry at build time; the test is the only thing tying the two together.
- **`navigation.md` is changed by this work** (Task 10): the shell moves into one layout, the
  active module comes from the pathname, and `NavLink` becomes the one link component with
  prefetch off. Until then the standard describes the previous arrangement.
