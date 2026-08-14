# Standards applied — Finances insights interactive reports

**Status: active**

The following standards apply. Full text lives at the path named; this file records _why_
each one is load-bearing here, matching the frozen insights spec's style.

---

## development/testing

`agent-os/standards/development/testing.md`

Filter, drill, window, trends, payees, Sankey aggregation, and assets-vs-debt are pure
logic in `src/lib/finances/**` with a `*.test.ts` beside each. A test earns its place if it
would fail on a plausible mistake: empty-means-all, a transfer that stays a transfer after
an account filter, a refund that nets off its category, YTD around 1 Jan, QTD around 1 Apr.

`loadInsightsRows` already has a cross-user case. If the query shape changes (adding
`accountKind`), that case still has to pass. New queries register in
`crossUserReads.integration.test.ts`. **No React component tests.**

---

## development/clean-code

`agent-os/standards/development/clean-code.md`

app → components → lib → db. Series math stays in `src/lib/finances/**`. Recharts and the
Sankey SVG renderer are presentation. `actions.ts` stays thin. No speculative generality:
the drill key is a small union, not a plugin.

---

## development/dates

`agent-os/standards/development/dates.md`

`transactionDate` is a `YYYY-MM-DD` string. YTD/QTD take the year and quarter from
`localDateKey()` (wall-clock today), never `toDateKey(new Date())` and never `startOfDay`.
Trailing windows still end on the last imported day. Day math goes through
`shiftDateKey` / existing month helpers.

---

## development/security

`agent-os/standards/development/security.md`

Every query takes `userId` and scopes on it. This spec adds no mutations. A dropped
`userId` on `loadInsightsRows` would hand over every description and amount at once —
already covered; keep it covered.

---

## development/commits

`agent-os/standards/development/commits.md`

One logical change each, imperative subject under 72 characters, not Conventional Commits,
a body wherever the diff is not self-evident, and the trailer:

`Spec: agent-os/specs/2026-08-13-2121-insights-interactive-reports`

No AI attribution.

---

## components/ux-principles

`agent-os/standards/components/ux-principles.md`

Clarity over cleverness: click a number, see the rows. Progressive disclosure: filters
collapse behind a control when unused. The Sankey does not claim dollars physically moved
from a paycheck to Groceries.

---

## components/responsive

`agent-os/standards/components/responsive.md`

Charts need hover **and** tap tooltips. Filter controls are 44px (`min-h-tap`) below `md`.
Dashboard cards already stack at `lg`; new panels follow that grid. Mobile keeps the audit
list in the same column, not a second pane.

---

## components/navigation

`agent-os/standards/components/navigation.md`

The insights page is already registered. This spec does not add a module or a command. A
local "see in register" control is page chrome, not a registry command — unless we later
need it from the menu bar, at which point it goes in the registry first.
