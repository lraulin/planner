# Overassigned Available — Shaping Notes

**Status: active**

## Scope

Add an **overassigned** scan state so Funded / On Track are no longer indistinguishable from
"assigned more than this month's ask." Use it on the Budget Available pill and in Fix This,
so the Un-assign list shows the same chrome as the tables.

### Out of scope

- Envelope arithmetic (Available is still leftover)
- Changing `neededAssigned` or Assign options
- Sorting Fix This by overassigned first
- Changing the default unassign amount (`min(Available, hole)`)
- Inspector copy
- Schema / a new pill color token
- Treating no-target leftover as overassigned (it stays `safe`)

## Decisions

See `plan.md` D1–D7. The ones that took the most argument:

- **Available, not Assigned.** Assigned is a plain number (funding-indicators D7). The pill
  and icon already live on Available. Fix This was showing a plain Available figure; that is
  the chrome to reuse.
- **Assigned > this month's ask**, not "any leftover on a funded envelope." A $140 bill with
  $140 assigned is on-target until the charge posts, even if Available is $140.
- **Sinking extra is overassigned.** On Track is exactly at the installment with pile
  remaining. Extra above the installment is raidable without missing this month.
- **Same green, new icon and `$X extra` copy.** A third positive color was rejected.

## Context

- **Visuals:** None. Existing Budget tokens (`--chart-income`, clock / check / pie / snooze).
- **References:** `envelopeIndicator` D4, `AvailablePill` / `FundingChrome`, `FixThisDialog`
  list, `neededAssigned`.
- **Product alignment:** Budget scan layer is YNAB-shaped; envelope math stays Actual. This
  is that vocabulary again.

## Standards Applied

- `components/ux-principles.md` — scan readable at a glance
- `components/modal-pattern.md` — Fix This stays ModalShell
- `components/responsive.md` — pill tap targets
- `development/testing.md`, `clean-code.md` — one pure indicator, tests beside it
