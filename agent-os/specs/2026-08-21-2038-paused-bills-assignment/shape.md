# Paused bills and assignment visualization — Shaping Notes

**Status: frozen / complete** (2026-08-21)

## Scope

Two dashboard/commitments gaps found while funding propane and reading a −$1,100 available-to-spend:

1. **Pause** a bill that might not get paid (house move) without cancelling it or lying that it is still held.
2. **Show where checking is assigned** as a picture, not only a five-line list.

Catch-up accrual stays. Unscheduled stays a stated flag. Amount ranges stay measured, not declared.

### Out of scope

- YNAB envelopes / every-dollar assignment / tier-3 buckets
- Accrue-forward-only or a typed “keep $X on hand”
- Pause on recurring spend
- Inferring unscheduled from gap irregularity
- Changing `setAsideHeld` math
- Auto-migrating Gas (Taylor) to unscheduled/paused

## Decisions

- Catch-up on declare is the YNAB truth the user just valued; do not soften it.
- `paused` is a fourth status, not a Hold checkbox (that flag was deleted because nobody could tell it from Status).
- Dashboard must stop printing a due date for unscheduled bills — the unscheduled spec already forbade this on Upcoming; the Bills panel missed it.
- Assignment bar is composition of the existing available-to-spend terms against checking. Insights `CategoryBars` rejects stacked bars for _ranking_; this question is _parts of one pile_.
- Rent splits out at ≥ 40% of bill hold because that is the $2,100 currently hiding inside $3,162. Other bills stay one segment; the Bills list is the drill-in.

## Context

- **Visuals:** None. Designed from the live dashboard arithmetic (checking $3,355, bills $3,162, shortfall ~$1,125).
- **References:** See `references.md`.
- **Product alignment:** Roadmap envelopes item stays closed. Commitments D0 (no cadence → no bucket) is untouched.

## Standards Applied

- `development/testing.md` — pure assignment/caption/range logic beside `src/lib`; DB tests include a second user pausing the first user's bill; no React component tests
- `development/dates.md` — no new calendar arithmetic; `todayKey` still from `useToday`
- `development/clean-code.md` — math in `src/lib/finances`, not the dashboard component; thin actions
- `components/ux-principles.md` — clarity over cleverness; progressive disclosure (bar then the existing `dl`)
- `database/migrations.md` — `db:generate` for the status CHECK; never hand-write without snapshot
- `api/agent-tools.md` — strict schema; adding `paused` is a deliberate enum break
- `development/security.md` — `userId` on the status write; second-user case
