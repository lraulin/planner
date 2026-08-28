# Standards that apply

**Status: frozen / complete** (2026-08-13)

## `components/navigation.md`

The standard this spec **amends**. Every rule it states at the module tier is re-applied one
tier down, deliberately and without exception — the point of the spec is that the page tier is
not a new idea, only an unfilled slot.

- **"Modules live in one registry… never hard-code a module anywhere else."** Pages get the same
  contract. The page bar, the palette's go-to entries and the bare-path redirect all read
  `src/lib/navigation/pages.ts`; nothing hard-codes a page. The section's own argument — _"five
  surfaces reading one array is what stops the phone and the desktop from disagreeing about what
  the app contains"_ — is exactly why the bar is shell-owned rather than rendered by each module,
  which is how four modules ended up with three visual treatments.
- **"Sections, and reserved modules."** `status: "reserved"` carries down verbatim, including
  the prohibition on rendering a reserved entry as a disabled row: _"a menu full of dead rows
  teaches the reader to stop reading the menu."_ Finances Insights is the first reserved page.
- **"No command is palette-only."** Pages are navigation, not commands, but the rule's reason
  applies: every page must have a visible tappable path. That is why the page bar is the one
  chrome row that survives below `md`, where there is no `⌘K`.
- **"The palette must be complete."** New `go.<module>.<page>` entries, generated from the
  registry rather than written out — the same reason `useGlobalCommands` generates the module
  entries today: _"a new module becomes reachable by `⌘K` the moment it is added"_.
- **"Shell state is a setting, not a `localStorage` flag."** `lastPage` joins `ShellSettings`
  under the `shell` scope, which this section explicitly reserves for _"anything else the shell
  remembers"_, and its warning is load-bearing here: the parser _"must return defaults for an
  unusable blob rather than throwing… it runs before the first paint"_. The sticky redirect
  reads it server-side in `layout.tsx`, so an exception there would break every route at once.
- **"Where a control belongs" (three tiers).** Unchanged. A page is not a control and does not
  compete for a tier; the bar sits above all three.

**Amended by this spec:** a new **Pages** section (the tier, the registry, the resolution rule,
the focused-flow exclusion), the underline-vs-segment rule, and a note fixing "lens" to name
exactly one thing.

## `components/ux-principles.md`

- **"Consistency — the same patterns across every view."** The literal subject of this spec.
  Worth noting what it does _not_ mean here: one control for every switcher would make
  `Sessions | Exercises` look like a density picker. One control per _question_ is the reading
  that survives.
- **"Keyboard first on desktop, touch-complete on phone."** Both halves: `⌘K` reaches every page
  by name, and the bar is tappable at 44px with no hover or right-click path required.
- **"A gesture nobody can see is not a discoverable action."** The reason the bar cannot be a
  dropdown or live only in the palette, and the reason it must not be pushed below the fold on a
  phone.
- **"Clarity over cleverness."** The argument against the rejected two-tier design: a rule that
  makes the author decide whether two destinations show "the same records" is a rule that will
  be decided differently each time.
- **"Progressive disclosure."** Why the bar renders only at ≥2 built pages. A tab strip with one
  tab is chrome that teaches nothing.
- **Accessibility exemption**, with its carve-out: skip ARIA coverage, but **hit-target size and
  touch reachability are not exempt**. `aria-current="page"` is kept because `Sidebar` already
  uses it and consistency in the markup is cheaper than an exception.

## `components/responsive.md`

- **"Adaptive, not shrunken"** and the **`md` = 48rem / 768px** line. The page bar is the same
  element in both layouts rather than two implementations — but below `md` it scrolls sideways
  and grows to a 44px target, because the compact layout has no command row to lean on and the
  bar is the _only_ path to a sibling page down there.
- **"44 × 44 px minimum below `md`… use `--tap-target`, not a hand-rolled height."** Applies to
  every tab in the bar.
- **"Never read `window.innerWidth` directly."** `PageBar` reads `usePathname()` and CSS
  breakpoints only; it takes no JS branch on width, so it server-renders correctly — the same
  trap `DayView`'s `PaneSwitch` documents (`useIsCompact()`'s server snapshot is `false`, so a
  JS branch would render the desktop shape and visibly swap on hydration).
- **The 390 × 844 checklist.** This spec adds a specific measurement to it: the chrome stack on
  `/schedule/day` is `MobileHeader` + page bar + `PaneSwitch` + lens row, and it is measured
  rather than assumed.

## `development/testing.md`

- **"Pure logic in `src/lib/**` — always."** Why the page registry and its resolvers live in
  `src/lib/navigation/pages.ts` rather than beside the modules in `src/components/shell/`. The
  bar is text-only, so the page data carries no React and the split costs nothing.
- **"Do not write React component tests."** `PageBar` gets none. It is wiring; it is verified in
  a real browser via `run-planner`.
- **"A test earns its place if it would fail on a plausible mistake."** The resolver is the one
  place here that qualifies: longest-declared-prefix is neither of the two rules a person would
  reach for first, and both of the obvious wrong answers (exact match, first segment) fail
  silently on a real route. Reserved-page and unknown-module fallbacks likewise.
- **"A green gate is not proof the app runs… after touching anything under `src/app/**`, run
  `npm run smoke`."** This spec adds, moves and redirects roughly a dozen routes, so smoke is
  mandatory, not optional. It discovers routes from the filesystem and follows redirects
  manually, so the new pages are covered for free and each `/day` → `/schedule/day` bounce shows
  as its own line.
- **No integration test.** Nothing here touches `mutations.ts` or `queries.ts`; the only storage
  change is a field inside the existing `user_settings` `shell` row.
