# Cancelled bill handling — Shaping Notes

**Status: active**

## Scope

Cancelled bills leave `/finances/budget` on their own when they are done (no Assigned,
Activity, or Available in the viewed month), stay while there is still money or a payment
in that month, reappear if a charge posts later, warn in the inspector when that happens,
and stop showing a next charge date. Show Hidden is the way back to a quiet cancelled row.
Hide envelope is not required for this.

### Out of scope

- Auto-assigning leftover out of a cancelled bill
- Auto-setting `hidden` on cancel
- Changing paused visibility
- Schema / `cancelledOn` changes
- Marking `(cancelled)` in the Register picker
- Omitting cancelled from Move money / Assign Manual destination catalogs
- Renaming the Show hidden switch
- Dashboard / Next 12 months / Expected vs income (already skip cancelled for
  forward-looking figures)

## Decisions

- **D1** Derived visibility from `status === 'cancelled'` plus this month’s money columns.
  No new flag, no auto-`hidden`.
- **D2** Quiet = Assigned, Activity, and Available all $0. Leftover Available (including
  carry-in) keeps the row so dollars can be moved out. A payment already in the month keeps
  it; the next $0 month drops it.
- **D3** Show Hidden also reveals quiet cancelled bills (same switch, same label). Revealed
  quiet rows use hidden-envelope name chrome (italic / faint).
- **D4** A later charge reappears via non-zero Activity. Payee claims still file.
- **D5** Inspector warning only: “A charge posted after this bill was cancelled.” Status
  stays Cancelled. No extra row chrome. Overspend red on Available is already there.
- **D6** No next charge date or editor for cancelled. Do not clear stored `anchorDate`.
  Paused still shows and edits next charge (bill-next-charge D5, narrowed).
- **D7** Grid omit, not totals omit. Fix This / cover-from still drain leftover. Register
  still lists cancelled bills.

Activity for D2/D5 is the **Activity column** (cents ≠ 0), not “any transaction this
month.” A charge fully refunded in the same month nets to $0 and would disappear unless
Show Hidden is on.

## Context

- **Visuals:** None
- **References:** See `references.md`
- **Product alignment:** Phase 3 Finances (beyond Achieve). Actual formulas and
  YNAB-shaped Assign unchanged. Cancelled already stops the ask, accrual, and forecast;
  this only changes Budget visibility and next-charge display. Hide remains how you retire
  a non-bill envelope.
- **Shaping session:** Grok `/shape-spec`. User confirmed: money-column visibility; Show
  Hidden reveals quiet cancelled bills; inspector warning (not row chrome); no mockups.

## Standards Applied

See `standards.md`.
