# Register calendar date presets — Shaping Notes

**Status: frozen / complete** (2026-09-04)

## Scope

Give the Register Date column its own month-oriented filter bands, default All Transactions to the current calendar month, and stop offering Achieve Planner deadline presets on that column.

The Date funnel is the shortcut. There is no new toolbar control, keyboard chord, or named view.

### Out of scope

- Posted column (stays on the Achieve `date` list)
- SQL `from` / `to` so the ledger is not loaded when a month band is on
- `(Last Year)`, `(Today)`, `(Yesterday)`, quarters, “last 3 months”
- Reseeding Uncategorized to This Month
- Changing Task / Project / Goal / Notes / Timeline deadline funnels
- Relative-date operands in Custom (`> today - 7d`) — still the follow-up from filter-control-per-kind

## Decisions

- **Separate band family, not extra entries on `DATE_PRESETS`.** Deadline language (Past, None, Next 14 Days) is wrong for a ledger. A new `FilterKind` (`calendar`) keeps `presetOptions` as the one place kind chooses bands, and leaves every existing `date` column alone.
- **Five bands.** This Month and Last Month are the budget unit. Last 7 / Last 30 cover “what just posted” without caring about month boundaries. This Year is the annual glance. Future, blanks, and “no date” are rare enough here that Custom is enough; none of thousands of existing rows are undated.
- **Inclusive rolling windows.** “Last 7 days” on a register means today and the six before it. Achieve’s `last-7-days` excludes today because it is a deadline window (“the previous 7 days”). Same option-id spelling, different kind, different matcher.
- **Always reseed All Transactions to This Month.** The point is not to remember Last 30 across visits and accidentally show thousands of rows. Named views and Activity URLs are the way a non-current window persists. Clear all vs Reset keep the views-as-settings meanings; the next All Transactions visit still reseeds Date.
- **No SQL window.** register-prepared-rows already decided the whole ledger loads and the prepared index narrows it. This slice only changes which band that pipeline applies. A DB date window is a later delta if the server still does too much work.
- **Activity stays absolute custom bounds.** Clicking July Activity in October must show July, not “Last Month” (September) and not “This Month.”

## Context

- **Visuals:** None. The existing Date column menu is the surface; only the named bands and the default chip change.
- **References:** See `references.md`. Actual Budget reports use This month / Last month / Last 30 days / This year as live ranges; our Register is a column funnel, not their report date picker.
- **Product alignment:** Register daily-use. Not a named roadmap item. Note at freeze under Financial planning. Achieve had no finance module — no fidelity obligation on these bands.

## Standards Applied

See `standards.md`.
